import { handler, readJson, ok, fail, send } from '../../_lib/http.js'
import { sessionCookie } from '../../_lib/auth.js'
import { issueToken, verifyPassword } from '../../_lib/crypto.js'
import { findByUsername, publicUser, touchLogin, userWithVehicle } from '../../_lib/users.js'

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

    /* The mirror of the rule above. This one carries a `code` because the
       dashboard has to tell it apart from a wrong password to point the
       driver at the right app — the other refusals only need to be read. */
    if (!forApp && account.role === 'driver') {
      return send(res, 403, {
        ok: false,
        code: 'driver_app_only',
        error: 'driver accounts sign in from the driver app',
      })
    }

    await touchLogin(account.id)
    /* the token is signed over the bare account — the vehicle rides in the
       response body only, so reassigning one never invalidates a session */
    const token = issueToken(publicUser(account), forApp ? 'app' : 'web')
    const profile = await userWithVehicle(account)

    return forApp
      ? ok(res, { ok: true, user: profile, token })
      : ok(res, { ok: true, user: profile }, { 'Set-Cookie': sessionCookie(token) })
  },
})
