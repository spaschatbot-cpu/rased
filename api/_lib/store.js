/**
 * Key/value storage for the site backend.
 *
 * Three drivers, picked at runtime so the same handlers run everywhere:
 *   • supabase — one `kv` table over PostgREST. Preferred in production: its
 *     free tier is bounded by megabytes rather than by request count, and this
 *     backend's cost is request-shaped — a dashboard polls for as long as it is
 *     open, which is a lot of very small reads.
 *   • upstash  — Redis over REST. Faster per call, kept because a deployment
 *     already pointed at it should not need a migration to keep working.
 *   • file     — a JSON file under .data/. Used for local development, so
 *     `npm run dev` works with no account, no service and no network.
 *
 * Values are JSON. Keys are flat strings; there are only a handful of them.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const REST_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
const REST_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '')
/* the service-role key, never the anon one: this table is deliberately closed
   to every browser-reachable role, and the server is the only thing that opens
   it. It must never be exposed to the bundle — nothing here is imported by src/ */
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export const driver =
  SUPABASE_URL && SUPABASE_KEY ? 'supabase' : REST_URL && REST_TOKEN ? 'upstash' : 'file'

/* ── supabase driver ─────────────────────────────────────────────── */

const TABLE = 'kv'

/**
 * Quoting for `in.(…)`, where the values sit in a comma-separated list and a
 * key containing a comma or a parenthesis would otherwise be read as list
 * syntax. The inner quote has to be escaped rather than dropped.
 *
 * `eq.` is the opposite case and must NOT be quoted: it takes the rest of the
 * value literally, so the quotes become part of the key being matched and the
 * row is silently not found — a lookup that returns "no such key" rather than
 * an error, which is the failure mode that hides longest.
 */
const quoted = (key) => `"${String(key).replace(/"/g, '\\"')}"`

async function postgrest(pathAndQuery, { method = 'GET', body, prefer } = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    method,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  const text = await res.text()

  if (!res.ok) {
    throw new Error(`storage: supabase returned ${res.status}${text ? ` — ${text.slice(0, 200)}` : ''}`)
  }
  /* Writes ask for `return=minimal` and come back with an empty body — as a
     204 on delete, but as a *201* on insert. Keying off the status code missed
     that second case and tried to parse nothing as JSON, so go by whether a
     body actually arrived. */
  return text ? JSON.parse(text) : null
}

const sbGet = async (key) => {
  const rows = await postgrest(`${TABLE}?key=eq.${encodeURIComponent(key)}&select=value`)
  return rows?.length ? rows[0].value : null
}

const sbSet = (key, value) =>
  postgrest(`${TABLE}?on_conflict=key`, {
    method: 'POST',
    body: { key: String(key), value },
    /* upsert: the same key is written on every fix for a vehicle */
    prefer: 'resolution=merge-duplicates,return=minimal',
  })

const sbDel = (key) =>
  postgrest(`${TABLE}?key=eq.${encodeURIComponent(key)}`, {
    method: 'DELETE',
    prefer: 'return=minimal',
  })

/** One round-trip for many keys — the position poll is built on this. */
async function sbMget(keys) {
  const filter = keys.map(quoted).join(',')
  const rows = await postgrest(`${TABLE}?key=in.(${encodeURIComponent(filter)})&select=key,value`)
  /* rows come back in whatever order the planner chose; the caller is promised
     an array lined up with the keys it asked for */
  const found = new Map((rows || []).map((r) => [r.key, r.value]))
  return keys.map((k) => (found.has(k) ? found.get(k) : null))
}

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
  if (driver === 'supabase') return sbMget(keys)
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
 * concurrent callers cannot clobber each other. On Redis and on Postgres this
 * is still a plain read-modify-write — safe for keys only one request touches
 * at a time, which is why live positions are keyed per vehicle rather than in
 * one document.
 */
export async function mutate(key, mutator) {
  if (driver === 'supabase' || driver === 'upstash') {
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
  if (driver === 'supabase') return void (await sbDel(key))
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
  if (driver === 'supabase') return sbGet(key)
  if (driver === 'upstash') {
    const raw = await redis(['GET', key])
    return raw ? JSON.parse(raw) : null
  }
  const data = await readFileStore()
  return key in data ? data[key] : null
}

/** Write one JSON value, replacing whatever was there. */
export async function set(key, value) {
  if (driver === 'supabase') {
    await sbSet(key, value)
    return value
  }
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
  if (driver === 'supabase') {
    /* the list lives as a JSON array in one row, the way the file driver holds
       it — Postgres could model it as rows instead, but every reader here wants
       the whole capped list at once, so a second table would buy nothing */
    const items = await list(key)
    items.unshift(value)
    await sbSet(key, items.slice(0, limit))
    return value
  }
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
  if (driver === 'supabase') {
    const value = await sbGet(key)
    return Array.isArray(value) ? value : []
  }
  if (driver === 'upstash') {
    const raw = await redis(['LRANGE', key, '0', '-1'])
    return (raw || []).map((v) => JSON.parse(v))
  }
  const data = await readFileStore()
  return Array.isArray(data[key]) ? data[key] : []
}

/** Remove one item from a list by its `id`. Returns true when something went. */
export async function removeFromList(key, id) {
  if (driver === 'supabase') {
    const items = await list(key)
    const kept = items.filter((it) => it.id !== id)
    if (kept.length === items.length) return false
    await sbSet(key, kept)
    return true
  }
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
