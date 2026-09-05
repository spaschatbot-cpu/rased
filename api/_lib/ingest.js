/**
 * What happens to a batch of fixes once we believe them.
 *
 * Extracted from the driver route because a hardware tracker has to land in
 * exactly the same place. Two ingest paths that drift apart would mean a
 * vehicle's history depends on which device recorded it — the trail thinned by
 * one rule and not the other, an alert that fires for a phone and not for a
 * Teltonika. Everything below is therefore shared, and the callers differ only
 * in how they prove which vehicle is speaking.
 *
 * One fix does five things, in this order: it becomes the vehicle's live
 * position, it is appended to the day's trail, it advances the odometer and
 * engine hours, it is put to the alert rules, and it opportunistically prunes
 * trails past the retention window.
 *
 * Only the first of those may fail the caller. A position must land even if a
 * malformed rule throws — losing the fix to protect the bookkeeping would be
 * the wrong way round.
 */
import { record, statusOf, timeOf, validate } from './positions.js'
import { append, prune } from './history.js'
import { process as runRules } from './alerts.js'
import { distance, geofences } from './geofences.js'
import { rules } from './rules.js'
import { vehicles } from './vehicles.js'
import { noteFix } from './shifts.js'

export const MAX_BATCH = 200

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

/** Everything the alert engine needs, fetched once per batch. */
const context = async (vehicleId) => {
  const [zones, ruleList, vehicle] = await Promise.all([
    geofences.all(),
    rules.all(),
    vehicles.find(vehicleId),
  ])
  return { zones, rules: ruleList, vehicle }
}

/** Drop what is not a usable fix, oldest first. Returns `{ valid, rejected }`. */
export function prepare(points) {
  const valid = []
  for (const point of points) {
    const { error, fix } = validate(point)
    if (!error) valid.push(fix)
  }
  /* Order matters for a buffered batch: the points are replayed oldest first so
     the trail, the odometer and the alert engine each see the journey in the
     order it was driven, not in whatever order the device flushed it. */
    valid.sort((a, b) => Date.parse(timeOf(a)) - Date.parse(timeOf(b)))
  return { valid, rejected: points.length - valid.length }
}

/**
 * `driver` is the account a phone signed in as, and is null for a tracker
 * bolted to the vehicle — nobody is signed in, so there is no shift to note
 * and no name to attach to the fix.
 */
export async function ingest(vehicleId, valid, driver = null) {
  let saved = null
  let previous = null
  let first = true

  for (const fix of valid) {
    const result = await record(vehicleId, fix, driver)
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
    const { zones, rules: ruleList, vehicle } = await context(vehicleId)
    let prior = previous
    let km = 0
    let hours = 0

    for (const fix of valid) {
      const stored = { ...fix, at: timeOf(fix), vehicleId }
      if (await append(vehicleId, stored)) recorded += 1

      /* the shift record is folded in here, inside the bookkeeping block, so a
         failure in it can never cost the driver their position */
      if (driver) await noteFix(driver, stored)

      if (vehicle) {
        const leg = travelled(stored, prior)
        if (leg) {
          km += leg.km
          hours += leg.hours
        }
        const fired = await runRules(stored, prior, { vehicle, zones, rules: ruleList, driver })
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
    await prune(vehicleId)
  } catch (err) {
    console.error('[ingest] post-ingest step failed:', err)
  }

  return { recorded, alerts, status: statusOf(saved) }
}
