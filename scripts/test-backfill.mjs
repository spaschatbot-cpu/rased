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
 * It writes into driver 1's trail, so point it at a development store. The
 * points it adds are minutes apart and its own. It normally uses today; in the
 * first hour after midnight there is not enough of today to hold the window and
 * it falls back to yesterday, which changes nothing it is testing.
 */
import { dayBack, dayOf, startOfDay } from '../shared/clock.js'

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

/* The minutes this run writes into, and the half-minute it uses to prove a
   genuine gap is still kept. */
const MINUTES = [0, 1, 2, 3, 4, 5, 8, 9]
const HALF = 3.5

const CLEAR_MS = 30000
const SPAN_MIN = Math.max(...MINUTES, HALF)
/* how far behind the end of the day the newest fix is kept — a fix must never
   be stamped in the future, and the tracker distrusts clocks that run ahead */
const LEAD_MIN = 40

/**
 * Find a stretch with nothing already in it, and the day it belongs to.
 *
 * The day's trail is shared with every other suite — and with earlier runs of
 * this one. A fixed window would test whatever those left behind, so the window
 * is chosen against the trail as it actually is: far enough from every stored
 * point that the minimum-gap rule cannot confuse this run's fixes with anyone
 * else's.
 *
 * Today is tried first, because a phone flushing a backlog right now is the
 * scenario being reproduced. But shortly after midnight there is not yet enough
 * of today to hold the window, and the suite used to fail there — a red result
 * that meant "it is 00:26", not "the code is wrong". Yesterday is always a full
 * twenty-four hours, and it is well inside the seven-day buffer the tracker
 * accepts device timestamps from, so those fixes are taken and filed under that
 * day exactly as an overnight backlog would be.
 */
async function findFreeWindow() {
  for (const day of [dayOf(), dayBack(1)]) {
    const { data } = await call(`/history?vehicle=1&date=${day}`)
    const taken = (data.points ?? []).map((p) => Date.parse(p.at))

    const dayStart = startOfDay(day)
    /* a past day is complete; today ends at the current instant */
    const dayEnd = Math.min(Date.now(), dayStart + 86400000)

    /* walk backwards in small steps: the trail fills up as the other suites
       run, and a narrow search runs out of room by the afternoon */
    for (let base = dayEnd - (LEAD_MIN + SPAN_MIN) * 60000; base >= dayStart; base -= 7 * 60000) {
      const wanted = [...MINUTES, HALF].map((m) => base + m * 60000)
      const clashes = wanted.some((w) => taken.some((t) => Math.abs(t - w) < CLEAR_MS))
      if (!clashes) return { day, base }
    }
  }
  return null
}

const window = await findFreeWindow()
ok('found a clear stretch to drive through', window !== null)
if (window === null) process.exit(1)

const { day, base } = window
if (day !== dayOf()) console.log(`      (today is too young to hold the window — using ${day})`)

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
r = await call(`/history?vehicle=1&date=${day}`)
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
