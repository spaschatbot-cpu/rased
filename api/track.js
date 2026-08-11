/**
 * Where a tracker reports in.
 *
 *   POST   — record a fix. Drivers only; the vehicle comes from the account,
 *            never from the request, so a driver cannot report as someone else.
 *   DELETE — end the shift and drop the vehicle off the live map.
 *
 * One fix does five things, in this order: it becomes the vehicle's live
 * position, it is appended to the day's trail, it advances the odometer and
 * engine hours, it is put to the alert rules, and it opportunistically prunes
 * trails past the retention window.
 *
 * Only the first of those may fail the request. A driver's position must land
 * even if a malformed rule throws — losing the fix to protect the bookkeeping
 * would be the wrong way round.
 *
 * The driver app authenticates with `Authorization: Bearer <token>` from
 * `POST /api/auth/login` with `client: "app"`.
 */
import { handler, readJson, ok, fail } from './_lib/http.js'
import { requireRole } from './_lib/auth.js'
import { findById } from './_lib/users.js'
import { clear, record, statusOf, timeOf, validate } from './_lib/positions.js'
import { append, prune } from './_lib/history.js'
import { process, resetState } from './_lib/alerts.js'
import { distance, geofences } from './_lib/geofences.js'
import { rules } from './_lib/rules.js'
import { vehicles } from './_lib/vehicles.js'
import { close as closeShift, noteFix } from './_lib/shifts.js'

/** The signed-in driver and the vehicle they are assigned to. */
async function driverOf(req) {
  const claims = requireRole(req, ['driver'])
  const driver = await findById(claims.i)

  if (!driver || !driver.active) {
    const err = new Error('account is disabled')
    err.statusCode = 403
    throw err
  }
  if (!driver.vehicleId) {
    const err = new Error('no vehicle assigned to this driver')
    err.statusCode = 409
    throw err
  }
  return driver
}

/**
 * How far the vehicle travelled between two fixes, and how long that took.
 *
 * A gap longer than fifteen minutes is not credited: the vehicle was out of
 * signal, and the straight line between where it vanished and where it
 * reappeared is not a distance it drove.
 */
const MAX_CREDITED_GAP_MS = 15 * 60 * 1000

function travelled(fix, previous) {
  if (!previous) return null
  const gap = new Date(fix.at) - new Date(previous.at)
  if (gap <= 0 || gap > MAX_CREDITED_GAP_MS) return null

  const km = distance(previous, fix) / 1000
  return km < 0.01 ? null : { km, hours: gap / 3600000 }
}

/** Everything the alert engine needs, fetched once per request. */
const context = async (vehicleId) => {
  const [zones, ruleList, vehicle] = await Promise.all([
    geofences.all(),
    rules.all(),
    vehicles.find(vehicleId),
  ])
  return { zones, rules: ruleList, vehicle }
}

export default handler({
  async POST(req, res) {
    const driver = await driverOf(req)
    const body = await readJson(req)

    /* A phone with no signal buffers its fixes and sends them in one go, so
       accept either a single fix or a batch and keep the newest. */
    const points = Array.isArray(body.points) ? body.points : [body]
    if (!points.length) return fail(res, 400, 'no points')
    if (points.length > 200) return fail(res, 400, 'too many points in one batch')

    /* Order matters for a buffered batch: the points are replayed oldest first
       so the trail, the odometer and the alert engine each see the journey in
       the order it was driven, not in whatever order the phone flushed it. */
    const valid = []
    for (const point of points) {
      const { error, fix } = validate(point)
      if (!error) valid.push(fix)
    }
    if (!valid.length) return fail(res, 400, 'no usable fix in this request')
    valid.sort((a, b) => Date.parse(timeOf(a)) - Date.parse(timeOf(b)))

    let saved = null
    let previous = null
    let first = true

    for (const fix of valid) {
      const result = await record(driver.vehicleId, fix, driver)
      /* the state before this batch began, then each point in turn */
      if (first) {
        previous = result.previous
        first = false
      }
      saved = result.fix
    }

    /* everything past this point is bookkeeping: log it and move on */
    let alerts = 0
    let recorded = 0
    try {
      const { zones, rules: ruleList, vehicle } = await context(driver.vehicleId)
      let prior = previous
      let km = 0
      let hours = 0

      for (const fix of valid) {
        const stored = { ...fix, at: timeOf(fix), vehicleId: driver.vehicleId }
        if (await append(driver.vehicleId, stored)) recorded += 1

        /* the shift record is folded in here, inside the bookkeeping block, so
           a failure in it can never cost the driver their position */
        await noteFix(driver, stored)

        if (vehicle) {
          const leg = travelled(stored, prior)
          if (leg) {
            km += leg.km
            hours += leg.hours
          }
          const fired = await process(stored, prior, { vehicle, zones, rules: ruleList, driver })
          alerts += fired.length
        }
        prior = stored
      }

      /* one write for the whole batch — patching per point would each time
         re-apply the increment to the same stale snapshot and lose the rest */
      if (vehicle && km > 0) {
        await vehicles.patch(vehicle.id, {
          odometer: Math.round((vehicle.odometer ?? 0) + km),
          engineHours: Number(((vehicle.engineHours ?? 0) + hours).toFixed(2)),
        })
      }

      /* cheap when there is nothing stale, which is almost always */
      await prune(driver.vehicleId)
    } catch (err) {
      console.error('[track] post-ingest step failed:', err)
    }

    return ok(res, {
      ok: true,
      accepted: valid.length,
      rejected: points.length - valid.length,
      /* how many of them the trail actually kept. `accepted` says the fixes were
         understood and became the live position; this says they were written to
         the day's record. They differ when a point lands within the trail's
         minimum gap of one already stored, and a client that cannot see the
         difference cannot tell a thinned batch from a lost one. */
      recorded,
      vehicleId: driver.vehicleId,
      status: statusOf(saved),
      alerts,
    })
  },

  async DELETE(req, res) {
    const driver = await driverOf(req)
    await clear(driver.vehicleId)
    /* forget what was true during the shift, so tomorrow's first fix is not
       compared against a state hours out of date */
    await resetState(driver.vehicleId).catch(() => {})

    /* this is the only clean clock-out the system ever sees; everything else is
       inferred from silence, so it is worth recording as the real thing */
    const shift = await closeShift(driver.id).catch(() => null)

    return ok(res, { ok: true, vehicleId: driver.vehicleId, shift })
  },
})
