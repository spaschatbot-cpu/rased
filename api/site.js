/**
 * The landing page's content.
 *
 *   GET  — public. Every visitor reads the live configuration from here.
 *   PUT  — super-admin only. This is what makes an edit show up for everyone.
 */
import { handler, readJson, ok } from './_lib/http.js'
import { requireAdmin } from './_lib/auth.js'
import { get, set } from './_lib/store.js'
import { EMPTY, normalise } from './_lib/site.js'

const KEY = 'site'

export default handler({
  async GET(req, res) {
    const stored = await get(KEY)
    return ok(res, { ok: true, site: stored ? normalise(stored) : EMPTY })
  },

  async PUT(req, res) {
    const admin = requireAdmin(req)
    const site = normalise(await readJson(req))

    await set(KEY, { ...site, updatedAt: new Date().toISOString(), updatedBy: admin.u })
    return ok(res, { ok: true, site })
  },
})
