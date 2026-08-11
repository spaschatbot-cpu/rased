/**
 * The position trail — what a vehicle did earlier today, and on earlier days.
 *
 * One list per vehicle per day (`trail:<vehicleId>:<YYYY-MM-DD>`). That split is
 * the whole design: the replay screen and every report ask for exactly one
 * vehicle on exactly one day, so a read is one key, and yesterday's data never
 * has to be loaded to answer a question about today.
 *
 * The day is a **Saudi** day, not a UTC one — see `shared/clock.js`. A night
 * shift that crosses midnight in Riyadh used to be split across two trail keys
 * three hours before the driver would call it a new day.
 *
 * Points are capped per day. A vehicle reporting every 30 seconds produces
 * ~2,900 points in 24 hours; the cap sits above that with room for a device
 * that reports faster, and drops the oldest of the day rather than refusing to
 * record the newest.
 */
import { del, get, mutate } from './store.js'
import { MOVING_KMH, measureRun } from '../../shared/trail-math.js'
import { dayOf } from '../../shared/clock.js'

/** Days of trail kept before a day is dropped. */
export const RETENTION_DAYS = 30

/** Hard ceiling on points stored for one vehicle in one day. */
const MAX_POINTS_PER_DAY = 5000

/** Minimum gap between stored points — a device pinging every second would
 *  otherwise fill a day's budget by lunchtime without adding any detail. */
const MIN_GAP_MS = 10000

/**
 * Where a fix belongs in a day already recorded, keeping the list oldest-first.
 *
 * Scans from the end because a fix that arrives in real time belongs at the
 * end: the common case costs one comparison, and only a backfilled point walks
 * any distance.
 */
function placeFor(points, at) {
  let i = points.length
  while (i > 0 && Date.parse(points[i - 1].at) > at) i -= 1
  return i
}

const dayKey = (vehicleId, date) => `trail:${vehicleId}:${date}`
const indexKey = (vehicleId) => `trail-days:${vehicleId}`

/**
 * `YYYY-MM-DD` on the Saudi clock — the day boundary the whole platform uses.
 *
 * Re-exported so the modules that already ask history for a day keep asking it,
 * while the definition lives in one shared file with the browser.
 */
export { dayOf }

/**
 * Record one fix in its day's trail.
 *
 * The list is kept in the order the vehicle drove, not the order the network
 * delivered. A phone that loses signal keeps its fixes on disk and flushes them
 * when it comes back, and that flush can easily land *after* fixes stamped
 * later — a second device on the same vehicle, a retried batch, a clock that
 * corrects itself. Appending blindly would leave the day out of order, and
 * every reader here computes distance and duration from the gap between
 * consecutive points: one point in the wrong place turns a journey into a
 * negative leg. So the fix is inserted where its timestamp says it belongs.
 *
 * The minimum gap is judged against the neighbours it lands between, not
 * against whatever arrived last. That keeps the rule doing its actual job —
 * thinning a device that pings every second — without discarding an hour of
 * driving whose only fault is that it reached us late.
 *
 * Returns the point that was stored, or `null` when it was too close to a fix
 * the day already holds.
 */
export async function append(vehicleId, fix) {
  const at = fix.at ?? new Date().toISOString()
  const date = dayOf(at)
  const key = dayKey(vehicleId, date)
  const stamp = Date.parse(at)

  const point = {
    lat: fix.lat,
    lng: fix.lng,
    speed: fix.speed ?? 0,
    heading: fix.heading ?? 0,
    battery: fix.battery ?? null,
    /* sensors a device may or may not carry. Stored only when one actually
       reported — the cold-chain report is built from these, and dropping them
       here left it permanently empty however good the hardware was. */
    ...(fix.temperature == null ? {} : { temperature: fix.temperature }),
    ...(fix.humidity == null ? {} : { humidity: fix.humidity }),
    at,
  }

  const stored = await mutate(key, (current) => {
    const points = Array.isArray(current) ? current : []
    const i = placeFor(points, stamp)

    const before = points[i - 1]
    const after = points[i]
    if (before && stamp - Date.parse(before.at) < MIN_GAP_MS) return undefined
    if (after && Date.parse(after.at) - stamp < MIN_GAP_MS) return undefined

    points.splice(i, 0, point)
    /* oldest first, so trimming the front keeps the most recent history */
    return points.length > MAX_POINTS_PER_DAY ? points.slice(-MAX_POINTS_PER_DAY) : points
  })

  if (stored === undefined) return null
  await noteDay(vehicleId, date)
  return point
}

/**
 * Remember which days this vehicle has a trail for.
 *
 * Without it, answering "which days can I replay?" means scanning keys, which
 * the Redis driver has no cheap way to do. The index doubles as the retention
 * list: days that fall off it are the days to delete.
 */
