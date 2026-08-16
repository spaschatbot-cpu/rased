/**
 * Reports, computed from the recorded trail.
 *
 *   GET ?type=&from=&to=&vehicles=1,2,3
 *
 * Every number here is derived from points a vehicle actually reported. That is
 * the whole difference from what this screen used to show: a report over a day
 * with no trail comes back empty, because nothing happened that we recorded —
 * rather than filled with plausible figures nobody can act on.
 *
 * Types:
 *   general — one row per vehicle: totals for the range
 *   driving — one row per trip
 *   speed   — one row per speeding episode
 *   sfda    — cold-chain temperatures; only rows for fixes that carried one
 */
import { handler, ok } from '../_lib/http.js'
import { requireUser } from '../_lib/auth.js'
import { badRequest, query } from '../_lib/collection.js'
import { dayOf, pointsFor, summarise } from '../_lib/history.js'
import { clockOf } from '../../shared/clock.js'
import { MOVING_KMH } from '../../shared/trail-math.js'
import { reverse } from '../_lib/geocode.js'
import { vehicles as registry } from '../_lib/vehicles.js'
import { rules, rulesFor } from '../_lib/rules.js'
import { findById } from '../_lib/users.js'

export const TYPES = ['general', 'driving', 'speed', 'sfda']

/** Longest range one request may cover — a year of trails is not a web request. */
const MAX_DAYS = 92

/** `HH:MM` on the Saudi clock — the time the driver would name. */
const clock = clockOf

/** Every date from `from` to `to`, inclusive. */
function dateRange(from, to) {
  const days = []
  for (let t = Date.parse(from); t <= Date.parse(to); t += 864e5) days.push(dayOf(t))
  return days
}

/* ── the four reports ────────────────────────────────────────────── */

/**
 * Speeding episodes: runs of consecutive points over the limit, collapsed into
 * one row each. Reporting every point over the limit would turn a single fast
 * motorway stretch into forty violations.
 */
function speedingRuns(points, limit) {
  const runs = []
  let open = null

  for (const p of points) {
    if (p.speed > limit) {
      if (!open) open = { from: p.at, to: p.at, peak: p.speed, lat: p.lat, lng: p.lng }
      else {
        open.to = p.at
        if (p.speed > open.peak) {
          open.peak = p.speed
          open.lat = p.lat
          open.lng = p.lng
        }
      }
    } else if (open) {
      runs.push(open)
      open = null
    }
  }
  if (open) runs.push(open)
  return runs
}

/**
 * The speed a vehicle is judged against.
 *
 * The active speeding rules come first — they are what the operator configured
 * and what filled the alert inbox, so a report using a different number would
 * disagree with the alerts about the same journey. The strictest applicable
 * rule wins; with no rule at all the vehicle's own posted limit stands.
 */
function limitFor(vehicle, rules) {
  const thresholds = rulesFor(rules, 'speed', vehicle.id)
    .map((r) => r.threshold)
    .filter((n) => Number.isFinite(n))

  return thresholds.length ? Math.min(...thresholds) : (vehicle.speedLimit ?? 120)
}

function generalRow(vehicle, points, limit) {
  const { stats, stops } = summarise(points)
  const violations = speedingRuns(points, limit).length

  return {
    id: `${vehicle.id}-g`,
    vehicleId: vehicle.id,
    plate: vehicle.plate,
    distance: stats.totalDistance,
    engineHours: Number((stats.drivingMin / 60).toFixed(1)),
    maxSpeed: stats.maxSpeed,
    avgSpeed: Math.round(stats.avgSpeed),
    stops: stops.length,
    violations,
    idleMin: stats.idleMin,
  }
}

/**
 * Brief halts inside one trip.
 *
 * A trip is a run of movement, so the day's *stops* all fall between trips, not
 * inside one — which is why this column used to be a hardcoded zero. What a
 * driver means by "stops on that journey" is the traffic lights and the pauses
 * at the gate: the standing-still stretches short enough that `segment` folded
 * them into the drive rather than calling them a stop of their own. Counting
 * runs of stationary fixes between the trip's own endpoints finds exactly those.
 */
function pausesIn(points, trip) {
  let count = 0
  let standing = false
  for (let i = trip.from; i <= trip.to; i++) {
    const still = points[i].speed <= MOVING_KMH
    if (still && !standing) count += 1
    standing = still
  }
  return count
}

const drivingRows = (vehicle, points) => {
  const { trips } = summarise(points)
  return trips.map((trip, k) => ({
    id: `${vehicle.id}-${trip.startAt}-${k}`,
    vehicleId: vehicle.id,
    plate: vehicle.plate,
    start: clock(trip.startAt),
    end: clock(trip.endAt),
    durationMin: trip.durationMin,
    distance: Number(trip.distance.toFixed(1)),
    maxSpeed: trip.maxSpeed,
    stops: pausesIn(points, trip),
  }))
}

