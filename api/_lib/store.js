/**
 * Key/value storage for the site backend.
 *
 * Two drivers, picked at runtime so the same handlers run everywhere:
 *   • upstash — Redis over REST. Used on Vercel, where the filesystem is
 *     read-only and each request may hit a different instance.
 *   • file    — a JSON file under .data/. Used for local development, so
 *     `npm run dev` works with no account, no service and no network.
 *
 * Values are JSON. Keys are flat strings; there are only a handful of them.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const REST_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
const REST_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN

export const driver = REST_URL && REST_TOKEN ? 'upstash' : 'file'

/* ── upstash driver ──────────────────────────────────────────────── */

async function redis(command) {
  const res = await fetch(REST_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REST_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  })
  if (!res.ok) throw new Error(`storage: upstash returned ${res.status}`)
  const { result } = await res.json()
  return result
}

/* ── file driver ─────────────────────────────────────────────────── */

const FILE = path.join(process.cwd(), '.data', 'store.json')

/* Serialise writes: two overlapping saves must not clobber each other. */
let queue = Promise.resolve()

async function readFileStore() {
  try {
    return JSON.parse(await readFile(FILE, 'utf8'))
  } catch {
    return {}
  }
}

async function writeFileStore(mutate) {
  queue = queue.then(async () => {
    const data = await readFileStore()
    const result = mutate(data)
    await mkdir(path.dirname(FILE), { recursive: true })
    await writeFile(FILE, JSON.stringify(data, null, 2))
    return result
  })
  return queue
}

/* ── public API ──────────────────────────────────────────────────── */

/**
 * Read many keys at once. Returns an array the same length as `keys`, with
 * `null` where nothing was stored. One round-trip on Redis, which is what makes
 * a per-vehicle position key affordable to poll.
 */
export async function mget(keys) {
  if (!keys.length) return []
  if (driver === 'upstash') {
    const raw = await redis(['MGET', ...keys])
    return (raw || []).map((v) => (v ? JSON.parse(v) : null))
  }
  const data = await readFileStore()
  return keys.map((k) => (k in data ? data[k] : null))
}

/**
 * Read-modify-write one key under a lock.
 *
 * `mutate(value)` receives the current value (or `null`) and returns the value
 * to store; returning `undefined` leaves the key untouched. Resolves to what
 * the mutator returned.
 *
 * The file driver serialises through the same write queue as `set`, so
 * concurrent callers cannot clobber each other. On Redis this is still a plain
 * read-modify-write — safe for keys only one request touches at a time, which
 * is why live positions are keyed per vehicle rather than in one document.
 */
export async function mutate(key, mutator) {
  if (driver === 'upstash') {
    const current = await get(key)
    const next = mutator(current)
    if (next !== undefined) await set(key, next)
    return next
  }
  let outcome
  await writeFileStore((data) => {
    const next = mutator(key in data ? data[key] : null)
    if (next !== undefined) data[key] = next
    outcome = next
  })
  return outcome
}

/** Delete one key. */
export async function del(key) {
  if (driver === 'upstash') {
    await redis(['DEL', key])
    return
  }
  await writeFileStore((data) => {
    delete data[key]
  })
}

/** Read one JSON value, or `null` when the key was never written. */
export async function get(key) {
  if (driver === 'upstash') {
    const raw = await redis(['GET', key])
    return raw ? JSON.parse(raw) : null
  }
  const data = await readFileStore()
  return key in data ? data[key] : null
}

/** Write one JSON value, replacing whatever was there. */
export async function set(key, value) {
  if (driver === 'upstash') {
    await redis(['SET', key, JSON.stringify(value)])
    return value
  }
  await writeFileStore((data) => {
    data[key] = value
  })
  return value
}

/** Prepend to a capped list — newest first, oldest dropped past `limit`. */
export async function unshift(key, value, limit = 500) {
  if (driver === 'upstash') {
    await redis(['LPUSH', key, JSON.stringify(value)])
    await redis(['LTRIM', key, '0', String(limit - 1)])
    return value
  }
  await writeFileStore((data) => {
    const list = Array.isArray(data[key]) ? data[key] : []
    list.unshift(value)
    data[key] = list.slice(0, limit)
  })
  return value
}

/** Read a whole list, newest first. Always an array. */
export async function list(key) {
  if (driver === 'upstash') {
    const raw = await redis(['LRANGE', key, '0', '-1'])
    return (raw || []).map((v) => JSON.parse(v))
  }
  const data = await readFileStore()
  return Array.isArray(data[key]) ? data[key] : []
}

/** Remove one item from a list by its `id`. Returns true when something went. */
export async function removeFromList(key, id) {
  if (driver === 'upstash') {
    const items = await list(key)
    const kept = items.filter((it) => it.id !== id)
    if (kept.length === items.length) return false
    await redis(['DEL', key])
    /* LPUSH reverses, so push oldest first to preserve newest-first order */
    for (const it of [...kept].reverse()) await redis(['LPUSH', key, JSON.stringify(it)])
    return true
  }
  let removed = false
  await writeFileStore((data) => {
    const items = Array.isArray(data[key]) ? data[key] : []
    const kept = items.filter((it) => it.id !== id)
    removed = kept.length !== items.length
    data[key] = kept
  })
  return removed
}
