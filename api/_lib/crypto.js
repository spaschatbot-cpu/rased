/**
 * Password hashing and session tokens.
 *
 * Kept apart from auth.js so the account table and the request guards can both
 * use it without importing each other. Everything here is node:crypto — no
 * native modules to build, and nothing to install.
 *
 *   passwords — scrypt with a per-user salt, compared in constant time
 *   sessions  — a stateless HMAC-signed token, so a serverless instance can
 *               verify a caller without a round-trip to the store
 */
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

export const MAX_AGE = 60 * 60 * 24 * 7 // one week

const SECRET =
  process.env.SESSION_SECRET ||
  (process.env.NODE_ENV === 'production' ? null : 'dev-only-insecure-secret-do-not-use-in-production')

if (!SECRET) console.error('[api] SESSION_SECRET is not set — logins will be rejected.')

/* ── passwords ───────────────────────────────────────────────────── */

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const key = scryptSync(password, salt, 64).toString('hex')
  return `scrypt:${salt}:${key}`
}

export function verifyPassword(password, stored) {
  const [scheme, salt, key] = String(stored || '').split(':')
  if (scheme !== 'scrypt' || !salt || !key) return false
  const expected = Buffer.from(key, 'hex')
  const actual = scryptSync(password, salt, expected.length)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

/* ── session tokens ──────────────────────────────────────────────── */

const b64 = (buf) => Buffer.from(buf).toString('base64url')
const sign = (payload) => createHmac('sha256', SECRET).update(payload).digest('base64url')

/**
 * @param audience 'web' for the dashboard cookie, 'app' for the driver app.
 * Recorded in the token so one cannot be replayed as the other.
 */
export function issueToken(user, audience = 'web') {
  const body = b64(
    JSON.stringify({ i: user.id, u: user.username, r: user.role, a: audience, e: Date.now() + MAX_AGE * 1000 }),
  )
  return `${body}.${sign(body)}`
}

export function readToken(token) {
  if (!SECRET || typeof token !== 'string') return null
  const [body, mac] = token.split('.')
  if (!body || !mac) return null

  const expected = Buffer.from(sign(body))
  const actual = Buffer.from(mac)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null

  try {
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    if (!claims.e || claims.e < Date.now()) return null
    return claims
  } catch {
    return null
  }
}
