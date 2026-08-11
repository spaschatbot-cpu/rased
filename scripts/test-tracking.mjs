/**
 * Live-tracking contract test.
 *
 *   npm run test:tracking
 *   API_BASE=http://localhost:5173 npm run test:tracking
 *
 * Writes real positions for the seeded drivers, then clears them.
 */
const ORIGIN = process.env.API_BASE || 'http://localhost:5176'
const BASE = `${ORIGIN}/api`

let pass = 0
let fail = 0
const cookies = {}
const tokens = {}

async function call(path, { method = 'GET', body, as, bearer } = {}) {
  const headers = {}
  if (body) headers['Content-Type'] = 'application/json'
  if (as && cookies[as]) headers.Cookie = cookies[as]
  if (bearer) headers.Authorization = `Bearer ${tokens[bearer] ?? bearer}`
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
  return { status: res.status, data: await res.json().catch(() => ({})), res }
}

function check(label, actual, expected) {
  const good = actual === expected
  good ? pass++ : fail++
  console.log(`${good ? 'PASS' : 'FAIL'}  ${label}${good ? '' : `  (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`}`)
}

async function signIn(name, username, password, client) {
  const r = await call('/auth/login', { method: 'POST', body: { username, password, client } })
  const sc = r.res.headers.get('set-cookie')
  if (sc) cookies[name] = sc.split(';')[0]
  if (r.data.token) tokens[name] = r.data.token
  return r
}

await signIn('manager', '7034710512', '7034710512')
await signIn('viewer', 'n.salem', 'Mirsad@123')
let r = await signIn('d1', 'a.mutairi', 'Driver@123', 'app')
check('driver 1 signs in', r.status, 200)
const v1 = r.data.user.vehicleId
r = await signIn('d2', 'f.qahtani', 'Driver@123', 'app')
const v2 = r.data.user.vehicleId
check('the two drivers have different vehicles', v1 !== v2, true)

/* ── who may report ───────────────────────────────────────────── */
check('anonymous cannot report', (await call('/track', { method: 'POST', body: { lat: 24.7, lng: 46.6 } })).status, 401)
check('manager cannot report', (await call('/track', { method: 'POST', as: 'manager', body: { lat: 24.7, lng: 46.6 } })).status, 403)
check('forged token rejected', (await call('/track', { method: 'POST', bearer: 'abc.def', body: { lat: 24.7, lng: 46.6 } })).status, 401)

/* ── a good fix ───────────────────────────────────────────────── */
r = await call('/track', {
  method: 'POST',
  bearer: 'd1',
  body: { lat: 24.7136, lng: 46.6753, speed: 62, heading: 145, accuracy: 8, battery: 74 },
})
check('driver reports a fix', r.status, 200)
check('the vehicle comes from the account', r.data.vehicleId, v1)
check('status derived from speed', r.data.status, 'moving')

/* ── rubbish is refused ───────────────────────────────────────── */
check('lat out of range', (await call('/track', { method: 'POST', bearer: 'd1', body: { lat: 999, lng: 46.6 } })).status, 400)
check('lng out of range', (await call('/track', { method: 'POST', bearer: 'd1', body: { lat: 24.7, lng: 500 } })).status, 400)
check('missing coordinates', (await call('/track', { method: 'POST', bearer: 'd1', body: { speed: 40 } })).status, 400)
check('text instead of numbers', (await call('/track', { method: 'POST', bearer: 'd1', body: { lat: 'here', lng: 'there' } })).status, 400)
check('empty batch', (await call('/track', { method: 'POST', bearer: 'd1', body: { points: [] } })).status, 400)

/* absurd values are clamped, not rejected — a bad sensor should not stop a shift */
r = await call('/track', { method: 'POST', bearer: 'd1', body: { lat: 24.7, lng: 46.6, speed: 9999, heading: 5000, battery: 500 } })
check('extreme values accepted', r.status, 200)
r = await call('/positions', { as: 'manager' })
let mine = r.data.positions.find((p) => p.vehicleId === v1)
check('speed clamped', mine.speed, 300)
check('heading clamped', mine.heading, 360)
check('battery clamped', mine.battery, 100)

/* ── offline buffer replay ────────────────────────────────────── */
r = await call('/track', {
  method: 'POST',
  bearer: 'd1',
  body: {
    points: [
      { lat: 24.70, lng: 46.60, speed: 30 },
      { lat: 24.71, lng: 46.61, speed: 0 },
      { lat: 24.72, lng: 46.62, speed: 45 },
    ],
  },
})
check('batch accepted', r.status, 200)
check('all three counted', r.data.accepted, 3)

r = await call('/positions', { as: 'manager' })
mine = r.data.positions.find((p) => p.vehicleId === v1)
check('newest point wins', mine.lat, 24.72)

/* a batch may carry one bad point without losing the good ones */
r = await call('/track', {
  method: 'POST',
  bearer: 'd1',
  body: { points: [{ lat: 999, lng: 0 }, { lat: 24.75, lng: 46.65, speed: 10 }] },
})
check('mixed batch partially accepted', r.data.accepted, 1)
check('and reports what it dropped', r.data.rejected, 1)
check('oversized batch refused', (await call('/track', { method: 'POST', bearer: 'd1', body: { points: Array(201).fill({ lat: 24.7, lng: 46.6 }) } })).status, 400)

/* ── who may watch ────────────────────────────────────────────── */
await call('/track', { method: 'POST', bearer: 'd2', body: { lat: 24.80, lng: 46.70, speed: 0 } })

check('anonymous cannot watch', (await call('/positions')).status, 401)

r = await call('/positions', { as: 'manager' })
check('manager sees both vehicles', r.data.positions.length, 2)

r = await call('/positions', { as: 'viewer' })
check('viewer sees both vehicles', r.data.positions.length, 2)

r = await call('/positions', { bearer: 'd1' })
check('a driver sees only their own', r.data.positions.length, 1)
check('and it is theirs', r.data.positions[0].vehicleId, v1)

/* ── derived fields ───────────────────────────────────────────── */
r = await call('/positions', { as: 'manager' })
const parked = r.data.positions.find((p) => p.vehicleId === v2)
check('zero speed reads as stopped', parked.status, 'stopped')
check('age is reported', typeof parked.ageSeconds, 'number')
check('driver name travels with the fix', typeof parked.driverName, 'string')
check('no hash leaks into a position', parked.pass, undefined)

/* ── ending a shift ───────────────────────────────────────────── */
check('driver ends the shift', (await call('/track', { method: 'DELETE', bearer: 'd2' })).status, 200)
r = await call('/positions', { as: 'manager' })
check('vehicle left the live map', r.data.positions.some((p) => p.vehicleId === v2), false)
check('the other is still there', r.data.positions.some((p) => p.vehicleId === v1), true)
check('manager cannot end a shift', (await call('/track', { method: 'DELETE', as: 'manager' })).status, 403)

/* ── a driver with no vehicle cannot report ───────────────────── */
await signIn('admin', 'superadmin', 'Mirsad@2026')
r = await call('/users', {
  method: 'POST',
  as: 'admin',
  body: { nameAr: 'بدون مركبة', nameEn: 'No vehicle', username: 'n.vehicle', role: 'driver', groupId: 1, password: 'Secret123' },
})
const orphanId = r.data.user.id
await signIn('orphan', 'n.vehicle', 'Secret123', 'app')
check('unassigned driver is told why', (await call('/track', { method: 'POST', bearer: 'orphan', body: { lat: 24.7, lng: 46.6 } })).status, 409)
await call(`/users?id=${orphanId}`, { method: 'DELETE', as: 'admin' })

/* ── method guard ─────────────────────────────────────────────── */
check('GET /track not allowed', (await call('/track', { bearer: 'd1' })).status, 405)
check('POST /positions not allowed', (await call('/positions', { method: 'POST', as: 'manager' })).status, 405)

/* ── cleanup ──────────────────────────────────────────────────── */
await call('/track', { method: 'DELETE', bearer: 'd1' })
r = await call('/positions', { as: 'manager' })
check('live map is empty again', r.data.positions.length, 0)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
