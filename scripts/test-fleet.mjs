/**
 * Contract test for the fleet backend — the registry, the zones, the rules,
 * the schedule, the trail, the inbox and the reports.
 *
 * Start the app first, then:
 *   npm run test:fleet
 *   API_BASE=https://staging.example npm run test:fleet
 *
 * It creates and deletes rows, and it drives a real driver account through a
 * short journey, so point it at a staging deployment rather than a live one.
 */
import { dayOf } from '../shared/clock.js'

const ORIGIN = process.env.API_BASE || 'http://localhost:5174'
const BASE = `${ORIGIN}/api`

let pass = 0
let fail = 0
const cookies = {}
let driverToken = null

function jar(name, res) {
  const sc = res.headers.get('set-cookie')
  if (sc) cookies[name] = sc.split(';')[0]
}

async function call(path, { method = 'GET', body, as, token } = {}) {
  const headers = {}
  if (body) headers['Content-Type'] = 'application/json'
  if (as && cookies[as]) headers.Cookie = cookies[as]
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  return { status: res.status, data, res }
}

function check(label, actual, expected) {
  const good = actual === expected
  good ? pass++ : fail++
  console.log(`${good ? 'PASS' : 'FAIL'}  ${label}${good ? '' : `  (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`}`)
}

function ok(label, condition, detail = '') {
  condition ? pass++ : fail++
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${condition ? '' : `  ${detail}`}`)
}

const section = (title) => console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 56 - title.length))}`)

/* ── sign in ──────────────────────────────────────────────────── */
section('accounts')

let r = await call('/auth/login', { method: 'POST', body: { username: 'superadmin', password: process.env.ADMIN_PASSWORD || 'Mirsad@2026' } })
jar('admin', r.res)
check('admin login', r.status, 200)
if (r.status !== 200) {
  console.error('\ncannot continue without an admin session')
  process.exit(1)
}

r = await call('/auth/login', { method: 'POST', body: { username: 'n.salem', password: 'Mirsad@123' } })
jar('viewer', r.res)
check('viewer login', r.status, 200)

r = await call('/auth/login', { method: 'POST', body: { username: 'a.mutairi', password: 'Driver@123', client: 'app' } })
driverToken = r.data.token
check('driver login (app)', r.status, 200)
ok('driver got a bearer token', typeof driverToken === 'string' && driverToken.length > 20)

/* ── vehicles ─────────────────────────────────────────────────── */
section('vehicles')

check('GET /vehicles anonymous → 401', (await call('/vehicles')).status, 401)

r = await call('/vehicles', { as: 'admin' })
check('GET /vehicles', r.status, 200)
ok('registry is seeded', Array.isArray(r.data.vehicles) && r.data.vehicles.length >= 8, `got ${r.data.vehicles?.length}`)
const seededPlate = r.data.vehicles?.[0]?.plate

r = await call('/vehicles', { as: 'viewer' })
check('viewer may read the registry', r.status, 200)
check('viewer may not create → 403', (await call('/vehicles', { method: 'POST', as: 'viewer', body: { plate: 'X' } })).status, 403)

check(
  'duplicate plate rejected',
  (await call('/vehicles', { method: 'POST', as: 'admin', body: { plate: seededPlate, modelEn: 'Dup' } })).status,
  400,
)
check(
  'bad IMEI rejected',
  (await call('/vehicles', { method: 'POST', as: 'admin', body: { plate: '9999 TST', modelEn: 'Test', imei: 'abc' } })).status,
  400,
)
check(
  'missing plate rejected',
  (await call('/vehicles', { method: 'POST', as: 'admin', body: { modelEn: 'Test' } })).status,
  400,
)

r = await call('/vehicles', {
  method: 'POST',
  as: 'admin',
  body: { plate: '9999 TST', modelAr: 'مركبة اختبار', modelEn: 'Test Van', imei: '860000000000999', groupId: 1, speedLimit: 90 },
})
check('create vehicle', r.status, 200)
const newVehicleId = r.data.vehicle?.id
ok('new vehicle got an id', Number.isFinite(newVehicleId), `got ${newVehicleId}`)

r = await call(`/vehicles?id=${newVehicleId}`, { method: 'PUT', as: 'admin', body: { plate: '9999 TST', modelEn: 'Test Van 2', speedLimit: 80 } })
check('update vehicle', r.status, 200)
check('update took effect', r.data.vehicle?.speedLimit, 80)

check('update missing vehicle → 404', (await call('/vehicles?id=999999', { method: 'PUT', as: 'admin', body: { plate: 'Z', modelEn: 'Z' } })).status, 404)

/* ── groups ───────────────────────────────────────────────────── */
section('groups')

r = await call('/groups', { as: 'admin' })
check('GET /groups', r.status, 200)
ok('branches are seeded', r.data.groups?.length >= 3, `got ${r.data.groups?.length}`)

r = await call('/groups', { method: 'POST', as: 'admin', body: { nameAr: 'فرع اختبار', nameEn: 'Test Branch', cityEn: 'Riyadh' } })
check('create branch', r.status, 200)
const newGroupId = r.data.group?.id

check('duplicate branch name rejected', (await call('/groups', { method: 'POST', as: 'admin', body: { nameEn: 'Test Branch' } })).status, 400)
check('delete a branch still in use → 400', (await call('/groups?id=1', { method: 'DELETE', as: 'admin' })).status, 400)
check('delete an empty branch', (await call(`/groups?id=${newGroupId}`, { method: 'DELETE', as: 'admin' })).status, 200)

/* ── geofences ────────────────────────────────────────────────── */
section('geofences')

r = await call('/geofences', { as: 'admin' })
check('GET /geofences', r.status, 200)
ok('zones are seeded', r.data.geofences?.length >= 3, `got ${r.data.geofences?.length}`)

check('circle with no centre rejected', (await call('/geofences', { method: 'POST', as: 'admin', body: { nameEn: 'Bad', type: 'circle', radius: 100 } })).status, 400)
check('unknown zone type rejected', (await call('/geofences', { method: 'POST', as: 'admin', body: { nameEn: 'Bad', type: 'blob' } })).status, 400)
check('rectangle with one corner rejected', (await call('/geofences', { method: 'POST', as: 'admin', body: { nameEn: 'Bad', type: 'rectangle', bounds: [{ lat: 1, lng: 1 }] } })).status, 400)
check('polygon with two corners rejected', (await call('/geofences', { method: 'POST', as: 'admin', body: { nameEn: 'Bad', type: 'polygon', path: [{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }] } })).status, 400)

/* The map's third draw tool, which the server used to refuse outright. A
   triangle well away from the fleet, so it can be tested for containment
   without disturbing the zones the rest of this file relies on. */
r = await call('/geofences', {
  method: 'POST',
  as: 'admin',
  body: {
    nameAr: 'مضلع اختبار', nameEn: 'Test Polygon', type: 'polygon', color: '#f5b301',
    path: [{ lat: 25.10, lng: 46.60 }, { lat: 25.10, lng: 46.70 }, { lat: 25.20, lng: 46.65 }],
  },
})
check('create a polygon zone', r.status, 200)
const polyId = r.data.geofence?.id
ok('the polygon keeps all three corners', r.data.geofence?.path?.length === 3, `got ${r.data.geofence?.path?.length}`)
ok('and carries no leftover circle geometry', r.data.geofence?.radius == null)

/* a tight zone around the point the fake driver will report from */
const ZONE = { lat: 24.7136, lng: 46.6753 }
r = await call('/geofences', {
  method: 'POST',
  as: 'admin',
  body: { nameAr: 'نطاق اختبار', nameEn: 'Test Zone', type: 'circle', center: ZONE, radius: 500, color: '#00c391' },
})
check('create zone', r.status, 200)
const testZoneId = r.data.geofence?.id

/* ── alert rules ──────────────────────────────────────────────── */
section('alert rules')

r = await call('/alert-rules', { as: 'admin' })
check('GET /alert-rules', r.status, 200)
ok('rules are seeded', r.data.rules?.length >= 6, `got ${r.data.rules?.length}`)

check('unknown rule type rejected', (await call('/alert-rules', { method: 'POST', as: 'admin', body: { type: 'nonsense' } })).status, 400)
check('speed rule with no threshold rejected', (await call('/alert-rules', { method: 'POST', as: 'admin', body: { type: 'speed', vehicles: 'all' } })).status, 400)
check('bad channel rejected', (await call('/alert-rules', { method: 'POST', as: 'admin', body: { type: 'sos', vehicles: 'all', channels: ['carrier-pigeon'] } })).status, 400)

r = await call('/alert-rules', {
  method: 'POST',
  as: 'admin',
  body: { type: 'speed', threshold: 60, vehicles: 'all', channels: ['web'], severity: 'high', active: true },
})
check('create speed rule', r.status, 200)
const speedRuleId = r.data.rule?.id

r = await call('/alert-rules', {
  method: 'POST',
  as: 'admin',
  body: { type: 'geofenceOut', vehicles: 'all', channels: ['web'], severity: 'medium', active: true },
})
check('create geofence-out rule', r.status, 200)
const zoneRuleId = r.data.rule?.id

/* ── maintenance ──────────────────────────────────────────────── */
section('maintenance')

r = await call('/maintenance', { as: 'admin' })
check('GET /maintenance', r.status, 200)
const firstRecord = r.data.maintenance?.[0]
ok('schedule is seeded', r.data.maintenance?.length >= 10, `got ${r.data.maintenance?.length}`)
ok('records carry derived state', ['overdue', 'soon', 'planned'].includes(firstRecord?.state), `got ${firstRecord?.state}`)
ok('records carry a current reading', Number.isFinite(firstRecord?.current), `got ${firstRecord?.current}`)

r = await call(`/maintenance?id=${firstRecord.id}&action=complete`, { method: 'POST', as: 'admin' })
check('complete a job', r.status, 200)
check('completing resets the period', r.data.record?.state, 'planned')
ok('completion is stamped', Boolean(r.data.record?.lastDoneAt))

r = await call('/maintenance', {
  method: 'POST',
  as: 'admin',
  body: { vehicleId: newVehicleId, type: 'oil', kind: 'odometer', period: 5000, cost: 300, vendorEn: 'Test Workshop' },
})
check('create a job', r.status, 200)
check('a new job starts on schedule', r.data.record?.state, 'planned')
const newMaintId = r.data.record?.id

check('unknown job type rejected', (await call('/maintenance', { method: 'POST', as: 'admin', body: { vehicleId: 1, type: 'wings', kind: 'odometer', period: 100 } })).status, 400)

/* ── tracking, trail and alerts ───────────────────────────────── */
section('tracking → trail → alerts')

await call('/alerts?all=1', { method: 'DELETE', as: 'admin' })

/* the driver seeded as a.mutairi drives vehicle 1 */
const DRIVER_VEHICLE = 1
const now = Date.now()
const journeyLength = 7

/* Parked inside the zone, then a drive north that leaves it and speeds up past
   the 60 km/h rule written above. Points are a minute apart, which is what the
   trail's minimum-gap filter expects of a real device. */
const journey = [
  { speed: 0, dLat: 0 },
  { speed: 0, dLat: 0 },
  { speed: 25, dLat: 0.002 },
  { speed: 70, dLat: 0.012 },
  { speed: 95, dLat: 0.026 },
  { speed: 88, dLat: 0.040 },
  { speed: 30, dLat: 0.048 },
].map((p, i) => ({
  lat: Number((ZONE.lat + p.dLat).toFixed(6)),
  lng: ZONE.lng,
  speed: p.speed,
  heading: 0,
  battery: 90 - i,
  at: new Date(now - (journeyLength - i) * 60000).toISOString(),
}))

check('track without a token → 401', (await call('/track', { method: 'POST', body: journey[0] })).status, 401)
check('track as the dashboard → 403', (await call('/track', { method: 'POST', as: 'admin', body: journey[0] })).status, 403)
check('a fix with no coordinates → 400', (await call('/track', { method: 'POST', token: driverToken, body: { speed: 10 } })).status, 400)

r = await call('/track', { method: 'POST', token: driverToken, body: { points: journey } })
check('driver posts a batch', r.status, 200)
check('every point accepted', r.data.accepted, journey.length)
ok('the batch raised alerts', r.data.alerts > 0, `got ${r.data.alerts}`)

r = await call('/positions', { as: 'admin' })
check('GET /positions', r.status, 200)
const fix = r.data.positions?.find((p) => p.vehicleId === DRIVER_VEHICLE)
ok('the driven vehicle is on the map', Boolean(fix))
check('its position is the last point', fix?.lat, journey[journey.length - 1].lat)
check('its status is derived', fix?.status, 'moving')
ok('the fix carries its plate', typeof fix?.plate === 'string')

/* the Saudi day, which is the day the server files a fix under */
const today = dayOf()
r = await call(`/history?vehicle=${DRIVER_VEHICLE}&date=${today}`, { as: 'admin' })
check('GET /history', r.status, 200)
ok('the trail was recorded', r.data.points?.length >= journey.length, `got ${r.data.points?.length}`)
ok('the day has totals', Number.isFinite(r.data.stats?.totalDistance), `got ${r.data.stats?.totalDistance}`)
ok('the day found a trip', r.data.trips?.length >= 1, `got ${r.data.trips?.length}`)

r = await call(`/history?vehicle=${DRIVER_VEHICLE}&days=1`, { as: 'admin' })
ok('the day index lists today', r.data.days?.includes(today), `got ${JSON.stringify(r.data.days)}`)

check('history needs a vehicle → 400', (await call('/history', { as: 'admin' })).status, 400)
check('history rejects a bad date → 400', (await call(`/history?vehicle=1&date=yesterday`, { as: 'admin' })).status, 400)

r = await call('/alerts', { as: 'admin' })
check('GET /alerts', r.status, 200)
const alerts = r.data.alerts ?? []
ok('speeding was caught', alerts.some((a) => a.type === 'speed'), `types: ${alerts.map((a) => a.type).join(', ')}`)
ok('leaving the zone was caught', alerts.some((a) => a.type === 'geofenceOut'), `types: ${alerts.map((a) => a.type).join(', ')}`)
ok('alerts name the vehicle', alerts.every((a) => a.vehicleId === DRIVER_VEHICLE))
ok('unread is counted', r.data.unread === alerts.filter((a) => !a.read).length)

/* the same conditions again must not double the inbox */
const before = alerts.length
await call('/track', {
  method: 'POST',
  token: driverToken,
  body: { ...journey[journey.length - 1], at: new Date(now - 15000).toISOString() },
})
r = await call('/alerts', { as: 'admin' })
ok('a steady state does not re-fire', r.data.alerts.length === before, `${before} → ${r.data.alerts.length}`)

const oneAlert = r.data.alerts[0]?.id
r = await call(`/alerts?id=${encodeURIComponent(oneAlert)}`, { method: 'PATCH', as: 'admin' })
check('mark one read', r.status, 200)
ok('it is read now', r.data.alerts.find((a) => a.id === oneAlert)?.read === true)

r = await call('/alerts', { method: 'PATCH', as: 'admin' })
check('mark all read', r.data.unread, 0)

/* ── reports ──────────────────────────────────────────────────── */
section('reports')

r = await call(`/reports?type=general&from=${today}&to=${today}`, { as: 'admin' })
check('GET /reports general', r.status, 200)
const row = r.data.rows?.find((x) => x.vehicleId === DRIVER_VEHICLE)
ok('the driven vehicle has a row', Boolean(row))
ok('it covered some distance', row?.distance > 0, `got ${row?.distance}`)
ok('it recorded a violation', row?.violations >= 1, `got ${row?.violations}`)

r = await call(`/reports?type=driving&from=${today}&to=${today}&vehicles=${DRIVER_VEHICLE}`, { as: 'admin' })
check('GET /reports driving', r.status, 200)
ok('a trip is listed', r.data.rows?.length >= 1, `got ${r.data.rows?.length}`)

r = await call(`/reports?type=speed&from=${today}&to=${today}&vehicles=${DRIVER_VEHICLE}`, { as: 'admin' })
check('GET /reports speed', r.status, 200)
/* the day may already hold a seeded trail, so look for our episode among the
   rows rather than assuming it is the first one of the day */
ok('the speeding episode is listed', r.data.rows?.length >= 1, `got ${r.data.rows?.length}`)
ok(
  'it reports the peak speed',
  r.data.rows?.some((row) => row.speed >= 90),
  `peaks: ${r.data.rows?.map((row) => row.speed).join(', ')}`,
)

check('unknown report type → 400', (await call('/reports?type=fictional', { as: 'admin' })).status, 400)
check('backwards range → 400', (await call(`/reports?from=${today}&to=2020-01-01`, { as: 'admin' })).status, 400)
check('over-long range → 400', (await call('/reports?from=2020-01-01&to=2024-01-01', { as: 'admin' })).status, 400)

/* ── driver scoping ───────────────────────────────────────────── */
section('driver may only see their own vehicle')

r = await call('/positions', { token: driverToken })
ok('driver sees only their vehicle', r.data.positions?.every((p) => p.vehicleId === DRIVER_VEHICLE), `got ${r.data.positions?.length} rows`)

check('driver may not replay another vehicle → 403', (await call('/history?vehicle=2&date=' + today, { token: driverToken })).status, 403)
check('driver may replay their own', (await call(`/history?vehicle=${DRIVER_VEHICLE}&date=${today}`, { token: driverToken })).status, 200)
check('driver may not edit the registry → 403', (await call('/vehicles', { method: 'POST', token: driverToken, body: { plate: 'X', modelEn: 'X' } })).status, 403)

r = await call('/alerts', { token: driverToken })
ok('driver sees only their own alerts', r.data.alerts?.every((a) => a.vehicleId === DRIVER_VEHICLE))

/* ── end of shift ─────────────────────────────────────────────── */
section('end of shift')

check('driver ends the shift', (await call('/track', { method: 'DELETE', token: driverToken })).status, 200)
r = await call('/positions', { as: 'admin' })
ok('the vehicle left the live map', !r.data.positions?.some((p) => p.vehicleId === DRIVER_VEHICLE))

r = await call(`/history?vehicle=${DRIVER_VEHICLE}&date=${today}`, { as: 'admin' })
ok('but its trail survived', r.data.points?.length >= 3, `got ${r.data.points?.length}`)

/* ── clean up ─────────────────────────────────────────────────── */
section('clean up')

check('delete the test job', (await call(`/maintenance?id=${newMaintId}`, { method: 'DELETE', as: 'admin' })).status, 200)
check('delete the test rules', (await call(`/alert-rules?id=${speedRuleId}`, { method: 'DELETE', as: 'admin' })).status, 200)
await call(`/alert-rules?id=${zoneRuleId}`, { method: 'DELETE', as: 'admin' })
check('delete the test zone', (await call(`/geofences?id=${testZoneId}`, { method: 'DELETE', as: 'admin' })).status, 200)
check('delete the test polygon', (await call(`/geofences?id=${polyId}`, { method: 'DELETE', as: 'admin' })).status, 200)
check('delete the test vehicle', (await call(`/vehicles?id=${newVehicleId}`, { method: 'DELETE', as: 'admin' })).status, 200)
check('deleting it twice → 404', (await call(`/vehicles?id=${newVehicleId}`, { method: 'DELETE', as: 'admin' })).status, 404)
await call('/alerts?all=1', { method: 'DELETE', as: 'admin' })

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
