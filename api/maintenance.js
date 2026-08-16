/**
 * Service schedule.
 *
 *   GET    — any signed-in caller; rows come back decorated with how far
 *            through their period each job is
 *   POST · PUT ?id= — admins and up
 *   POST ?id=&action=complete — mark a job done and roll the plan forward
 *   DELETE ?id= — admins and up
 *
 * Written out longhand rather than through `crud()` because two of the verbs
 * do something the generic version does not: GET joins the vehicle registry,
 * and POST carries the complete action.
 */
import { handler, readJson, ok } from './_lib/http.js'
import { requireUser } from './_lib/auth.js'
import { WRITE_ROLES } from './_lib/rest.js'
import { forbidden, idParam, notFound, query } from './_lib/collection.js'
import { completedFields, decorate, maintenance, readingFor } from './_lib/maintenance.js'
import { vehicles } from './_lib/vehicles.js'

function gate(req) {
  const caller = requireUser(req)
  if (!WRITE_ROLES.includes(caller.r)) throw forbidden()
  return caller
}

/** Records joined to the registry, so `used` and `state` reflect real readings. */
async function decorated() {
  const [records, fleet] = await Promise.all([maintenance.all(), vehicles.all()])
  const byId = new Map(fleet.map((v) => [v.id, v]))
  return records.map((m) => decorate(m, byId.get(m.vehicleId)))
}

export default handler({
  async GET(req, res) {
    requireUser(req)
    return ok(res, { ok: true, maintenance: await decorated() })
  },

  async POST(req, res) {
    gate(req)

    /* completing a job is a POST against an existing record, not a new one */
    if (query(req).get('action') === 'complete') {
      const id = idParam(req)
      const record = await maintenance.find(id)
      if (!record) throw notFound()
      const vehicle = await vehicles.find(record.vehicleId)
      const updated = await maintenance.patch(id, completedFields(record, vehicle))
      return ok(res, { ok: true, record: decorate(updated, vehicle) })
    }

    const body = await readJson(req)
    /* "schedule this from now" — start counting at the vehicle's reading today */
    if (body.start == null) {
      body.start = readingFor(body, await vehicles.find(body.vehicleId))
    }
    const record = await maintenance.create(body)
    return ok(res, { ok: true, record: decorate(record, await vehicles.find(record.vehicleId)) })
  },

  async PUT(req, res) {
    gate(req)

    const body = await readJson(req)
    /* the counting basis can change on an edit, and a start reading in the old
       unit means nothing in the new one — the screen sends it back empty, and
       the plan re-bases on the vehicle's reading today, as a new one would */
    if (body.start == null) {
      body.start = readingFor(body, await vehicles.find(body.vehicleId))
    }
    const record = await maintenance.update(idParam(req), body)
    return ok(res, { ok: true, record: decorate(record, await vehicles.find(record.vehicleId)) })
  },

  async DELETE(req, res) {
    gate(req)
    await maintenance.remove(idParam(req))
    return ok(res, { ok: true })
  },
})
