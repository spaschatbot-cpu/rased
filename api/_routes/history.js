/**
 * The replay screen's data source.
 *
 *   GET ?vehicle=&date=YYYY-MM-DD — the day's track, trips, stops and totals
 *   GET ?vehicle=&days=1          — which days that vehicle has a trail for
 *
 * `date` defaults to today. A day with no recorded trail comes back as an empty
 * track rather than a 404: "this vehicle did not report" is an answer, and the
 * screen renders it as one.
 */
import { handler, ok } from '../_lib/http.js'
import { requireUser } from '../_lib/auth.js'
import { badRequest, query } from '../_lib/collection.js'
import { dayFor, dayOf, daysFor } from '../_lib/history.js'


export default handler({
  async GET(req, res) {
    /* any signed-in account may replay any vehicle — see positions.js */
    requireUser(req)
    const params = query(req)

    const vehicleId = Number(params.get('vehicle'))
    if (!vehicleId) throw badRequest('vehicle is required')

    if (params.get('days')) {
      return ok(res, { ok: true, vehicleId, days: await daysFor(vehicleId) })
    }

    const date = params.get('date') || dayOf()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw badRequest('date must be YYYY-MM-DD')

    return ok(res, { ok: true, ...(await dayFor(vehicleId, date)) })
  },
})
