/**
 * Where a hardware tracker's fixes come in.
 *
 * The driver app signs in as a person and the vehicle follows from the account.
 * A tracker bolted under a dashboard has no account and nobody to sign in as,
 * so it identifies itself by IMEI and the vehicle is looked up from the
 * registry — which already stores one per vehicle, and already refuses to store
 * the same one twice.
 *
 * This endpoint is not for devices to call. A Teltonika speaks binary Codec 8
 * over a raw TCP socket and cannot make an HTTPS request at all; tracker/ holds
 * the small service that listens for it, decodes, and posts here. So the only
 * caller is that service, it is a machine, and it authenticates with a shared
 * secret rather than a session.
 *
 * DEVICE_INGEST_SECRET is required. Without it this route is closed rather than
 * open — an unauthenticated position endpoint would let anyone write any
 * vehicle's location and history, which is worse than the feature is useful.
 */
import { timingSafeEqual } from 'node:crypto'
import { handler, readJson, ok, fail } from '../_lib/http.js'
import { ingest, MAX_BATCH, prepare } from '../_lib/ingest.js'
import { vehicles } from '../_lib/vehicles.js'

const SECRET = process.env.DEVICE_INGEST_SECRET || null

if (!SECRET) console.error('[api] DEVICE_INGEST_SECRET is not set — device ingest is closed.')

/** Constant time, so the comparison does not leak the secret one byte at a time. */
function authorised(req) {
  if (!SECRET) return false
  const header = req.headers?.authorization || ''
  const offered = header.startsWith('Bearer ') ? header.slice(7) : ''
  const a = Buffer.from(offered)
  const b = Buffer.from(SECRET)
  return a.length === b.length && timingSafeEqual(a, b)
}

export default handler({
  async POST(req, res) {
    if (!authorised(req)) return fail(res, 401, 'device ingest requires a valid secret')

    const body = await readJson(req)

    const imei = String(body.imei || '').trim()
    if (!/^\d{10,20}$/.test(imei)) return fail(res, 400, 'imei must be 10 to 20 digits')

    const fleet = await vehicles.all()
    const vehicle = fleet.find((v) => v.imei === imei)

    /* Naming the IMEI back is deliberate: the caller is our own service, not a
       stranger, and "which device is this" is the question being asked when a
       newly fitted tracker reports and nothing appears on the map. */
    if (!vehicle) return fail(res, 404, `no vehicle is registered with IMEI ${imei}`)
    if (vehicle.active === false) return fail(res, 409, `vehicle ${vehicle.plate} is not active`)

    const points = Array.isArray(body.points) ? body.points : [body]
    if (!points.length) return fail(res, 400, 'no points')
    if (points.length > MAX_BATCH) return fail(res, 400, 'too many points in one batch')

    const { valid, rejected } = prepare(points)
    if (!valid.length) return fail(res, 400, 'no usable fix in this request')

    /* no driver: nobody signed in, so there is no shift to open and no name to
       hang on the fix — the vehicle is the whole identity here */
    const { recorded, alerts, status } = await ingest(vehicle.id, valid, null)

    return ok(res, {
      ok: true,
      accepted: valid.length,
      rejected,
      recorded,
      vehicleId: vehicle.id,
      plate: vehicle.plate,
      status,
      alerts,
    })
  },
})
