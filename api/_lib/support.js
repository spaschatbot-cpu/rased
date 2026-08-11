/**
 * Support threads — one conversation per driver.
 *
 * A driver has exactly one thread and never picks a recipient: whoever is on
 * the management side answers it. That is why the thread is keyed by driver id
 * rather than by a generated ticket number — the driver's question is "did the
 * office read what I wrote", and a list of tickets answers a different one.
 *
 * Each thread lives under its own key so two drivers writing at the same moment
 * cannot clobber each other on the Redis driver, where a read-modify-write is
 * not atomic. The index of who has a thread is a separate, rarely-written key.
 */
import { randomUUID } from 'node:crypto'
import { get, mget, mutate, set } from './store.js'

const key = (driverId) => `support:${Number(driverId)}`
const INDEX = 'support:drivers'

/** How many messages one thread keeps. Older ones fall off the top. */
const LIMIT = 200

const empty = (driverId) => ({
  driverId: Number(driverId),
  messages: [],
  driverUnread: 0,
  staffUnread: 0,
  createdAt: null,
  updatedAt: null,
})

/** One driver's thread. Always a thread — a driver who never wrote has none. */
export async function thread(driverId) {
  return (await get(key(driverId))) ?? empty(driverId)
}

/** Driver ids that have ever opened a thread. */
export const threadIds = async () => (await get(INDEX)) ?? []

/** Every thread, newest activity first. */
export async function allThreads() {
  const ids = await threadIds()
  if (!ids.length) return []
  const rows = await mget(ids.map(key))
  return rows
    .filter(Boolean)
    .sort((a, b) => Date.parse(b.updatedAt ?? 0) - Date.parse(a.updatedAt ?? 0))
}

/**
 * Add one message and bump the unread counter of the *other* side.
 *
 * @param driverId whose thread this is
 * @param from     'driver' | 'staff'
 * @param author   `{ id, nameAr, nameEn }` of whoever typed it
 * @param text     already trimmed and bounded by the caller
 */
export async function append(driverId, { from, author, text }) {
  const id = Number(driverId)
  const now = new Date().toISOString()
  const message = {
    id: randomUUID(),
    from,
    authorId: author?.id ?? null,
    authorAr: author?.nameAr ?? '',
    authorEn: author?.nameEn ?? '',
    text,
    at: now,
  }

  const saved = await mutate(key(id), (current) => {
    const row = current ?? empty(id)
    const messages = [...row.messages, message].slice(-LIMIT)
    return {
      ...row,
      driverId: id,
      messages,
      /* the sender's own side is read by definition — they just looked at it */
      driverUnread: from === 'staff' ? row.driverUnread + 1 : 0,
      staffUnread: from === 'driver' ? row.staffUnread + 1 : 0,
      createdAt: row.createdAt ?? now,
      updatedAt: now,
    }
  })

  /* index membership only changes on a driver's very first message */
  await mutate(INDEX, (current) => {
    const ids = Array.isArray(current) ? current : []
    return ids.includes(id) ? undefined : [...ids, id]
  })

  return { thread: saved, message }
}

/** Clear one side's unread counter. `side` is 'driver' or 'staff'. */
export async function markRead(driverId, side) {
  const id = Number(driverId)
  const current = await get(key(id))
  if (!current) return empty(id)

  const field = side === 'driver' ? 'driverUnread' : 'staffUnread'
  if (!current[field]) return current
  return set(key(id), { ...current, [field]: 0 })
}
