/**
 * Drive a demo journey so the replay, report and usage screens have something
 * real to show on a fresh install.
 *
 *   node scripts/seed-demo-trail.mjs                 # today, 3 vehicles
 *   node scripts/seed-demo-trail.mjs --days 7        # the last 7 days
 *   API_BASE=http://localhost:5174 node scripts/...
 *
 * It signs in as the seeded driver accounts and posts through `/api/track`, so
 * the points travel the same ingest path a real phone uses: the trail, the
 * odometer and the alert rules all see them exactly as they would in the field.
 */
import { dayOf, startOfDay } from '../shared/clock.js'

const ORIGIN = process.env.API_BASE || 'http://localhost:5174'
const BASE = `${ORIGIN}/api`

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : fallback
}

const DAYS = Math.max(1, Math.min(30, Number(arg('days', 1))))

/* the drivers seeded by the backend, and the vehicle each one is assigned */
const DRIVERS = [
  { username: 'a.mutairi', password: 'Driver@123' },
  { username: 'f.qahtani', password: 'Driver@123' },
]

const RIYADH = { lat: 24.7136, lng: 46.6753 }

async function login(username, password) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, client: 'app' }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`${username}: ${data.error}`)
  return data.token
}

/**
 * A day's worth of driving: two runs out and back with a lunch stop, sampled
 * every two minutes. Speeds follow the road type rather than being random, so
 * the trip/stop segmentation and the speeding report have something meaningful
 * to find.
 */
const SAMPLE_MIN = 2

function journey(dayOffset, seed) {
  /* 06:00 on the Saudi clock, which is the day the server files these under */
  const day = dayOf(Date.now() - dayOffset * 86400000)
  const base = new Date(startOfDay(day) + 6 * 60 * 60 * 1000)

  /* The server refuses a fix dated in the future, so today's run stops at the
     current time instead of laying down a whole day that has not happened. */
  const horizon = Date.now()

  const points = []
  let lat = RIYADH.lat + (seed % 5) * 0.004
  let lng = RIYADH.lng + (seed % 3) * 0.004
  let minute = 0

  const leg = (durationMin, speed, bearing) => {
    for (let m = 0; m < durationMin; m += SAMPLE_MIN) {
      /* km covered in one sample, converted to degrees (~111 km per degree) */
      const step = (speed * (SAMPLE_MIN / 60)) / 111
      lat += Math.cos((bearing * Math.PI) / 180) * step
      lng += Math.sin((bearing * Math.PI) / 180) * step
      minute += SAMPLE_MIN

      const at = base.getTime() + minute * 60000
      if (at > horizon) return

      points.push({
        lat: Number(lat.toFixed(6)),
        lng: Number(lng.toFixed(6)),
        speed: Math.max(0, Math.round(speed + (speed ? ((minute * seed) % 11) - 5 : 0))),
        heading: bearing,
        battery: Math.max(20, 100 - Math.round(minute / 8)),
        at: new Date(at).toISOString(),
      })
    }
  }

  leg(20, 0, 0)      // parked at the depot
  leg(50, 62, 20)    // out on the ring road
  leg(30, 132, 20)   // motorway stretch — over the 120 km/h rule, so it alerts
  leg(40, 0, 0)      // delivery stop
  leg(45, 55, 200)   // back through town
  leg(60, 0, 0)      // lunch
  leg(70, 88, 200)   // the run home
  leg(20, 0, 0)      // parked again

  return points
}

/* Batches stay under the 200-point limit the endpoint enforces. */
const chunk = (list, size) =>
  Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size))

let posted = 0
let alerts = 0

for (const [i, driver] of DRIVERS.entries()) {
  let token
  try {
    token = await login(driver.username, driver.password)
  } catch (err) {
    console.error(`skip ${driver.username}: ${err.message}`)
    continue
  }

  for (let day = DAYS - 1; day >= 0; day--) {
    const points = journey(day, i + 1)

    for (const batch of chunk(points, 150)) {
      const res = await fetch(`${BASE}/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ points: batch }),
      })
      const data = await res.json()
      if (!res.ok) {
        console.error(`  ${driver.username} day -${day}: ${data.error}`)
        break
      }
      posted += data.accepted
      alerts += data.alerts ?? 0
    }
    console.log(`${driver.username}  day -${day}  ${points.length} points`)
  }

  /* end the shift so the fleet is not left showing yesterday as live */
  await fetch(`${BASE}/track`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
}

console.log(`\n${posted} points recorded over ${DAYS} day(s), ${alerts} alerts raised.`)
