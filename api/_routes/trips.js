/**
 * Trips — the runs of the work orders.
 *
 *   GET   ?from=&to=   — the office sees every trip in the range; a driver sees
 *                        their own (default: today and the next 6 days)
 *   PATCH ?id=         — body `{ action }`:
 *                          a driver may `start` and `complete` their own trip;
 *                          the office may also `cancel` and `reset` one
 */
import { handler, readJson, ok, fail } from '../_lib/http.js'
import { requireUser } from '../_lib/auth.js'
import { MAX_TRIP_DAYS, setTripState, tripsBetween, workOrders } from '../_lib/operations.js'
import { dayBack, dayOf } from '../../shared/clock.js'

const OFFICE = ['superadmin', 'admin', 'viewer']
const WRITERS = ['superadmin', 'admin']
const DATE = /^\d{4}-\d{2}-\d{2}$/

const param = (req, name) => new URL(req.url, 'http://localhost').searchParams.get(name)

export default handler({
  async GET(req, res) {
    const caller = requireUser(req)
    const isDriver = caller.r === 'driver'
    if (!isDriver && !OFFICE.includes(caller.r)) return fail(res, 403, 'not allowed for this role')

    const from = param(req, 'from') || dayBack(isDriver ? 0 : 7)
    const to = param(req, 'to') || dayOf(Date.now() + (isDriver ? 6 : 7) * 864e5)
    if (!DATE.test(from) || !DATE.test(to)) return fail(res, 400, 'from and to must be YYYY-MM-DD')
    if (from > to) return fail(res, 400, 'from must not be after to')
    if ((Date.parse(to) - Date.parse(from)) / 864e5 > MAX_TRIP_DAYS) {
      return fail(res, 400, `range may not exceed ${MAX_TRIP_DAYS} days`)
    }

    const trips = await tripsBetween(from, to, { driverId: isDriver ? caller.i : null })
    return ok(res, { ok: true, from, to, trips })
  },

  async PATCH(req, res) {
    const caller = requireUser(req)
    const id = param(req, 'id') || ''
    const [woId, date] = id.split(':')
    if (!Number(woId) || !DATE.test(date || '')) return fail(res, 400, 'id must be workOrderId:YYYY-MM-DD')

    const { action } = await readJson(req)
    const driverActions = ['start', 'complete']
    const officeActions = ['start', 'complete', 'cancel', 'reset']

    const wo = await workOrders.find(Number(woId))
    if (!wo) return fail(res, 404, 'work order not found')

    if (caller.r === 'driver') {
      if (wo.driverId !== caller.i) return fail(res, 403, 'this trip belongs to another driver')
      if (!driverActions.includes(action)) return fail(res, 400, `a driver may only ${driverActions.join(' or ')}`)
    } else if (!WRITERS.includes(caller.r)) {
      return fail(res, 403, 'not allowed for this role')
    } else if (!officeActions.includes(action)) {
      return fail(res, 400, `action must be one of ${officeActions.join(', ')}`)
    }

    /* the trip must be one the schedule actually produces */
    const runs = await tripsBetween(date, date, { driverId: wo.driverId })
    if (!runs.some((t) => t.id === id)) return fail(res, 404, 'no trip of this work order on that date')

    const next = await setTripState(id, action, caller.u)
    if (!next) return fail(res, 409, `cannot ${action} a trip in its current state`)
    const [trip] = await tripsBetween(date, date, { driverId: wo.driverId }).then((r) => r.filter((t) => t.id === id))
    return ok(res, { ok: true, trip })
  },
})
