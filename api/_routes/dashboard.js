/**
 * The mobile control panel, for a date range, in one request.
 *
 *   GET ?from=YYYY-MM-DD&to=YYYY-MM-DD — defaults to today; at most 31 days
 *
 * Every figure here comes from what the fleet actually recorded: the trails
 * (distance, driving and stop time, trips, speeds), the alert inbox (speeding,
 * long stops, zones, SOS, battery) and the maintenance plan. Nothing is
 * estimated — a day nobody drove is zero, and a range with no driving and no
 * events has no safety score at all rather than a flattering 100.
 */
import { handler, ok } from '../_lib/http.js'
import { requireUser } from '../_lib/auth.js'
import { badRequest, query } from '../_lib/collection.js'
import { vehicles as registry } from '../_lib/vehicles.js'
import { allPositions, statusOf } from '../_lib/positions.js'
import { summarise, trailKey } from '../_lib/history.js'
import { alertDayKey, inbox } from '../_lib/alerts.js'
import { mget } from '../_lib/store.js'
import { decorate, maintenance } from '../_lib/maintenance.js'
import { dayOf } from '../../shared/clock.js'

const MAX_DAYS = 31
const DAY = /^\d{4}-\d{2}-\d{2}$/

/** A stop at least this long counts as a long stop, read straight off the trail. */
const LONG_STOP_MIN = 20

/** How much one event of each kind costs the safety score, per 100 km driven. */
const WEIGHTS = { speed: 4, idle: 1, geofenceOut: 2, sos: 10, lowBattery: 0.5, power: 2 }

const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10)

function daysBetween(from, to) {
  const out = []
  for (let d = from; d <= to && out.length < MAX_DAYS; d = addDays(d, 1)) out.push(d)
  return out
}

/**
 * 100 minus the weighted events per 100 km, times five. A short distance is
 * floored at 10 km so one event on a 2 km errand does not read as a disaster.
 * `null` when there is nothing to judge.
 */
function scoreOf(events, km) {
  const weighted = Object.entries(WEIGHTS).reduce((s, [type, w]) => s + (events[type] ?? 0) * w, 0)
  if (km <= 0 && weighted === 0) return null
  const per100 = (weighted / Math.max(km, 10)) * 100
  return Math.max(0, Math.min(100, Math.round(100 - per100 * 5)))
}

const emptyEvents = () => ({ speed: 0, idle: 0, idleMinutes: 0, geofenceIn: 0, geofenceOut: 0, sos: 0, lowBattery: 0, power: 0, ignitionOn: 0 })

