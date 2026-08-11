/**
 * Page grants and self-service profile.
 *
 * Start the app first, then:
 *   npm run test:access
 *   API_BASE=http://localhost:5181 npm run test:access
 *
 * It edits a viewer's grants and a manager's profile, and puts both back.
 */
import { APP_PAGES, ROLE_PAGES, pagesFor } from '../shared/app-pages.js'

const ORIGIN = process.env.API_BASE || 'http://localhost:5174'
const BASE = `${ORIGIN}/api`
let pass = 0
let fail = 0

const cookies = {}

async function call(path, { method = 'GET', body, as } = {}) {
  const headers = {}
  if (body) headers['Content-Type'] = 'application/json'
  if (as && cookies[as]) headers.Cookie = cookies[as]
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  return { status: res.status, data, cookie: res.headers.get('set-cookie')?.split(';')[0] }
}

function check(label, actual, expected) {
  const good = JSON.stringify(actual) === JSON.stringify(expected)
  good ? pass++ : fail++
  console.log(
    `${good ? 'PASS' : 'FAIL'}  ${label}` +
      (good ? '' : `  (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`),
  )
}

const ok = (label, cond, detail = '') => check(label + (cond || !detail ? '' : ` — ${detail}`), Boolean(cond), true)

/* ── the defaults the browser and the server share ────────────── */
check('a viewer defaults to three pages', pagesFor({ role: 'viewer' }), ROLE_PAGES.viewer)
check('an explicit grant wins', pagesFor({ role: 'viewer', pages: ['alerts'] }), ['alerts'])
check('an unknown page key is dropped', pagesFor({ role: 'viewer', pages: ['alerts', 'nuke'] }), ['alerts'])
check('a super-admin is never limited', pagesFor({ role: 'superadmin', pages: [] }), APP_PAGES)

/* ── sign in ──────────────────────────────────────────────────── */
let r = await call('/auth/login', { method: 'POST', body: { username: 'k.otaibi', password: 'Mirsad@123' } })
cookies.admin = r.cookie
check('admin login → 200', r.status, 200)

r = await call('/auth/login', { method: 'POST', body: { username: 'n.salem', password: 'Mirsad@123' } })
cookies.viewer = r.cookie
check('viewer login → 200', r.status, 200)

/* ── grants ───────────────────────────────────────────────────── */
r = await call('/auth/me', { as: 'viewer' })
const viewer = r.data.user
check('a fresh account carries no hand-written grant', viewer.pages ?? null, null)
check('so it follows its role', pagesFor(viewer), ROLE_PAGES.viewer)

r = await call(`/users?id=${viewer.id}`, { method: 'PUT', as: 'admin', body: { ...viewer, pages: ['dashboard', 'alerts'] } })
check('admin grants two pages → 200', r.status, 200)
check('the grant is stored', r.data.user.pages, ['dashboard', 'alerts'])

r = await call('/auth/me', { as: 'viewer' })
check('the viewer reads its own grant back', r.data.user.pages, ['dashboard', 'alerts'])
check('and the shared rule agrees', pagesFor(r.data.user), ['dashboard', 'alerts'])

r = await call(`/users?id=${viewer.id}`, { method: 'PUT', as: 'admin', body: { ...viewer, pages: ['dashboard', 'ghost'] } })
check('an invented page is refused entry', r.data.user.pages, ['dashboard'])

r = await call(`/users?id=${viewer.id}`, { method: 'PUT', as: 'admin', body: { ...viewer, pages: [] } })
check('no pages at all is a real answer', r.data.user.pages, [])

/* a grant must not be a way around the role: the viewer still cannot write */
check(
  'granted "manage" is still not permission to write',
  (await call('/vehicles', { method: 'POST', as: 'viewer', body: { plate: 'X', modelEn: 'X' } })).status,
  403,
)
check('nor to edit accounts', (await call('/users', { as: 'viewer' })).status, 403)

