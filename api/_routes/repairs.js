/**
 * Repair requests — a driver reporting a fault from the app.
 *
 *   GET            — a driver sees their own; the office sees every request
 *   GET  ?photo=id — the photo of one request (kept apart, see below)
 *   POST           — a driver files one: category, description, optional photo
 *   PATCH ?id=     — the office moves it along: status and a note back
 *
 * Photos are stored under their own key, not in the list. The list is read
 * every time the office opens the tab and the driver opens the screen; carrying
 * every photo with it would make each of those reads megabytes long.
 */
import { handler, readJson, ok, fail } from '../_lib/http.js'
import { requireUser } from '../_lib/auth.js'
import { get, mutate, set } from '../_lib/store.js'
import { findById } from '../_lib/users.js'
import { vehicles } from '../_lib/vehicles.js'

const KEY = 'repairs'
const photoKey = (id) => `repair-photo:${id}`
const INBOX = 'alerts'

export const CATEGORIES = ['engine', 'tires', 'brakes', 'electrical', 'ac', 'accident', 'other']
export const STATUSES = ['open', 'inProgress', 'done', 'rejected']

/** Most requests kept; the oldest closed ones fall off first. */
const LIMIT = 1000
/** A phone photo resized by the app is ~100–300 KB; this is a ceiling, not a target. */
const MAX_PHOTO_CHARS = 1_500_000

const OFFICE = ['superadmin', 'admin', 'viewer']
const WRITERS = ['superadmin', 'admin']

const clean = (v, max) => String(v ?? '').trim().slice(0, max)
const param = (req, name) => new URL(req.url, 'http://localhost').searchParams.get(name)

const forbidden = () => {
  const err = new Error('not allowed for this role')
  err.statusCode = 403
  return err
}

export default handler({
  async GET(req, res) {
    const caller = requireUser(req)

    const photoOf = param(req, 'photo')
    if (photoOf) {
      const list = (await get(KEY)) ?? []
      const r = list.find((x) => x.id === photoOf)
      if (!r) return fail(res, 404, 'request not found')
      if (caller.r === 'driver' ? r.driverId !== caller.i : !OFFICE.includes(caller.r)) throw forbidden()
      return ok(res, { ok: true, photo: (await get(photoKey(photoOf))) ?? null })
    }

    const list = (await get(KEY)) ?? []
    if (caller.r === 'driver') return ok(res, { ok: true, repairs: list.filter((r) => r.driverId === caller.i) })
    if (!OFFICE.includes(caller.r)) throw forbidden()
    return ok(res, { ok: true, repairs: list })
  },

  async POST(req, res) {
    const caller = requireUser(req)
    if (caller.r !== 'driver') return fail(res, 403, 'only a driver files a repair request')

    const driver = await findById(caller.i)
    if (!driver || driver.active === false) return fail(res, 403, 'account is disabled')

    /* a photo rides in this body, so it is allowed more than the default */
    const body = await readJson(req, 2 * 1024 * 1024)
    const category = clean(body.category, 20)
    if (!CATEGORIES.includes(category)) return fail(res, 400, `category must be one of ${CATEGORIES.join(', ')}`)
    const description = clean(body.description, 1000)
    if (!description) return fail(res, 400, 'a description is required')

    const photo = typeof body.photo === 'string' ? body.photo : null
    if (photo && (!/^data:image\/(jpeg|png|webp);base64,/.test(photo) || photo.length > MAX_PHOTO_CHARS)) {
      return fail(res, 400, 'photo must be a JPEG, PNG or WebP under about 1 MB')
    }

    const vehicle = driver.vehicleId ? await vehicles.find(driver.vehicleId) : null
    const now = new Date().toISOString()
    const id = `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

    const request = {
      id,
      driverId: driver.id,
      driverNameAr: driver.nameAr,
      driverNameEn: driver.nameEn,
      vehicleId: vehicle?.id ?? null,
      plate: vehicle?.plate ?? null,
      category,
      description,
      hasPhoto: Boolean(photo),
      status: 'open',
      note: '',
      createdAt: now,
      updatedAt: now,
    }

    if (photo) await set(photoKey(id), photo)
    await mutate(KEY, (current) => [request, ...(Array.isArray(current) ? current : [])].slice(0, LIMIT))

    /* the office learns of it where it learns of everything else: the alert
       inbox. Best-effort — the request is filed whether or not this lands */
    try {
      await mutate(INBOX, (current) =>
        [
          {
            id: `rep-${id}`,
            ruleId: null,
            type: 'repair',
            severity: category === 'accident' ? 'high' : 'medium',
            channels: ['web'],
            vehicleId: vehicle?.id ?? null,
            plate: vehicle?.plate ?? null,
            driverId: driver.id,
            driverName: driver.nameAr,
            detail: `${driver.nameAr} — ${description.slice(0, 80)}`,
            value: null,
            zoneId: null,
            lat: null,
            lng: null,
            at: now,
            read: false,
          },
          ...(Array.isArray(current) ? current : []),
        ].slice(0, 500),
      )
    } catch (err) {
      console.error('[repairs] could not raise the inbox alert:', err.message)
    }

    return ok(res, { ok: true, repair: request })
  },

  async PATCH(req, res) {
    const caller = requireUser(req)
    if (!WRITERS.includes(caller.r)) throw forbidden()

    const id = param(req, 'id')
    const body = await readJson(req)
    const status = body.status == null ? null : clean(body.status, 20)
    if (status && !STATUSES.includes(status)) return fail(res, 400, `status must be one of ${STATUSES.join(', ')}`)

    let updated = null
    await mutate(KEY, (current) => {
      const list = Array.isArray(current) ? current : []
      const i = list.findIndex((r) => r.id === id)
      if (i < 0) return undefined
      updated = {
        ...list[i],
        ...(status ? { status } : null),
        ...(body.note != null ? { note: clean(body.note, 500) } : null),
        updatedAt: new Date().toISOString(),
        updatedBy: caller.u,
      }
      list[i] = updated
      return list
    })
    if (!updated) return fail(res, 404, 'request not found')
    return ok(res, { ok: true, repair: updated })
  },
})