export default handler({
  async GET(req, res) {
    requireUser(req)
    const params = query(req)

    const today = dayOf()
    const to = params.get('to') || today
    const from = params.get('from') || to
    if (!DAY.test(from) || !DAY.test(to)) throw badRequest('from and to must be YYYY-MM-DD')
    if (from > to) throw badRequest('from must not be after to')

    const days = daysBetween(from, to)
    /* the daily chart always shows the seven days ending at `to` */
    const week = Array.from({ length: 7 }, (_, i) => addDays(to, i - 6))
    const span = [...new Set([...days, ...week])].sort()

    const [fleet, alerts, plans] = await Promise.all([registry.all(), inbox(), maintenance.all()])
    const live = await allPositions(fleet.map((v) => v.id))

    /* ── trails: per vehicle per day, read once ─────────────────────── */
    const perDay = new Map(span.map((d) => [d, { km: 0, events: emptyEvents() }]))
    const perVehicle = new Map(fleet.map((v) => [v.id, { km: 0, drivingMin: 0, speedEvents: 0 }]))
    const totals = { km: 0, drivingMin: 0, idleMin: 0, trips: 0, maxSpeed: 0, speedSum: 0, speedN: 0 }
    const reported = new Set()
    const inRange = new Set(days)

    /* Every trail and every day's alert counts in one round-trip each. Read one
       key at a time, a 30-day window over a small fleet was well over a
       hundred sequential database calls — longer than the app waits. */
    const pairs = fleet.flatMap((v) => span.map((day) => ({ vehicle: v, day })))
    const [trails, counts] = await Promise.all([
      mget(pairs.map((p) => trailKey(p.vehicle.id, p.day))),
      mget(span.map(alertDayKey)),
    ])

    for (const [i, { vehicle, day }] of pairs.entries()) {
      {
        const points = Array.isArray(trails[i]) ? trails[i] : []
        if (!points.length) continue
        const { trips, stops, stats } = summarise(points)
        perDay.get(day).km += stats.totalDistance
        /* long stops are measured, not alerted: they count even when no idle
           rule is switched on */
        const long = stops.filter((s) => s.durationMin >= LONG_STOP_MIN)
        perDay.get(day).events.idle += long.length
        perDay.get(day).events.idleMinutes += long.reduce((m, s) => m + s.durationMin, 0)
        if (!inRange.has(day)) continue

        reported.add(vehicle.id)
        totals.km += stats.totalDistance
        totals.drivingMin += stats.drivingMin
        totals.idleMin += stats.idleMin
        totals.trips += trips.length
        totals.maxSpeed = Math.max(totals.maxSpeed, stats.maxSpeed)
        if (stats.avgSpeed > 0) {
          totals.speedSum += stats.avgSpeed
          totals.speedN += 1
        }
        const row = perVehicle.get(vehicle.id)
        row.km += stats.totalDistance
        row.drivingMin += stats.drivingMin
      }
    }

    /* ── alerts: per-day counters, which the inbox cap cannot trim. A day
       from before counting began has none, and falls back to the inbox ──── */
    const counted = new Map()
    span.forEach((day, i) => {
      if (counts[i]) counted.set(day, counts[i])
    })
    const add = (day, type, vehicleId, n) => {
      if (type === 'idle') return // measured from the trail above
      const bucket = perDay.get(day).events
      if (type in bucket) bucket[type] += n
      if (type === 'speed' && inRange.has(day) && perVehicle.has(vehicleId)) {
        perVehicle.get(vehicleId).speedEvents += n
      }
    }
    for (const [day, c] of counted) {
      for (const [vehicleId, types] of Object.entries(c.byVehicle ?? {})) {
        for (const [type, n] of Object.entries(types)) add(day, type, Number(vehicleId), n)
      }
    }
    for (const a of alerts) {
      const day = dayOf(a.at)
      if (!perDay.has(day) || counted.has(day)) continue
      add(day, a.type, a.vehicleId, 1)
    }

    const events = emptyEvents()
    for (const day of days) {
      for (const [k, n] of Object.entries(perDay.get(day).events)) events[k] += n
    }

    /* ── now: live status, maintenance ─────────────────────────────────── */
    const now = Date.now()
    const status = { moving: 0, idle: 0, stopped: 0, offline: 0 }
    for (const v of fleet) status[statusOf(live[v.id] ?? null, now)] += 1

    const byId = new Map(fleet.map((v) => [v.id, v]))
    const decorated = plans.map((m) => decorate(m, byId.get(m.vehicleId)))
    const maintenanceDue = {
      overdue: decorated.filter((m) => m.state === 'overdue').length,
      soon: decorated.filter((m) => m.state === 'soon').length,
    }

    const km = Number(totals.km.toFixed(1))
    const top = fleet
      .map((v) => ({
        id: v.id,
        plate: v.plate,
        km: Number(perVehicle.get(v.id).km.toFixed(1)),
        drivingMin: perVehicle.get(v.id).drivingMin,
        speedEvents: perVehicle.get(v.id).speedEvents,
      }))
      .filter((r) => r.km > 0 || r.speedEvents > 0)
      .sort((a, b) => b.km - a.km)
      .slice(0, 5)

    return ok(res, {
      ok: true,
      from,
      to,
      kpis: {
        vehicles: fleet.length,
        active: reported.size,
        online: fleet.length - status.offline,
        maintenanceDue: maintenanceDue.overdue + maintenanceDue.soon,
      },
      status,
      maintenance: maintenanceDue,
      totals: {
        distanceKm: km,
        drivingMin: totals.drivingMin,
        idleMin: totals.idleMin,
        trips: totals.trips,
        maxSpeed: totals.maxSpeed,
        avgSpeed: totals.speedN ? Math.round(totals.speedSum / totals.speedN) : 0,
      },
      events,
      safety: { score: scoreOf(events, km) },
      daily: week.map((d) => {
        const day = perDay.get(d)
        return { date: d, km: Number(day.km.toFixed(1)), score: scoreOf(day.events, day.km) }
      }),
      top,
    })
  },
})