/* a form that carries no pages field leaves the grant alone */
r = await call(`/users?id=${viewer.id}`, { method: 'PUT', as: 'admin', body: { ...viewer, pages: ['reports'] } })
const { pages: _dropped, ...noPages } = r.data.user
r = await call(`/users?id=${viewer.id}`, { method: 'PUT', as: 'admin', body: { ...noPages, nameEn: 'Noura Al-Salem' } })
check('an unrelated edit keeps the grant', r.data.user.pages, ['reports'])

/* back to following the role */
r = await call(`/users?id=${viewer.id}`, { method: 'PUT', as: 'admin', body: { ...viewer, pages: null } })
check('a grant can be handed back to the role', r.data.user.pages ?? null, null)

/* ── self-service profile ─────────────────────────────────────── */
r = await call('/auth/me', { as: 'admin' })
const me = r.data.user

check('anonymous cannot edit a profile', (await call('/auth/me', { method: 'PUT' })).status, 401)

r = await call('/auth/me', { method: 'PUT', as: 'admin', body: { ...me, phone: '+966500000001', email: 'k.otaibi@lamar.sa' } })
check('saving my own profile → 200', r.status, 200)
check('the phone is stored', r.data.user.phone, '+966500000001')
check('the hash never comes back', r.data.user.pass, undefined)

r = await call('/auth/me', { method: 'PUT', as: 'admin', body: { ...me, email: 'not-an-email' } })
check('a bad email is refused', r.status, 400)

r = await call('/auth/me', { method: 'PUT', as: 'admin', body: { ...me, nameAr: '', nameEn: '' } })
check('a nameless account is refused', r.status, 400)

/* what this endpoint refuses to read is the point of it */
r = await call('/auth/me', { method: 'PUT', as: 'viewer', body: { nameEn: 'Noura', role: 'superadmin', pages: APP_PAGES, groupId: 9 } })
check('a viewer editing themselves → 200', r.status, 200)
check('but cannot promote themselves', r.data.user.role, 'viewer')
check('nor grant themselves pages', r.data.user.pages ?? null, null)
check('nor move themselves to another branch', r.data.user.groupId, viewer.groupId)

/* ── password ─────────────────────────────────────────────────── */
r = await call('/auth/me', { method: 'PUT', as: 'admin', body: { ...me, currentPassword: 'wrong', newPassword: 'Mirsad@999' } })
check('a wrong current password → 403', r.status, 403)

r = await call('/auth/me', { method: 'PUT', as: 'admin', body: { ...me, currentPassword: 'Mirsad@123', newPassword: 'short' } })
check('a short new password → 400', r.status, 400)

r = await call('/auth/me', { method: 'PUT', as: 'admin', body: { ...me, currentPassword: 'Mirsad@123', newPassword: 'Mirsad@999' } })
check('the change is accepted', r.status, 200)
check('the old password stops working', (await call('/auth/login', { method: 'POST', body: { username: 'k.otaibi', password: 'Mirsad@123' } })).status, 401)
check('the new one works', (await call('/auth/login', { method: 'POST', body: { username: 'k.otaibi', password: 'Mirsad@999' } })).status, 200)

/* put it back so the documented account keeps working */
r = await call('/auth/me', { method: 'PUT', as: 'admin', body: { ...me, phone: '', currentPassword: 'Mirsad@999', newPassword: 'Mirsad@123' } })
check('restored', r.status, 200)
check('and the documented password works again', (await call('/auth/login', { method: 'POST', body: { username: 'k.otaibi', password: 'Mirsad@123' } })).status, 200)

/* put the viewer back too */
await call(`/users?id=${viewer.id}`, { method: 'PUT', as: 'admin', body: { ...viewer, pages: null } })
r = await call('/auth/me', { as: 'viewer' })
ok('the viewer is back to its role defaults', (r.data.user.pages ?? null) === null)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
