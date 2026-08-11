/**
 * The alert inbox.
 *
 *   GET                     — the alerts this caller may see, newest first
 *   POST                    — send one by hand to a vehicle (admins and up)
 *   PATCH ?id=              — mark one read
 *   PATCH                   — mark everything read
 *   DELETE ?id=             — dismiss one
 *   DELETE ?all=1           — clear the inbox (admins and up)
 *
 * Every other alert here is written by the ingest path from what a vehicle
 * actually did. POST is the one exception and it is deliberately narrow:
 * admins and up only, the sender's name is taken from their account rather
 * than the body, and the result is stamped `manual` — so an alert a person
 * sent can always be told apart from one the fleet's own sensors raised.
 */
import { handler, readJson, ok } from './_lib/http.js'
import { requireUser } from './_lib/auth.js'
import { badRequest, forbidden, query, text } from './_lib/collection.js'
import { WRITE_ROLES } from './_lib/rest.js'
import { MANUAL_TYPES, inbox, markRead, removeAlert, sendManual } from './_lib/alerts.js'
import { findById } from './_lib/users.js'
import { vehicles as registry } from './_lib/vehicles.js'

/**
 * A driver sees alerts about their own vehicle; everyone else sees the fleet.
 *
 * Sorted by when the alert happened, not by when it was written. A phone that
 * reports a day late would otherwise push older events above newer ones, and
 * "newest first" has to mean the journey's order, not the network's.
 */
async function visibleTo(caller) {
  let all = await inbox()

  if (caller.r === 'driver') {
    const driver = await findById(caller.i)
    all = all.filter((a) => a.vehicleId === driver?.vehicleId)
  }

  return [...all].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
}

export default handler({
  async GET(req, res) {
    const caller = requireUser(req)
    const alerts = await visibleTo(caller)
    return ok(res, { ok: true, alerts, unread: alerts.filter((a) => !a.read).length })
  },

  async POST(req, res) {
    const caller = requireUser(req)
    if (!WRITE_ROLES.includes(caller.r)) throw forbidden()

    const body = await readJson(req)

    const vehicleId = Number(body.vehicleId)
    if (!vehicleId) throw badRequest('vehicleId is required')
    const vehicle = (await registry.all()).find((v) => v.id === vehicleId)
    if (!vehicle) throw badRequest(`no vehicle with id ${vehicleId}`)

    const type = String(body.type ?? '')
    if (!MANUAL_TYPES.includes(type)) {
      throw badRequest(`type must be one of ${MANUAL_TYPES.join(', ')}`)
    }

    const severity = ['high', 'medium', 'low'].includes(body.severity) ? body.severity : 'medium'

    /* the sender is read from their account, never from the body — a notice
       that carries a name must carry the right one */
    const author = await findById(caller.i)

    const alert = await sendManual({
      vehicle,
      type,
      severity,
      detail: text(body.detail, 200),
      author,
    })

    return ok(res, { ok: true, alert })
  },

  async PATCH(req, res) {
    requireUser(req)
    const id = query(req).get('id')
    const alerts = await markRead(id || null)
    return ok(res, { ok: true, alerts, unread: alerts.filter((a) => !a.read).length })
  },

  async DELETE(req, res) {
    const caller = requireUser(req)
    const params = query(req)

    if (params.get('all')) {
      if (!WRITE_ROLES.includes(caller.r)) throw forbidden()
      await removeAlert(null)
      return ok(res, { ok: true, cleared: true })
    }

    const removed = await removeAlert(params.get('id'))
    return ok(res, { ok: true, removed })
  },
})
