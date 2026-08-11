/**
 * The account table — the single source of truth for who can sign in.
 *
 * Both the web dashboard and the driver app authenticate against this list, so
 * a driver created in the Management screen can immediately sign into the
 * mobile app. Passwords are stored as scrypt hashes and never leave the server.
 */
import { get, set } from './store.js'
import { hashPassword } from './crypto.js'

const KEY = 'users'

export const ROLES = ['superadmin', 'admin', 'viewer', 'driver']

/** Roles allowed to open the Management screen and edit accounts. */
export const canManageUsers = (role) => ['superadmin', 'admin'].includes(role)

/**
 * Roles that were dropped, and what they became.
 *
 * `manager` carried exactly the grants `admin` did — same pages, same write
 * gate, same account access — so the two were one role wearing two labels.
 * Keeping the map means a store written before the merge still signs in:
 * an unknown role resolves to no pages at all, which would lock out every
 * account that held it.
 */
const RETIRED_ROLES = { manager: 'admin' }

export const liveRole = (role) => RETIRED_ROLES[role] ?? role

/**
 * Seeded on first run so the platform is usable out of the box. Mirrors the
 * accounts the README documents; every password can be changed from the UI.
 */
const SEED = [
  { nameAr: 'مدير النظام', nameEn: 'Super admin', username: 'superadmin', email: 'admin@mirsad.sa', role: 'superadmin', groupId: 1, pass: 'Mirsad@2026' },
  { nameAr: 'شركة لامار', nameEn: 'Lamar Company', username: '7034710512', email: 'ops@lamar.sa', role: 'admin', groupId: 1, pass: '7034710512' },
  { nameAr: 'خالد العتيبي', nameEn: 'Khalid Al-Otaibi', username: 'k.otaibi', email: 'k.otaibi@lamar.sa', role: 'admin', groupId: 1, pass: 'Mirsad@123' },
  { nameAr: 'سعود الدوسري', nameEn: 'Saud Al-Dosari', username: 's.dosari', email: 's.dosari@lamar.sa', role: 'admin', groupId: 2, pass: 'Mirsad@123' },
  { nameAr: 'ماجد الحربي', nameEn: 'Majed Al-Harbi', username: 'm.harbi', email: 'm.harbi@lamar.sa', role: 'admin', groupId: 3, pass: 'Mirsad@123' },
  { nameAr: 'نورة السالم', nameEn: 'Noura Al-Salem', username: 'n.salem', email: 'n.salem@lamar.sa', role: 'viewer', groupId: 1, pass: 'Mirsad@123' },
  { nameAr: 'أحمد المطيري', nameEn: 'Ahmed Al-Mutairi', username: 'a.mutairi', email: 'a.mutairi@lamar.sa', role: 'driver', groupId: 1, vehicleId: 1, pass: 'Driver@123' },
  { nameAr: 'فهد القحطاني', nameEn: 'Fahad Al-Qahtani', username: 'f.qahtani', email: 'f.qahtani@lamar.sa', role: 'driver', groupId: 1, vehicleId: 2, pass: 'Driver@123' },
]

function seed() {
  const now = new Date().toISOString()
  return SEED.map((u, i) => ({
    id: i + 1,
    nameAr: u.nameAr,
    nameEn: u.nameEn,
    username: u.username,
    email: u.email,
    phone: '',
    role: u.role,
    groupId: u.groupId,
    vehicleId: u.vehicleId ?? null,
    /* null = follow the role. Nothing is granted by hand until someone does. */
    pages: null,
    active: true,
    pass: hashPassword(
      /* let the environment override the two documented accounts */
      u.username === 'superadmin' ? process.env.ADMIN_PASSWORD || u.pass : u.pass,
    ),
    createdAt: now,
    lastLoginAt: null,
  }))
}

/**
 * Read the table, seeding or migrating as needed.
 * An earlier build stored a `{ username: account }` map; convert it rather
 * than dropping accounts that already exist in a deployed store.
 */
export async function allUsers() {
  const stored = await get(KEY)

  if (Array.isArray(stored)) {
    /* rewrite retired roles once, so the store stops carrying them and every
       later read is a plain pass-through again */
    if (!stored.some((u) => RETIRED_ROLES[u.role])) return stored
    const moved = stored.map((u) => ({ ...u, role: liveRole(u.role) }))
    await set(KEY, moved)
    return moved
  }

  if (stored && typeof stored === 'object') {
    const migrated = Object.values(stored).map((u, i) => ({
      id: u.id ?? i + 1,
      nameAr: u.nameAr ?? u.username,
      nameEn: u.nameEn ?? u.username,
      username: u.username,
      email: u.email ?? '',
      role: liveRole(u.role ?? 'viewer'),
      groupId: u.groupId ?? 1,
      vehicleId: u.vehicleId ?? null,
      active: u.active ?? true,
      pass: u.pass,
      createdAt: u.createdAt ?? new Date().toISOString(),
      lastLoginAt: u.lastLoginAt ?? null,
    }))
    await set(KEY, migrated)
    return migrated
  }

  const fresh = seed()
  await set(KEY, fresh)
  return fresh
}

export const saveUsers = (list) => set(KEY, list)

/**
 * Look up by username or email — the sign-in field offers both, so accepting
 * only one of them would make the form lie about what it takes.
 */
export const findByUsername = async (identifier) => {
  const key = String(identifier).trim().toLowerCase()
  if (!key) return null
  const list = await allUsers()
  return (
    list.find((u) => u.username.toLowerCase() === key) ??
    list.find((u) => (u.email || '').toLowerCase() === key) ??
    null
  )
}

export const findById = async (id) => (await allUsers()).find((u) => u.id === Number(id)) ?? null

/** Strip the hash before anything is sent to a browser or the app. */
export const publicUser = ({ pass, ...rest }) => rest

/** Note a successful sign-in. Best-effort: never block the login on it. */
export async function touchLogin(id) {
  try {
    const list = await allUsers()
    const i = list.findIndex((u) => u.id === id)
    if (i < 0) return
    list[i] = { ...list[i], lastLoginAt: new Date().toISOString() }
    await saveUsers(list)
  } catch (err) {
    console.warn('[users] could not record login time:', err.message)
  }
}
