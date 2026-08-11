import { handler, readJson, ok, fail } from '../_lib/http.js'
import { sessionCookie } from '../_lib/auth.js'
import { issueToken, verifyPassword } from '../_lib/crypto.js'
import { findByUsername, publicUser, touchLogin } from '../_lib/users.js'

/**
 * Sign in.
 *
 * `client: 'app'` marks a driver-app login: it returns the token in the body
 * for the app to store, and refuses roles that have no business in it. The
 * dashboard gets the same session as a cookie instead.
 */
export default handler({
  async POST(req, res) {
    const { username, password, client } = await readJson(req)
    const u = String(username || '').trim()
    const p = String(password || '')

    if (!u || !p) return fail(res, 400, 'username and password are required')

    const account = await findByUsername(u)

    /* One reply for "no such user" and "wrong password" alike — a different
       message for each would let anyone enumerate valid usernames. */
    if (!account || !verifyPassword(p, account.pass)) {
      return fail(res, 401, 'invalid credentials')
    }
    if (!account.active) return fail(res, 403, 'account is disabled')

    const forApp = client === 'app'
    if (forApp && account.role !== 'driver') {
      return fail(res, 403, 'this app is for drivers only')
    }

    await touchLogin(account.id)
    const profile = publicUser(account)
    const token = issueToken(profile, forApp ? 'app' : 'web')

    return forApp
      ? ok(res, { ok: true, user: profile, token })
      : ok(res, { ok: true, user: profile }, { 'Set-Cookie': sessionCookie(token) })
  },
})
