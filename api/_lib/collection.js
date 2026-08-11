/**
 * One shape for every list the dashboard edits.
 *
 * Vehicles, branches, geofences, alert rules and service records are all the
 * same problem: a seeded array in the store, numeric ids, create/update/delete
 * guarded by role. Writing that five times invites five slightly different
 * answers to the same question, so it lives here once.
 *
 * Each collection supplies only what actually differs — its key, its seed, how
 * to validate a body and how to build a record from one.
 */
import { mutate, get, set } from './store.js'

/**
 * @param key      store key holding the array
 * @param seed     () => array, written the first time the key is read
 * @param validate (body, list, existing) => string | null — a message rejects
 * @param shape    (body, existing) => record, without `id`
 */
export function collection({ key, seed, validate, shape }) {
  /** Read the list, seeding on first use. Always an array. */
  async function all() {
    const stored = await get(key)
    if (Array.isArray(stored)) return stored
    const fresh = seed ? seed() : []
    await set(key, fresh)
    return fresh
  }

  const find = async (id) => (await all()).find((r) => r.id === Number(id)) ?? null

  /**
   * Ids come from the stored list under the same lock as the write, so two
   * creates landing together cannot both claim the same number.
   */
  async function create(body) {
    await all() // make sure the seed is on disk before we mutate it
    let problem = null
    const record = await mutate(key, (current) => {
      const list = Array.isArray(current) ? current : []
      problem = validate ? validate(body, list, null) : null
      if (problem) return undefined
      const row = {
        ...shape(body, {}),
        id: Math.max(0, ...list.map((r) => r.id)) + 1,
        createdAt: new Date().toISOString(),
      }
      list.push(row)
      return list
    })
    if (problem) throw badRequest(problem)
    return record[record.length - 1]
  }

  async function update(id, body) {
    await all()
    let problem = null
    let updated = null
    await mutate(key, (current) => {
      const list = Array.isArray(current) ? current : []
      const i = list.findIndex((r) => r.id === Number(id))
      if (i < 0) {
        problem = 'not found'
        return undefined
      }
      problem = validate ? validate(body, list, list[i]) : null
      if (problem) return undefined
      updated = { ...shape(body, list[i]), id: list[i].id, updatedAt: new Date().toISOString() }
      list[i] = updated
      return list
    })
    if (problem) throw problem === 'not found' ? notFound() : badRequest(problem)
    return updated
  }

  async function remove(id) {
    await all()
    let removed = false
    await mutate(key, (current) => {
      const list = Array.isArray(current) ? current : []
      const kept = list.filter((r) => r.id !== Number(id))
      removed = kept.length !== list.length
      return removed ? kept : undefined
    })
    if (!removed) throw notFound()
  }

  /** Change a few fields without running the create/update validators. */
  async function patch(id, fields) {
    await all()
    let updated = null
    await mutate(key, (current) => {
      const list = Array.isArray(current) ? current : []
      const i = list.findIndex((r) => r.id === Number(id))
      if (i < 0) return undefined
      updated = { ...list[i], ...fields, updatedAt: new Date().toISOString() }
      list[i] = updated
      return list
    })
    if (!updated) throw notFound()
    return updated
  }

  return { key, all, find, create, update, remove, patch }
}

/* ── shared errors and input scrubbing ───────────────────────────── */

export function badRequest(message) {
  const err = new Error(message)
  err.statusCode = 400
  return err
}

export function notFound(message = 'not found') {
  const err = new Error(message)
  err.statusCode = 404
  return err
}

export function forbidden(message = 'not allowed for this role') {
  const err = new Error(message)
  err.statusCode = 403
  return err
}

/** Trim a value to a plain bounded string — the only text we ever store. */
export const text = (v, max = 120) => String(v ?? '').trim().slice(0, max)

/** A finite number inside `[min, max]`, or `fallback` when it is not one. */
export function num(v, min, max, fallback = null) {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

/** `?id=` from a request URL, as a number. `0` when absent. */
export const idParam = (req) => Number(new URL(req.url, 'http://localhost').searchParams.get('id')) || 0

/** All query parameters of a request. */
export const query = (req) => new URL(req.url, 'http://localhost').searchParams