async function noteDay(vehicleId, date) {
  await mutate(indexKey(vehicleId), (current) => {
    const days = Array.isArray(current) ? current : []
    if (days[0] === date) return undefined // the common case: same day as last fix
    if (days.includes(date)) return undefined
    return [date, ...days].sort().reverse().slice(0, RETENTION_DAYS)
  })
}

/** Days this vehicle has a trail for, newest first. */
export const daysFor = async (vehicleId) => (await get(indexKey(vehicleId))) ?? []

/** Raw points for one vehicle on one day, oldest first. */
export const pointsFor = async (vehicleId, date) => (await get(dayKey(vehicleId, date))) ?? []

/* ── derived views ───────────────────────────────────────────────── */

/** Fewest points a run needs before it counts as a real trip or a real stop. */
const MIN_RUN = 3

/**
 * Runs of consecutive points on the same side of the moving threshold, with the
 * too-short ones folded into their neighbours.
 *
 * The folding is the part that matters. A single slow fix in the middle of a
 * motorway run — a GPS blip, a set of traffic lights, a moment behind a lorry —
 * used to be dropped for being shorter than three points, but dropping it left
 * the drive on either side of it as two separate runs. A day's honest four
 * journeys came out as seventeen "trips", and the screen counted them.
 *
 * Flipping a short run to its neighbours' side merges the three into one, so
 * each fold strictly reduces the number of runs and the loop always ends.
 */
function runsOf(points) {
  let runs = []
  points.forEach((p, i) => {
    const moving = p.speed > MOVING_KMH
    const open = runs[runs.length - 1]
    if (!open || open.moving !== moving) runs.push({ moving, from: i, to: i })
    else open.to = i
  })

  const length = (r) => r.to - r.from + 1

  /* fold the shortest offender, join what it separated, and look again */
  while (runs.length > 1) {
    const i = runs.findIndex((r) => length(r) < MIN_RUN)
    if (i < 0) break

    const merged = []
    for (const run of runs) {
      const mode = run === runs[i] ? !run.moving : run.moving
      const last = merged[merged.length - 1]
      if (last && last.moving === mode) last.to = run.to
      else merged.push({ moving: mode, from: run.from, to: run.to })
    }
    runs = merged
  }

  return runs
}

/**
 * Split a day's points into trips and stops.
 *
 * A trip is a run of movement; a stop is a run of standing still. Blips too
 * short to be either are folded into whatever surrounds them by `runsOf`, so
 * what comes back is the shape of the day rather than the shape of the signal.
 */
export function segment(points) {
  if (!points.length) return { trips: [], stops: [] }

  const spans = runsOf(points).map((run) => measureRun(points, run.from, run.to, run.moving))

  /* the only survivor of the old length filter: a whole day of one or two
     points is not a journey, and there is nothing left to fold it into */
  const real = spans.filter((s) => s.points >= MIN_RUN)

  return {
    trips: real.filter((s) => s.moving),
    stops: real.filter((s) => !s.moving),
  }
}

/** Totals for one day: distance, top and average speed, time on the move. */
export function summarise(points) {
  const { trips, stops } = segment(points)
  const moving = points.filter((p) => p.speed > MOVING_KMH)

  const totalDistance = trips.reduce((s, t) => s + t.distance, 0)
  const drivingMin = trips.reduce((s, t) => s + t.durationMin, 0)
  const idleMin = stops.reduce((s, t) => s + t.durationMin, 0)

  return {
    trips,
    stops,
    stats: {
      points: points.length,
      totalDistance: Number(totalDistance.toFixed(1)),
      maxSpeed: points.reduce((m, p) => Math.max(m, p.speed), 0),
      avgSpeed: moving.length
        ? Number((moving.reduce((s, p) => s + p.speed, 0) / moving.length).toFixed(1))
        : 0,
      durationMin: points.length
        ? Math.round((new Date(points[points.length - 1].at) - new Date(points[0].at)) / 60000)
        : 0,
      drivingMin,
      idleMin,
      firstAt: points[0]?.at ?? null,
      lastAt: points[points.length - 1]?.at ?? null,
    },
  }
}

/** A whole day for one vehicle: the track, its segments and its totals. */
export async function dayFor(vehicleId, date) {
  const points = await pointsFor(vehicleId, date)
  return { vehicleId: Number(vehicleId), date, points, ...summarise(points) }
}

/**
 * Drop trails older than the retention window.
 *
 * Called opportunistically from the ingest path rather than on a schedule —
 * there is no cron on the free tier, and a vehicle that is reporting is exactly
 * the vehicle whose old days are worth clearing.
 */
export async function prune(vehicleId) {
  const days = await daysFor(vehicleId)
  const cutoff = dayOf(new Date(Date.now() - RETENTION_DAYS * 864e5))
  const stale = days.filter((d) => d < cutoff)
  if (!stale.length) return 0

  for (const d of stale) await del(dayKey(vehicleId, d))
  await mutate(indexKey(vehicleId), (current) =>
    (Array.isArray(current) ? current : []).filter((d) => d >= cutoff),
  )
  return stale.length
}
