/**
 * Contact-form submissions.
 *
 *   POST   — public. The landing page's form posts here.
 *   GET    — super-admin only. The inbox in the control room.
 *   DELETE — super-admin only. Removes one message by id.
 */
import { randomUUID } from 'node:crypto'
import { handler, readJson, ok, fail } from './_lib/http.js'
import { requireAdmin } from './_lib/auth.js'
import { list, removeFromList, unshift } from './_lib/store.js'

const KEY = 'messages'
const FIELDS = { name: 120, company: 120, phone: 40, email: 160, fleet: 20, message: 4000 }

const clean = (value, max) => String(value ?? '').trim().slice(0, max)

export default handler({
  async POST(req, res) {
    const body = await readJson(req)
    const entry = {}
    for (const [field, max] of Object.entries(FIELDS)) entry[field] = clean(body[field], max)

    if (!entry.name || !entry.phone) return fail(res, 400, 'name and phone are required')
    if (entry.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(entry.email)) {
      return fail(res, 400, 'invalid email')
    }

    const saved = { id: randomUUID(), ...entry, read: false, at: new Date().toISOString() }
    await unshift(KEY, saved)

    /* the browser gets an acknowledgement, not the stored record */
    return ok(res, { ok: true })
  },

  async GET(req, res) {
    requireAdmin(req)
    return ok(res, { ok: true, messages: await list(KEY) })
  },

  async DELETE(req, res) {
    requireAdmin(req)
    const url = new URL(req.url, 'http://localhost')
    const id = url.searchParams.get('id')
    if (!id) return fail(res, 400, 'id is required')

    const removed = await removeFromList(KEY, id)
    if (!removed) return fail(res, 404, 'message not found')
    return ok(res, { ok: true })
  },
})
