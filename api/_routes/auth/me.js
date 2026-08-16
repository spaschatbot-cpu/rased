import { handler, readJson, ok, fail } from '../../_lib/http.js'
import { currentUser, requireUser } from '../../_lib/auth.js'
import { hashPassword, verifyPassword } from '../../_lib/crypto.js'
import { allUsers, findById, publicUser, saveUsers, userWithVehicle } from '../../_lib/users.js'

const MIN_PASSWORD = 6
const clean = (v, max) => String(v ?? '').trim().slice(0, max)

/**
 * Who am I, and what may I change about myself?
 *
 *   GET — called on boot to restore a session from its cookie or token
 *   PUT — the account's own name, email, phone and password
 *
 * Editing yourself lives here rather than on `/users` because `/users` is the
 * *management* table: it is gated to admins and up, and it can change a role,
 * a branch and a vehicle. A viewer fixing a typo in their own email should not
 * have to pass through a door that wide — and the fields this endpoint refuses
 * to read are exactly the ones nobody should be able to grant themselves.
 */
export default handler({
  async GET(req, res) {
    const claims = currentUser(req)
    if (!claims) return ok(res, { ok: true, user: null })

    /* Re-read the account rather than trusting the token body, so a disabled
       or deleted user cannot keep walking around on an old session. */
    const account = await findById(claims.i)
    if (!account || !account.active) return ok(res, { ok: true, user: null })

    /* this is the call the driver app makes on every launch, and the one that
       picks up a vehicle the office reassigned while the app was closed */
    return ok(res, { ok: true, user: await userWithVehicle(account) })
  },

  async PUT(req, res) {
    const caller = requireUser(req)
    const body = await readJson(req)

    const list = await allUsers()
    const i = list.findIndex((u) => u.id === caller.i)
    if (i < 0) return fail(res, 404, 'user not found')
    const account = list[i]

    const nameAr = clean(body.nameAr, 120)
    const nameEn = clean(body.nameEn, 120)
    if (!nameAr && !nameEn) return fail(res, 400, 'a name is required')

    const email = clean(body.email, 160)
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(res, 400, 'invalid email')

    /* a password change proves the current one first: a session left open on an
       unlocked screen must not be enough to lock its owner out of their own
       account */
    const next = String(body.newPassword ?? '')
    let pass = null
    if (next) {
      if (next.length < MIN_PASSWORD) {
        return fail(res, 400, `password must be at least ${MIN_PASSWORD} characters`)
      }
      if (!verifyPassword(String(body.currentPassword ?? ''), account.pass)) {
        return fail(res, 403, 'current password is wrong')
      }
      pass = hashPassword(next)
    }

    /* role, branch, vehicle, active and pages are deliberately not read here */
    const updated = {
      ...account,
      nameAr: nameAr || nameEn,
      nameEn: nameEn || nameAr,
      email,
      phone: clean(body.phone, 40),
      ...(pass ? { pass } : null),
      updatedAt: new Date().toISOString(),
    }

    list[i] = updated
    await saveUsers(list)
    return ok(res, { ok: true, user: publicUser(updated) })
  },
})
