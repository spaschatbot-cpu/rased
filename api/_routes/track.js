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
import { handler, readJson, ok, fail } from '../_lib/http.js'
import { requireRole } from '../_lib/auth.js'
import { findById } from '../_lib/users.js'
import { clear } from '../_lib/positions.js'
import { resetState } from '../_lib/alerts.js'
import { ingest, MAX_BATCH, prepare } from '../_lib/ingest.js'
import { close as closeShift } from '../_lib/shifts.js'

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

export default handler({
  async POST(req, res) {
    const driver = await driverOf(req)
    const body = await readJson(req)

    /* A phone with no signal buffers its fixes and sends them in one go, so
       accept either a single fix or a batch. */
    const points = Array.isArray(body.points) ? body.points : [body]
    if (!points.length) return fail(res, 400, 'no points')
    if (points.length > MAX_BATCH) return fail(res, 400, 'too many points in one batch')

    const { valid, rejected } = prepare(points)
    if (!valid.length) return fail(res, 400, 'no usable fix in this request')

    const { recorded, alerts, status } = await ingest(driver.vehicleId, valid, driver)

    return ok(res, {
      ok: true,
      accepted: valid.length,
      rejected,
      /* how many of them the trail actually kept. `accepted` says the fixes were
         understood and became the live position; this says they were written to
         the day's record. They differ when a point lands within the trail's
         minimum gap of one already stored, and a client that cannot see the
         difference cannot tell a thinned batch from a lost one. */
      recorded,
      vehicleId: driver.vehicleId,
      status,
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
