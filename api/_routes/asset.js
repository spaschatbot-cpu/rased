/**
 * Everything the mobile vehicle page shows, in one request.
 *
 *   GET ?id= — the registry row, its branch, the live fix, the assigned driver,
 *              today's trips and totals, and the assignment history
 *
 * The page could assemble this from five endpoints, but on a phone each of
 * those is a round-trip over a mobile network, and `/users` is closed to the
 * roles that may still look at a vehicle. Here the driver is reduced to what
 * the page needs: a name to show and a number to call.
 */
import { handler, ok } from '../_lib/http.js'
import { requireUser } from '../_lib/auth.js'
import { badRequest, forbidden, notFound, query } from '../_lib/collection.js'
import { vehicles } from '../_lib/vehicles.js'
import { groups } from '../_lib/groups.js'
import { positionOf, statusOf } from '../_lib/positions.js'
import { dayFor } from '../_lib/history.js'
import { allUsers, findById } from '../_lib/users.js'
import { assignmentsFor } from '../_lib/assignments.js'
import { dayOf } from '../../shared/clock.js'

export default handler({
  async GET(req, res) {
    const caller = requireUser(req)
    const id = Number(query(req).get('id'))
    if (!id) throw badRequest('id is required')

    /* the same rule as the live map: a driver sees their own vehicle only */
    if (caller.r === 'driver') {
      const me = await findById(caller.i)
      if (me?.vehicleId !== id) throw forbidden('you may only open your own vehicle')
    }

    const vehicle = await vehicles.find(id)
    if (!vehicle) throw notFound()

    const [group, fix, users, today, assignments] = await Promise.all([
      vehicle.groupId ? groups.find(vehicle.groupId) : null,
      positionOf(id),
      allUsers(),
      dayFor(id, dayOf()),
      assignmentsFor(id),
    ])

    const now = Date.now()
    const position = fix
      ? {
          ...fix,
          status: statusOf(fix, now),
          ageSeconds: Math.max(0, Math.round((now - new Date(fix.at).getTime()) / 1000)),
        }
      : null

    const account = users.find((u) => u.role === 'driver' && u.vehicleId === id && u.active !== false)
    const driver = account
      ? {
          id: account.id,
          nameAr: account.nameAr,
          nameEn: account.nameEn,
          phone: account.phone || '',
          username: account.username,
          lastLoginAt: account.lastLoginAt ?? null,
        }
      : vehicle.driverAr || vehicle.driverEn
        ? { id: null, nameAr: vehicle.driverAr, nameEn: vehicle.driverEn, phone: '', username: '', lastLoginAt: null }
        : null

    return ok(res, {
      ok: true,
      vehicle,
      group: group ? { id: group.id, nameAr: group.nameAr, nameEn: group.nameEn } : null,
      position,
      driver,
      today: { date: today.date, trips: today.trips, stops: today.stops, stats: today.stats },
      assignments: assignments.slice(0, 50),
    })
  },
})
