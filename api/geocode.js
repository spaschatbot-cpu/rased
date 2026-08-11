/**
 * Coordinates → a place name.
 *
 *   GET ?lat=&lng=
 *
 * Any signed-in caller: the driver app labels its map with it, and the
 * dashboard uses the same endpoint so both name a location identically.
 *
 * `place: null` is a normal answer, not an error — the lookup service may be
 * down, or the point may be somewhere nobody has mapped. Callers show the
 * coordinates in that case, which is what they had to begin with.
 */
import { handler, ok } from './_lib/http.js'
import { requireUser } from './_lib/auth.js'
import { badRequest, query } from './_lib/collection.js'
import { reverse } from './_lib/geocode.js'

export default handler({
  async GET(req, res) {
    requireUser(req)
    const params = query(req)

    const lat = Number(params.get('lat'))
    const lng = Number(params.get('lng'))
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw badRequest('lat must be between -90 and 90')
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw badRequest('lng must be between -180 and 180')

    return ok(res, { ok: true, place: await reverse(lat, lng) })
  },
})
