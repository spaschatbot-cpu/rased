/**
 * A batch that arrives out of order.
 *
 * Start the app first, then:
 *   npm run test:backfill
 *   API_BASE=http://localhost:5181 npm run test:backfill
 *
 * A phone with no signal keeps its fixes on disk and flushes them when the
 * network returns — which can easily be *after* fixes stamped later have
 * already landed. This drives that exact sequence and checks the trail keeps
 * the journey in the order it was driven, not the order it was delivered.
 *
 * It writes into driver 1's trail for today, so point it at a development
 * store. The points it adds are minutes apart and its own.
 */
import { dayOf, startOfDay } from '../shared/clock.js'

const ORIGIN = process.env.API_BASE || 'http://localhost:5174'
const BASE = `${ORIGIN}/api`
let pass = 0
let fail = 0

let token = null

async function call(path, { method = 'GET', body } = {}) {
  const headers = {}
  if (body) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, data: await res.json().catch(() => ({})) }
}

function check(label, actual, expected) {
  const good = actual === expected
  good ? pass++ : fail++
  console.log(
    `${good ? 'PASS' : 'FAIL'}  ${label}` +
      (good ? '' : `  (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`),
  )
}

const ok = (label, cond, detail = '') => {
  cond ? pass++ : fail++
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${cond ? '' : `  ${detail}`}`)
}

/* ── sign in as a driver ──────────────────────────────────────── */
let r = await call('/auth/login', {
  method: 'POST',
  body: { username: 'a.mutairi', password: 'Driver@123', client: 'app' },
})
token = r.data.token
check('driver signs in', r.status, 200)

const ZONE = { lat: 24.7136, lng: 46.6753 }
/* the same Saudi day the server files a fix under */
const today = dayOf()

/* The minutes this run writes into, and the half-minute it uses to prove a
   genuine gap is still kept. */
const MINUTES = [0, 1, 2, 3, 4, 5, 8, 9]
const HALF = 3.5

/**
 * Find a stretch of today with nothing already in it.
 *
 * The day's trail is shared with every other suite — and with earlier runs of
 * this one. A fixed window would test whatever those left behind, so the window
 * is chosen against the trail as it actually is: far enough from every stored
 * point that the minimum-gap rule cannot confuse this run's fixes with anyone
 * else's.
 */
async function findFreeWindow() {
  const { data } = await call(`/history?vehicle=1&date=${today}`)
  const taken = (data.points ?? []).map((p) => Date.parse(p.at))
  const CLEAR_MS = 30000

  /* the whole of today is fair game, in small steps: the trail fills up as the
     other suites run, and a narrow search runs out of room by the afternoon */
  const midnight = startOfDay(today)
  for (let back = 40; back < 1400; back += 7) {
    const base = Date.now() - back * 60000
    if (base < midnight) break // a base before midnight lands in another day key
    const wanted = [...MINUTES, HALF].map((m) => base + m * 60000)
    const clashes = wanted.some((w) => taken.some((t) => Math.abs(t - w) < CLEAR_MS))
    if (!clashes) return base
  }
  return null
}

const base = await findFreeWindow()
ok('found a clear stretch of the day to drive through', base !== null)
if (base === null) process.exit(1)

const point = (minute, speed) => ({
  lat: Number((ZONE.lat + minute * 0.004).toFixed(6)),
  lng: ZONE.lng,
  speed,
  heading: 0,
  at: new Date(base + minute * 60000).toISOString(),
})

/* the phone had signal at the end of the run and sent the last two fixes */
const late = [point(8, 40), point(9, 35)]
r = await call('/track', { method: 'POST', body: { points: late } })
check('the fresh fixes land', r.status, 200)
check('both are recorded', r.data.recorded, 2)

/* now the buffered backlog from the dead zone arrives — all stamped earlier */
const backlog = [point(0, 0), point(1, 20), point(2, 55), point(3, 70), point(4, 65), point(5, 50)]
r = await call('/track', { method: 'POST', body: { points: backlog } })
check('the backlog is accepted', r.data.accepted, backlog.length)
/* this is the bug the whole file exists for: every one of them used to be
   dropped for being older than the fix already stored */
check('and every point is recorded', r.data.recorded, backlog.length)

/* ── the day's trail ──────────────────────────────────────────── */
r = await call(`/history?vehicle=1&date=${today}`)
check('the day reads back', r.status, 200)

const points = r.data.points ?? []
/* by exact timestamp, not by window: the day belongs to every suite */
const stored = new Set(points.map((p) => p.at))
const missing = MINUTES.filter((m) => !stored.has(new Date(base + m * 60000).toISOString()))
ok('all eight are in the trail', missing.length === 0, `missing minutes ${missing.join(', ')}`)

const times = points.map((p) => Date.parse(p.at))
const sorted = times.every((t, i) => i === 0 || times[i - 1] <= t)
ok('the trail is in the order it was driven', sorted, `first out-of-order at ${times.findIndex((t, i) => i > 0 && times[i - 1] > t)}`)

/* a journey out of order books negative legs, so this is the number that broke */
ok('the day credits real distance', (r.data.stats?.totalDistance ?? 0) > 0, `got ${r.data.stats?.totalDistance}`)
ok('and finds the trip', (r.data.trips?.length ?? 0) >= 1, `got ${r.data.trips?.length}`)

/* ── the thinning rule still works ────────────────────────────── */
r = await call('/track', { method: 'POST', body: point(3, 70) })
check('a fix inside an existing gap is thinned', r.data.recorded, 0)
check('but it is still accepted as the live position', r.data.accepted, 1)

r = await call('/track', { method: 'POST', body: { ...point(3, 70), at: new Date(base + HALF * 60000).toISOString() } })
check('a real gap between two stored fixes is kept', r.data.recorded, 1)

/* ── the shift survived the backfill ──────────────────────────── */
r = await call('/shifts')
const shift = r.data.shifts?.[0]
ok('a shift is open', Boolean(shift), 'none found')
ok(
  'and it stretches back over the backfill',
  shift && Date.parse(shift.startedAt) <= base + 60000,
  `started ${shift?.startedAt}`,
)

await call('/track', { method: 'DELETE' })

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
