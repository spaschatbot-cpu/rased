/**
 * Usage series for the dashboard charts.
 *
 *   GET ?vehicle=<id>   — one vehicle
 *   GET                 — the whole fleet, summed
 *
 * Returns daily, weekly and monthly distance and engine hours, plus the
 * average speed by hour of day, all totalled from the recorded trail.
 *
 * A day before the vehicle started reporting comes back as zero, not as a
 * plausible-looking figure. That is the point: a flat stretch on these charts
 * now means "nothing was recorded", which is information. The response says
 * how far back the trail is kept (`retentionDays`) and when this vehicle first
 * reported (`since`) so the screen can label the flat part rather than let it
 * read as an outage.
 */
import { handler, ok } from './_lib/http.js'
import { requireUser } from './_lib/auth.js'
import { badRequest, query } from './_lib/collection.js'
import { RETENTION_DAYS, pointsFor, summarise } from './_lib/history.js'
import { dayBack, hourOf, partsOf } from '../shared/clock.js'
import { vehicles as registry } from './_lib/vehicles.js'
import { findById } from './_lib/users.js'

/** Only ever as far back as the trail is kept — older days are all zero. */
const MAX_DAYS = RETENTION_DAYS

const MOVING_KMH = 4


export default handler({
  async GET(req, res) {
    const caller = requireUser(req)
    const params = query(req)

    const days = Math.min(MAX_DAYS, Math.max(1, Number(params.get('days')) || MAX_DAYS))

    /* which vehicles feed the series */
    let fleet = await registry.all()
    const asked = Number(params.get('vehicle'))
    if (asked) {
      fleet = fleet.filter((v) => v.id === asked)
      if (!fleet.length) throw badRequest('unknown vehicle')
    }
    if (caller.r === 'driver') {
      const driver = await findById(caller.i)
      fleet = fleet.filter((v) => v.id === driver?.vehicleId)
    }

    /* oldest first, so every series reads left to right like the charts do */
    const dates = Array.from({ length: days }, (_, i) => dayBack(days - 1 - i))

    /* One pass over the window builds every series: distance and hours per
       day, and the speed samples that make up the hourly profile. */
    const daily = []
    const hourly = Array.from({ length: 24 }, () => ({ total: 0, samples: 0, active: 0 }))
    let since = null

    for (const date of dates) {
      let distance = 0
      let engineHours = 0
      /* the fastest any of these vehicles went that day. Summed distance and
         summed hours make sense across a fleet; a summed top speed does not, so
         this one is a maximum. The vehicle card reads it for its period totals,
         which used to be invented in the browser. */
      let maxSpeed = 0

      for (const vehicle of fleet) {
        const points = await pointsFor(vehicle.id, date)
        if (!points.length) continue
        if (!since || date < since) since = date

        const { stats } = summarise(points)
        distance += stats.totalDistance
        engineHours += stats.drivingMin / 60
        maxSpeed = Math.max(maxSpeed, stats.maxSpeed)

        for (const p of points) {
          /* the hour a driver would name, not the hour in Greenwich */
          const h = hourOf(p.at)
          if (p.speed > MOVING_KMH) {
            hourly[h].total += p.speed
            hourly[h].samples += 1
          }
          hourly[h].active += 1
        }
      }

      const { date: dayNumber, month } = partsOf(date)
      daily.push({
        date,
        day: dayNumber,
        month,
        label: `${dayNumber}/${month + 1}`,
        /* One decimal, not a whole kilometre. Rounding each day before the
           screens add them up made a month drift a kilometre away from the
           same month in the report — two screens, one fleet, two answers. The
           rounding belongs at the end, where the number is shown. */
        distance: Number(distance.toFixed(1)),
        engineHours: Number(engineHours.toFixed(2)),
        maxSpeed,
      })
    }

    /* weeks and months are the same numbers, bucketed differently — derived
       from `daily` rather than re-read, so the three can never disagree */
    const weekly = []
    for (let i = 0; i < daily.length; i += 7) {
      const week = daily.slice(i, i + 7)
      weekly.push({
        week: weekly.length + 1,
        date: week[0].date,
        label: week[0].label,
        distance: Number(week.reduce((s, d) => s + d.distance, 0).toFixed(1)),
        engineHours: Number(week.reduce((s, d) => s + d.engineHours, 0).toFixed(1)),
        maxSpeed: week.reduce((m, d) => Math.max(m, d.maxSpeed), 0),
      })
    }

    const months = new Map()
    for (const d of daily) {
      const key = d.date.slice(0, 7)
      const bucket = months.get(key) ?? { date: key, month: d.month, year: Number(d.date.slice(0, 4)), distance: 0, engineHours: 0, maxSpeed: 0 }
      bucket.distance += d.distance
      bucket.engineHours += d.engineHours
      bucket.maxSpeed = Math.max(bucket.maxSpeed, d.maxSpeed)
      months.set(key, bucket)
    }
    const monthly = [...months.values()].map((m) => ({
      ...m,
      distance: Number(m.distance.toFixed(1)),
      engineHours: Number(m.engineHours.toFixed(1)),
    }))

    const speedProfile = hourly.map((h, hour) => ({
      hour: `${String(hour).padStart(2, '0')}:00`,
      avgSpeed: h.samples ? Math.round(h.total / h.samples) : 0,
      active: h.active,
    }))

    return ok(res, {
      ok: true,
      vehicleId: asked || null,
      vehicles: fleet.length,
      days,
      retentionDays: RETENTION_DAYS,
      since,
      daily,
      weekly,
      monthly,
      speedProfile,
    })
  },
})
