/**
 * Live positions for the dashboard.
 *
 * Polled every few seconds by the map, so it stays a single cheap read and
 * returns a plain array the client can merge straight into its fleet state.
 *
 * Vercel gives us no way to hold a socket open, so the dashboard polls rather
 * than being pushed to. At a few seconds' interval the map looks the same.
 */
import { handler, ok } from '../_lib/http.js'
import { requireUser } from '../_lib/auth.js'
import { findById } from '../_lib/users.js'
import { allPositions, statusOf } from '../_lib/positions.js'
import { vehicles } from '../_lib/vehicles.js'

export default handler({
  async GET(req, res) {
    const caller = requireUser(req)

    /* one registry read, used for both the ids to look fixes up by and the
       plates to label them with — see allPositions() on why it takes ids */
    const fleet = await vehicles.all()
    const all = await allPositions(fleet.map((v) => v.id))
    const plates = new Map(fleet.map((v) => [v.id, v.plate]))
    const now = Date.now()

    /* Watching the fleet is an operations job. A driver may see where their own
       vehicle is, but handing them every colleague's live location would be a
       privacy leak, not a feature. */
    let visible = Object.values(all)
    if (caller.r === 'driver') {
      const driver = await findById(caller.i)
      visible = visible.filter((fix) => fix.vehicleId === driver?.vehicleId)
    }

    const positions = visible.map((fix) => ({
      ...fix,
      plate: plates.get(fix.vehicleId) ?? null,
      status: statusOf(fix, now),
      /* how old this fix is, so the client need not trust its own clock */
      ageSeconds: Math.max(0, Math.round((now - new Date(fix.at).getTime()) / 1000)),
    }))

    return ok(res, { ok: true, positions, serverTime: new Date(now).toISOString() })
  },
})
