/**
 * Backend contract test. Start the app first, then:
 *   npm run test:api                  # against http://localhost:5174
 *   API_BASE=https://site.com npm run test:api
 *
 * It writes and then resets the site document, so point it at a staging
 * deployment rather than a live one.
 */
const ORIGIN = process.env.API_BASE || 'http://localhost:5174'
const BASE = `${ORIGIN}/api`
let pass = 0
let fail = 0

const cookies = {}
function jar(name, res) {
  const sc = res.headers.get('set-cookie')
  if (sc) cookies[name] = sc.split(';')[0]
}

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
  return { status: res.status, data, res }
}

function check(label, actual, expected) {
  const good = actual === expected
  good ? pass++ : fail++
  console.log(`${good ? 'PASS' : 'FAIL'}  ${label}${good ? '' : `  (got ${actual}, want ${expected})`}`)
}

/* ── public reads ─────────────────────────────────────────────── */
let r = await call('/site')
check('GET /site is public', r.status, 200)
check('GET /site returns a document', typeof r.data.site?.order?.length, 'number')

r = await call('/auth/me')
check('GET /auth/me anonymous', r.data.user, null)

/* ── guards before login ──────────────────────────────────────── */
check('PUT /site anonymous → 401', (await call('/site', { method: 'PUT', body: {} })).status, 401)
check('GET /messages anonymous → 401', (await call('/messages')).status, 401)
check('DELETE /messages anonymous → 401', (await call('/messages?id=x', { method: 'DELETE' })).status, 401)

/* ── login ────────────────────────────────────────────────────── */
check('login wrong password → 401', (await call('/auth/login', { method: 'POST', body: { username: 'superadmin', password: 'nope' } })).status, 401)
check('login unknown user → 401', (await call('/auth/login', { method: 'POST', body: { username: 'ghost', password: 'x' } })).status, 401)
check('login empty → 400', (await call('/auth/login', { method: 'POST', body: {} })).status, 400)

r = await call('/auth/login', { method: 'POST', body: { username: 'superadmin', password: 'Mirsad@2026' } })
jar('admin', r.res)
check('admin login → 200', r.status, 200)
check('admin role', r.data.user?.role, 'superadmin')
check('password hash never sent', r.data.user?.pass, undefined)

r = await call('/auth/login', { method: 'POST', body: { username: '7034710512', password: '7034710512' } })
jar('demo', r.res)
check('demo login → 200', r.status, 200)
check('demo role', r.data.user?.role, 'admin')

/* ── role separation ──────────────────────────────────────────── */
check('demo PUT /site → 403', (await call('/site', { method: 'PUT', body: {}, as: 'demo' })).status, 403)
check('demo GET /messages → 403', (await call('/messages', { as: 'demo' })).status, 403)

/* ── session restore ──────────────────────────────────────────── */
r = await call('/auth/me', { as: 'admin' })
check('me with cookie', r.data.user?.username, 'superadmin')

/* ── content write + validation ───────────────────────────────── */
r = await call('/site', {
  method: 'PUT',
  as: 'admin',
  body: {
    text: { ar: { 'hero.badge': 'من السيرفر', 'not.a.real.key': 'x', 'hero.cta': '   ' }, en: {} },
    hidden: ['faq', 'faq', 'nonsense'],
    order: ['cta'],
  },
})
check('admin PUT /site → 200', r.status, 200)
check('unknown key stripped', r.data.site.text.ar['not.a.real.key'], undefined)
check('blank override stripped', r.data.site.text.ar['hero.cta'], undefined)
check('real edit kept', r.data.site.text.ar['hero.badge'], 'من السيرفر')
check('bogus section stripped', r.data.site.hidden.includes('nonsense'), false)
check('hidden deduped', r.data.site.hidden.length, 1)
check('order completed to 9', r.data.site.order.length, 9)
check('order respects admin choice', r.data.site.order[0], 'cta')

/* ── the whole point: anonymous visitors see it ───────────────── */
r = await call('/site')
check('anonymous sees the edit', r.data.site.text.ar['hero.badge'], 'من السيرفر')
check('anonymous sees the layout', r.data.site.hidden[0], 'faq')

/* ── contact form ─────────────────────────────────────────────── */
check('message needs name+phone', (await call('/messages', { method: 'POST', body: { name: 'x' } })).status, 400)
check('message rejects bad email', (await call('/messages', { method: 'POST', body: { name: 'x', phone: '1', email: 'bad' } })).status, 400)

r = await call('/messages', { method: 'POST', body: { name: 'سارة', phone: '+966500000000', email: 'sara@co.sa', fleet: '51-200', message: 'استفسار' } })
check('public can send a message', r.status, 200)
check('response leaks nothing', r.data.id, undefined)

r = await call('/messages', { as: 'admin' })
check('admin reads inbox', r.status, 200)
const mine = r.data.messages.find((m) => m.name === 'سارة')
check('message stored intact', mine?.message, 'استفسار')
check('arabic preserved', mine?.name, 'سارة')

check('admin deletes it', (await call(`/messages?id=${mine.id}`, { method: 'DELETE', as: 'admin' })).status, 200)
check('deleting twice → 404', (await call(`/messages?id=${mine.id}`, { method: 'DELETE', as: 'admin' })).status, 404)
check('delete needs an id', (await call('/messages', { method: 'DELETE', as: 'admin' })).status, 400)

/* ── tampering ────────────────────────────────────────────────── */
cookies.forged = 'mirsad_session=eyJ1Ijoic3VwZXJhZG1pbiIsInIiOiJzdXBlcmFkbWluIiwiZSI6OTk5OTk5OTk5OTk5OX0.deadbeef'
check('forged cookie rejected', (await call('/site', { method: 'PUT', body: {}, as: 'forged' })).status, 401)

/* ── logout ───────────────────────────────────────────────────── */
r = await call('/auth/logout', { method: 'POST', as: 'admin' })
check('logout → 200', r.status, 200)
check('logout clears the cookie', /mirsad_session=;|Max-Age=0/.test(r.res.headers.get('set-cookie') || ''), true)

/* ── method + route errors ────────────────────────────────────── */
check('PATCH /site → 405', (await call('/site', { method: 'PATCH' })).status, 405)
check('unknown route → 404', (await call('/nope')).status, 404)
check('private lib not routable', (await call('/_lib/auth')).status, 404)

/* ── reset so the repo ships clean ────────────────────────────── */
r = await call('/auth/login', { method: 'POST', body: { username: 'superadmin', password: 'Mirsad@2026' } })
jar('admin', r.res)
await call('/site', { method: 'PUT', as: 'admin', body: { text: { ar: {}, en: {} }, hidden: [], order: [] } })
r = await call('/site')
check('reset to shipped copy', Object.keys(r.data.site.text.ar).length, 0)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
