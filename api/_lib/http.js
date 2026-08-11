/**
 * Request/response helpers.
 *
 * Handlers use plain Node `req`/`res` only — no framework sugar — so the exact
 * same modules run under Vercel's Node runtime in production and under the
 * Vite dev middleware locally.
 */

/** Read and parse a JSON body. Rejects oversized or malformed payloads. */
export async function readJson(req, limit = 512 * 1024) {
  /* Vercel may have parsed it already */
  if (req.body && typeof req.body === 'object') return req.body

  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) {
      const err = new Error('payload too large')
      err.statusCode = 413
      throw err
    }
    chunks.push(chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    const err = new Error('invalid JSON body')
    err.statusCode = 400
    throw err
  }
}

export function send(res, status, data, headers = {}) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  /* content is per-user and changes on every edit — never let a CDN hold it */
  res.setHeader('Cache-Control', 'no-store')
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v)
  res.end(JSON.stringify(data))
}

export const ok = (res, data = { ok: true }, headers) => send(res, 200, data, headers)
export const fail = (res, status, message) => send(res, status, { ok: false, error: message })

/** Wrap a handler so thrown errors become clean JSON instead of a stack trace. */
export function handler(routes) {
  return async (req, res) => {
    const method = (req.method || 'GET').toUpperCase()
    const run = routes[method]
    if (!run) {
      res.setHeader('Allow', Object.keys(routes).join(', '))
      return fail(res, 405, `method ${method} not allowed`)
    }
    try {
      return await run(req, res)
    } catch (err) {
      const status = err.statusCode || 500
      if (status >= 500) console.error('[api]', err)
      return fail(res, status, status >= 500 ? 'internal error' : err.message)
    }
  }
}

/* ── cookies ─────────────────────────────────────────────────────── */

export function readCookie(req, name) {
  const header = req.headers?.cookie
  if (!header) return null
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i < 0) continue
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim())
  }
  return null
}

export function serializeCookie(name, value, { maxAge, secure } = {}) {
  const bits = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ]
  if (maxAge != null) bits.push(`Max-Age=${maxAge}`)
  if (secure ?? process.env.NODE_ENV === 'production') bits.push('Secure')
  return bits.join('; ')
}
