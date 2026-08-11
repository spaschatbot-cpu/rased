/**
 * Request guards.
 *
 * A caller proves who they are one of two ways, so the same endpoints serve
 * both clients:
 *   • the dashboard sends an HttpOnly cookie the browser manages for it
 *   • the driver app sends `Authorization: Bearer <token>`, since a mobile
 *     app has no cookie jar worth relying on
 */
import { readCookie, serializeCookie } from './http.js'
import { MAX_AGE, readToken } from './crypto.js'

export const COOKIE = 'mirsad_session'

export const sessionCookie = (token) => serializeCookie(COOKIE, token, { maxAge: MAX_AGE })
export const clearedCookie = () => serializeCookie(COOKIE, '', { maxAge: 0 })

/** The signed-in caller for this request, or null. */
export function currentUser(req) {
  const header = req.headers?.authorization || req.headers?.Authorization
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    const claims = readToken(header.slice(7).trim())
    if (claims) return claims
  }
  return readToken(readCookie(req, COOKIE))
}

const deny = (status, message) => {
  const err = new Error(message)
  err.statusCode = status
  throw err
}

/** Any signed-in caller. */
export function requireUser(req) {
  return currentUser(req) || deny(401, 'sign in required')
}

/** Callers holding one of `roles`. */
export function requireRole(req, roles) {
  const user = requireUser(req)
  if (!roles.includes(user.r)) deny(403, 'not allowed for this role')
  return user
}

/** The site control room — super-admin only. */
export function requireAdmin(req) {
  const user = requireUser(req)
  if (user.r !== 'superadmin') deny(403, 'super-admin only')
  return user
}
