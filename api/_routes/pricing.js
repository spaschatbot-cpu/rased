/**
 * Pricing — what a trip costs, per work-order type.
 *
 *   GET — the office
 *   PUT — admins and up; body `{ [type]: { mode: trip|km, amount } }`
 */
import { handler, readJson, ok, fail } from '../_lib/http.js'
import { requireUser } from '../_lib/auth.js'
import { getPricing, setPricing } from '../_lib/operations.js'

const OFFICE = ['superadmin', 'admin', 'viewer']
const WRITERS = ['superadmin', 'admin']

export default handler({
  async GET(req, res) {
    const caller = requireUser(req)
    if (!OFFICE.includes(caller.r)) return fail(res, 403, 'not allowed for this role')
    return ok(res, { ok: true, pricing: await getPricing() })
  },

  async PUT(req, res) {
    const caller = requireUser(req)
    if (!WRITERS.includes(caller.r)) return fail(res, 403, 'not allowed for this role')
    return ok(res, { ok: true, pricing: await setPricing(await readJson(req)) })
  },
})
