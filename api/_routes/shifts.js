/**
 * A driver's working days.
 *
 *   GET            — the caller's own shifts, newest first
 *   GET ?driver=   — one driver's shifts. Admins and up only.
 *
 * There is no POST. Shifts are derived from the fixes a phone actually sent, so
 * a driver who could write their own would be filing a timesheet rather than
 * reporting one — and the whole point of the record is that it is evidence, not
 * a claim.
 */
import { handler, ok } from '../_lib/http.js'
import { requireUser } from '../_lib/auth.js'
import { badRequest, forbidden, query } from '../_lib/collection.js'
import { WRITE_ROLES } from '../_lib/rest.js'
import { forDriver } from '../_lib/shifts.js'

export default handler({
  async GET(req, res) {
    const caller = requireUser(req)
    const asked = query(req).get('driver')

    /* a driver reads their own record and nobody else's — the same rule the
       live map and the alert inbox already apply */
    if (asked && caller.r === 'driver' && `${asked}` !== `${caller.i}`) {
      throw forbidden('you may only read your own shifts')
    }
    if (asked && caller.r !== 'driver' && !WRITE_ROLES.includes(caller.r)) {
      throw forbidden()
    }

    const driverId = asked ? Number(asked) : caller.i
    if (!driverId) throw badRequest('driver is required')

    return ok(res, { ok: true, driverId, shifts: await forDriver(driverId) })
  },
})
