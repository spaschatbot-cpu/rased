/**
 * Account + driver-app contract test.
 *
 *   npm run test:users                    # against http://localhost:5176
 *   API_BASE=http://localhost:5173 npm run test:users
 *
 * Creates and deletes accounts, so point it at a dev or staging server.
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
  if (bearer && tokens[bearer]) headers.Authorization = `Bearer ${tokens[bearer]}`
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
  const data = await res.json().catch(() => ({}))
  return { status: res.status, data, res }
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

/* ── sign-in ──────────────────────────────────────────────────── */
let r = await signIn('admin', 'superadmin', 'Mirsad@2026')
check('super-admin signs in', r.status, 200)
check('hash never leaves the server', r.data.user?.pass, undefined)

r = await signIn('ops', '7034710512', '7034710512')
check('admin signs in', r.status, 200)

r = await signIn('viewer', 'n.salem', 'Mirsad@123')
check('viewer signs in', r.status, 200)

/* ── who may see accounts ─────────────────────────────────────── */
check('anonymous cannot list', (await call('/users')).status, 401)
check('viewer cannot list', (await call('/users', { as: 'viewer' })).status, 403)
check('admin can list', (await call('/users', { as: 'ops' })).status, 200)

r = await call('/users', { as: 'admin' })
check('super-admin can list', r.status, 200)
check('no hashes in the list', r.data.users.every((u) => u.pass === undefined), true)

/* ── validation ───────────────────────────────────────────────── */
const base = { nameAr: 'اختبار', nameEn: 'Test', role: 'driver', groupId: 1 }
check('username required', (await call('/users', { method: 'POST', as: 'admin', body: { ...base, password: 'Secret123' } })).status, 400)
check('password required on create', (await call('/users', { method: 'POST', as: 'admin', body: { ...base, username: 't.one' } })).status, 400)
check('short password rejected', (await call('/users', { method: 'POST', as: 'admin', body: { ...base, username: 't.one', password: '123' } })).status, 400)
check('bad role rejected', (await call('/users', { method: 'POST', as: 'admin', body: { ...base, username: 't.one', role: 'root', password: 'Secret123' } })).status, 400)
/* `manager` was merged into `admin`; the server must no longer accept it */
check('retired role rejected', (await call('/users', { method: 'POST', as: 'admin', body: { ...base, username: 't.one', role: 'manager', password: 'Secret123' } })).status, 400)
check('bad email rejected', (await call('/users', { method: 'POST', as: 'admin', body: { ...base, username: 't.one', email: 'nope', password: 'Secret123' } })).status, 400)
check('duplicate username rejected', (await call('/users', { method: 'POST', as: 'admin', body: { ...base, username: 'a.mutairi', password: 'Secret123' } })).status, 400)
check('odd characters rejected', (await call('/users', { method: 'POST', as: 'admin', body: { ...base, username: 'bad name!', password: 'Secret123' } })).status, 400)

/* ── create a driver, then sign into the app as them ──────────── */
r = await call('/users', {
  method: 'POST',
  as: 'admin',
  body: { ...base, username: 'T.Driver', email: 't@lamar.sa', vehicleId: 4, password: 'Secret123' },
})
check('driver created', r.status, 200)
check('username normalised to lowercase', r.data.user?.username, 't.driver')
check('vehicle assigned', r.data.user?.vehicleId, 4)
const driverId = r.data.user?.id

r = await signIn('newdriver', 't.driver', 'Secret123', 'app')
check('new driver signs into the app', r.status, 200)
check('app gets a token', typeof r.data.token, 'string')
check('app learns its vehicle', r.data.user?.vehicleId, 4)

r = await call('/auth/me', { bearer: 'newdriver' })
check('token authenticates', r.data.user?.username, 't.driver')

/* ── the app is drivers only ──────────────────────────────────── */
check('admin refused by the app', (await signIn('x', '7034710512', '7034710512', 'app')).status, 403)
check('driver cannot list accounts', (await call('/users', { bearer: 'newdriver' })).status, 403)

/* ── update ───────────────────────────────────────────────────── */
r = await call(`/users?id=${driverId}`, {
  method: 'PUT',
  as: 'admin',
  body: { nameAr: 'اختبار', nameEn: 'Test', username: 't.driver', role: 'driver', groupId: 2, vehicleId: 5 },
})
check('update without a password succeeds', r.status, 200)
check('vehicle changed', r.data.user?.vehicleId, 5)
check('old password still works', (await signIn('again', 't.driver', 'Secret123', 'app')).status, 200)

r = await call(`/users?id=${driverId}`, {
  method: 'PUT',
  as: 'admin',
  body: { nameAr: 'اختبار', nameEn: 'Test', username: 't.driver', role: 'driver', groupId: 2, password: 'Changed123' },
})
check('password change accepted', r.status, 200)
check('old password now fails', (await signIn('old', 't.driver', 'Secret123', 'app')).status, 401)
check('new password works', (await signIn('new', 't.driver', 'Changed123', 'app')).status, 200)

/* switching away from driver clears the vehicle link */
r = await call(`/users?id=${driverId}`, {
  method: 'PUT',
  as: 'admin',
  body: { nameAr: 'اختبار', nameEn: 'Test', username: 't.driver', role: 'viewer', groupId: 2, vehicleId: 5 },
})
check('non-driver has no vehicle', r.data.user?.vehicleId, null)

/* a disabled account cannot sign in */
await call(`/users?id=${driverId}`, {
  method: 'PUT',
  as: 'admin',
  body: { nameAr: 'اختبار', nameEn: 'Test', username: 't.driver', role: 'driver', groupId: 2, active: false },
})
check('disabled account refused', (await signIn('off', 't.driver', 'Changed123', 'app')).status, 403)

/* ── privilege boundaries ─────────────────────────────────────── */
check(
  'admin cannot mint a super-admin',
  (await call('/users', { method: 'POST', as: 'ops', body: { nameAr: 'x', nameEn: 'x', username: 'sneaky', role: 'superadmin', groupId: 1, password: 'Secret123' } })).status,
  403,
)
const superAdminRow = (await call('/users', { as: 'admin' })).data.users.find((u) => u.role === 'superadmin')
check(
  'admin cannot edit a super-admin',
  (await call(`/users?id=${superAdminRow.id}`, { method: 'PUT', as: 'ops', body: { nameAr: 'x', nameEn: 'x', username: superAdminRow.username, role: 'superadmin', groupId: 1 } })).status,
  403,
)
check('nobody deletes themselves', (await call(`/users?id=${superAdminRow.id}`, { method: 'DELETE', as: 'admin' })).status, 400)
check('missing id rejected', (await call('/users', { method: 'DELETE', as: 'admin' })).status, 400)
check('unknown id rejected', (await call('/users?id=99999', { method: 'DELETE', as: 'admin' })).status, 404)
check('viewer cannot create', (await call('/users', { method: 'POST', as: 'viewer', body: { ...base, username: 'v.x', password: 'Secret123' } })).status, 403)

/* ── cleanup ──────────────────────────────────────────────────── */
check('driver deleted', (await call(`/users?id=${driverId}`, { method: 'DELETE', as: 'admin' })).status, 200)
check('deleted driver cannot sign in', (await signIn('gone', 't.driver', 'Changed123', 'app')).status, 401)

const finalList = (await call('/users', { as: 'admin' })).data.users
check('table back to its seeded size', finalList.length, 8)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