function speedRows(vehicle, points, limit) {
  return speedingRuns(points, limit).map((run, k) => {
    const where = `${run.lat.toFixed(5)}, ${run.lng.toFixed(5)}`
    return {
      id: `${vehicle.id}-s${run.from}-${k}`,
      vehicleId: vehicle.id,
      plate: vehicle.plate,
      at: clock(run.from),
      speed: run.peak,
      limit,
      durationSec: Math.max(1, Math.round((new Date(run.to) - new Date(run.from)) / 1000)),
      lat: run.lat,
      lng: run.lng,
      /* named below, once the whole report's coordinates can be looked up
         together; these stand in when a lookup finds nothing */
      addressAr: where,
      addressEn: where,
    }
  })
}

/**
 * Name the place each speeding row happened at.
 *
 * "137 كم/س عند 25.26674, 46.87917" is a number an operator cannot act on;
 * "طريق القصيم السريع" is one they can. The geocoder is shared with the driver
 * app and caches on rounded coordinates, so repeat offences on the same stretch
 * cost nothing after the first.
 *
 * Two limits keep a report a web request. Rows are deduplicated by rounded
 * coordinate — one lookup names every violation in the same 11-metre square —
 * and the number of lookups is capped, because Nominatim allows roughly one per
 * second and a hundred-violation month would otherwise spend two minutes
 * waiting. Rows past the cap keep their coordinates, which is what the whole
 * column used to be.
 */
const MAX_LOOKUPS = 12

async function nameLocations(rows) {
  const seen = new Map()

  for (const row of rows) {
    const key = `${row.lat.toFixed(4)},${row.lng.toFixed(4)}`
    if (!seen.has(key)) {
      if (seen.size >= MAX_LOOKUPS) continue
      /* sequential on purpose: the geocoder paces itself against one shared
         clock, which concurrent callers would all read before any of them
         had moved it */
      seen.set(key, await reverse(row.lat, row.lng))
    }

    const place = seen.get(key)
    if (place?.ar) row.addressAr = place.ar
    if (place?.en) row.addressEn = place.en
  }

  return rows
}

/** Cold-chain rows exist only where a device actually reported a temperature. */
const sfdaRows = (vehicle, points) =>
  points
    .filter((p) => p.temperature != null)
    .map((p, k) => ({
      id: `${vehicle.id}-t${k}`,
      vehicleId: vehicle.id,
      plate: vehicle.plate,
      at: clock(p.at),
      temperature: p.temperature,
      humidity: p.humidity ?? null,
      compliant: p.temperature >= 2 && p.temperature <= 8,
    }))

/* ── the endpoint ────────────────────────────────────────────────── */

export default handler({
  async GET(req, res) {
    const caller = requireUser(req)
    const params = query(req)

    const type = params.get('type') || 'general'
    if (!TYPES.includes(type)) throw badRequest(`type must be one of ${TYPES.join(', ')}`)

    const from = params.get('from') || dayOf()
    const to = params.get('to') || from
    for (const d of [from, to]) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw badRequest('from and to must be YYYY-MM-DD')
    }
    if (Date.parse(from) > Date.parse(to)) throw badRequest('from must not be after to')

    const days = dateRange(from, to)
    if (days.length > MAX_DAYS) throw badRequest(`range may not exceed ${MAX_DAYS} days`)

    /* which vehicles: what was asked for, narrowed to what this caller may see.
       An absent or empty parameter means the whole fleet — note that splitting
       '' yields [''], which numbers to 0, so ids must be filtered for truth
       rather than for finiteness or the fleet silently empties. */
    const asked = (params.get('vehicles') || '')
      .split(',')
      .map(Number)
      .filter((id) => Number.isFinite(id) && id > 0)

    let fleet = await registry.all()
    if (asked.length) fleet = fleet.filter((v) => asked.includes(v.id))
    if (caller.r === 'driver') {
      const driver = await findById(caller.i)
      fleet = fleet.filter((v) => v.id === driver?.vehicleId)
    }

    const build = { general: generalRow, driving: drivingRows, speed: speedRows, sfda: sfdaRows }[type]
    const ruleList = await rules.all()

    const rows = []
    for (const vehicle of fleet) {
      /* the trail is stored per day, so a multi-day range is a concatenation —
         and `general` sums the whole range into one row per vehicle */
      const points = (await Promise.all(days.map((d) => pointsFor(vehicle.id, d)))).flat()
      if (!points.length && type !== 'general') continue

      const out = build(vehicle, points, limitFor(vehicle, ruleList))
      rows.push(...(Array.isArray(out) ? out : [out]))
    }

    /* after the whole fleet is in, so one lookup can name the same junction for
       every vehicle that was caught at it */
    if (type === 'speed') await nameLocations(rows)

    return ok(res, {
      ok: true,
      type,
      from,
      to,
      days: days.length,
      vehicles: fleet.map((v) => ({ id: v.id, plate: v.plate })),
      rows,
      /* the driver app reports no temperature probe, so this stays empty until
         a device that has one is fitted — say so instead of showing zero rows
         as though the fleet were compliant */
      unsupported: type === 'sfda' && !rows.length ? 'no temperature-capable device reported in this range' : null,
    })
  },
})
