/**
 * Support-thread contract test. Start the app first, then:
 *   npm run test:support              # against http://localhost:5174
 *   API_BASE=http://localhost:5181 npm run test:support
 *
 * It writes real messages into the first driver's thread, so point it at a
 * development store rather than a live one.
 */
const ORIGIN = process.env.API_BASE || 'http://localhost:5174'
const BASE = `${ORIGIN}/api`
let pass = 0
let fail = 0

/* the dashboard authenticates with a cookie and the driver app with a bearer
   token — the same endpoint has to answer both, so the test speaks both */
const cookies = {}
const tokens = {}

async function call(path, { method = 'GET', body, as, bearer } = {}) {
  const headers = {}
  if (body) headers['Content-Type'] = 'application/json'
  if (as && cookies[as]) headers.Cookie = cookies[as]
  if (bearer && tokens[bearer]) headers.Authorization = `Bearer ${tokens[bearer]}`
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  return { status: res.status, data, cookie: res.headers.get('set-cookie')?.split(';')[0] }
}

function check(label, actual, expected) {
  const good = actual === expected
  good ? pass++ : fail++
  console.log(
    `${good ? 'PASS' : 'FAIL'}  ${label}` +
      (good ? '' : `  (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`),
  )
}

/* ── guards ───────────────────────────────────────────────────── */
check('GET /support anonymous → 401', (await call('/support')).status, 401)

let r = await call('/auth/login', {
  method: 'POST',
  body: { username: 'a.mutairi', password: 'Driver@123', client: 'app' },
})
tokens.driver = r.data.token
check('driver login → 200', r.status, 200)
check('driver login returns a token', typeof tokens.driver, 'string')

r = await call('/auth/login', { method: 'POST', body: { username: 'k.otaibi', password: 'Mirsad@123' } })
cookies.admin = r.cookie
check('admin login → 200', r.status, 200)

/* ── the driver writes ────────────────────────────────────────── */
r = await call('/support', {
  method: 'POST',
  bearer: 'driver',
  body: { text: 'المكيّف معطّل في المركبة' },
})
check('driver posts → 200', r.status, 200)
check('the message is filed as the driver’s', r.data.message?.from, 'driver')

r = await call('/support', { bearer: 'driver' })
check('driver reads their own thread', r.data.thread?.messages?.length >= 1, true)
check('a driver never has unread of their own', r.data.unread, 0)

/* the thread is the driver's own and nobody else's */
check('driver reading another thread → 403', (await call('/support?driver=8', { bearer: 'driver' })).status, 403)
check(
  'driver posting into another thread → 403',
  (await call('/support', { method: 'POST', bearer: 'driver', body: { driver: 8, text: 'x' } })).status,
  403,
)
check(
  'empty message → 400',
  (await call('/support', { method: 'POST', bearer: 'driver', body: { text: '   ' } })).status,
  400,
)

/* ── the office reads and replies ─────────────────────────────── */
r = await call('/support', { as: 'admin' })
check('inbox lists threads', Array.isArray(r.data.threads), true)
const thread = r.data.threads.find((t) => t.username === 'a.mutairi')
check('a thread carries the driver’s name', thread?.nameAr, 'أحمد المطيري')
check('the office sees it unread', thread?.staffUnread > 0, true)
check('the inbox totals the unread', r.data.unread > 0, true)

r = await call('/support', {
  method: 'POST',
  as: 'admin',
  body: { driver: thread.driverId, text: 'وصلتنا — الورشة اليوم ٤ عصرًا' },
})
check('staff reply → 200', r.status, 200)
check('the reply is filed as staff', r.data.message?.from, 'staff')
check('the reply is signed by the account', r.data.message?.authorAr, 'خالد العتيبي')
check('replying is reading — staff unread clears', r.data.thread?.staffUnread, 0)

r = await call('/support', { bearer: 'driver' })
check('the driver now has an unread reply', r.data.unread, 1)
check('the driver sees both messages', r.data.thread?.messages?.length >= 2, true)

check('driver marks read → 200', (await call('/support', { method: 'PATCH', bearer: 'driver' })).status, 200)
check('driver unread cleared', (await call('/support', { bearer: 'driver' })).data.unread, 0)

r = await call(`/support?driver=${thread.driverId}`, { as: 'admin' })
check('staff read one thread → 200', r.status, 200)
check('it names whose thread it is', r.data.driver?.username, 'a.mutairi')

/* a viewer watches the fleet; support is not theirs to answer */
r = await call('/auth/login', { method: 'POST', body: { username: 'n.salem', password: 'Mirsad@123' } })
cookies.viewer = r.cookie
check('viewer inbox → 403', (await call('/support', { as: 'viewer' })).status, 403)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
