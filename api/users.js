/**
 * Accounts, as managed from the dashboard's Management screen.
 *
 *   GET    — list (admins and up)
 *   POST   — create
 *   PUT    ?id= — update; `password` is optional and only set when present
 *   DELETE ?id= — remove
 *
 * A driver created here can sign into the mobile app straight away.
 */
import { handler, readJson, ok, fail } from './_lib/http.js'
import { requireUser } from './_lib/auth.js'
import { hashPassword } from './_lib/crypto.js'
import { ROLES, allUsers, canManageUsers, publicUser, saveUsers } from './_lib/users.js'
import { cleanPages } from '../shared/app-pages.js'

const MIN_PASSWORD = 6

const clean = (v, max) => String(v ?? '').trim().slice(0, max)
const idFrom = (req) => Number(new URL(req.url, 'http://localhost').searchParams.get('id'))

/** Admins and up may edit accounts; nobody may mint a super-admin but one. */
function gate(req) {
  const caller = requireUser(req)
  if (!canManageUsers(caller.r)) {
    const err = new Error('not allowed for this role')
    err.statusCode = 403
    throw err
  }
  return caller
}

/** Shared shape checks for create and update. `existing` is null on create. */
function validate(body, list, existing) {
  const username = clean(body.username, 60).toLowerCase()
  const role = clean(body.role, 20)

  if (!username) return 'username is required'
  if (!/^[a-z0-9._@-]+$/.test(username)) return 'username may use letters, digits, . _ - @ only'
  if (!ROLES.includes(role)) return `role must be one of ${ROLES.join(', ')}`
  if (!clean(body.nameAr, 120) && !clean(body.nameEn, 120)) return 'a name is required'

  const taken = list.some((u) => u.username.toLowerCase() === username && u.id !== existing?.id)
  if (taken) return 'username is already taken'

  const email = clean(body.email, 160)
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return 'invalid email'

  /* a brand-new account has nothing to sign in with otherwise */
  const password = String(body.password ?? '')
  if (!existing && password.length < MIN_PASSWORD) return `password must be at least ${MIN_PASSWORD} characters`
  if (password && password.length < MIN_PASSWORD) return `password must be at least ${MIN_PASSWORD} characters`

  return null
}

/** Build the stored record from a request body, keeping unknown fields out. */
function shape(body, existing) {
  const role = clean(body.role, 20)
  const password = String(body.password ?? '')

  return {
    ...existing,
    nameAr: clean(body.nameAr, 120) || clean(body.nameEn, 120),
    nameEn: clean(body.nameEn, 120) || clean(body.nameAr, 120),
    username: clean(body.username, 60).toLowerCase(),
    email: clean(body.email, 160),
    /* forms that carry no phone field must not wipe the number a form that
       does carry one already saved */
    phone: clean(body.phone ?? existing.phone, 40),
    role,
    groupId: Number(body.groupId) || 1,
    /* only a driver is tied to a vehicle */
    vehicleId: role === 'driver' && body.vehicleId ? Number(body.vehicleId) : null,
    /* `null` follows the role; an array is a hand-written grant. A super-admin
       is never limited, so an explicit list is not kept for one */
    pages:
      role === 'superadmin'
        ? null
        : body.pages !== undefined
          ? cleanPages(body.pages)
          : (existing.pages ?? null),
    active: body.active !== false,
    ...(password ? { pass: hashPassword(password) } : null),
  }
}

export default handler({
  async GET(req, res) {
    gate(req)
    const list = await allUsers()
    return ok(res, { ok: true, users: list.map(publicUser) })
  },

  async POST(req, res) {
    const caller = gate(req)
    const body = await readJson(req)
    const list = await allUsers()

    const problem = validate(body, list, null)
    if (problem) return fail(res, 400, problem)
    if (body.role === 'superadmin' && caller.r !== 'superadmin') {
      return fail(res, 403, 'only a super-admin can create a super-admin')
    }

    const user = {
      id: Math.max(0, ...list.map((u) => u.id)) + 1,
      ...shape(body, {}),
      createdAt: new Date().toISOString(),
      lastLoginAt: null,
    }
    await saveUsers([...list, user])
    return ok(res, { ok: true, user: publicUser(user) })
  },

  async PUT(req, res) {
    const caller = gate(req)
    const id = idFrom(req)
    const body = await readJson(req)
    const list = await allUsers()

    const i = list.findIndex((u) => u.id === id)
    if (i < 0) return fail(res, 404, 'user not found')

    const problem = validate(body, list, list[i])
    if (problem) return fail(res, 400, problem)

    /* nobody may promote themselves, or touch a super-admin, from below */
    if (caller.r !== 'superadmin' && (list[i].role === 'superadmin' || body.role === 'superadmin')) {
      return fail(res, 403, 'only a super-admin can manage a super-admin')
    }

    const updated = { ...shape(body, list[i]), id: list[i].id, updatedAt: new Date().toISOString() }
    list[i] = updated
    await saveUsers(list)
    return ok(res, { ok: true, user: publicUser(updated) })
  },

  async DELETE(req, res) {
    const caller = gate(req)
    const id = idFrom(req)
    if (!id) return fail(res, 400, 'id is required')
    if (id === caller.i) return fail(res, 400, 'you cannot delete your own account')

    const list = await allUsers()
    const target = list.find((u) => u.id === id)
    if (!target) return fail(res, 404, 'user not found')
    if (target.role === 'superadmin' && caller.r !== 'superadmin') {
      return fail(res, 403, 'only a super-admin can delete a super-admin')
    }

    await saveUsers(list.filter((u) => u.id !== id))
    return ok(res, { ok: true })
  },
})
