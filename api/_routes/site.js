/**
 * The landing page's content.
 *
 *   GET  — public. Every visitor reads the live configuration from here.
 *
 * There is no PUT: the content editor was retired, so no account — however
 * privileged — can change the landing page through the API.
 */
import { handler, ok } from '../_lib/http.js'
import { get } from '../_lib/store.js'
import { EMPTY, normalise } from '../_lib/site.js'

const KEY = 'site'

export default handler({
  async GET(req, res) {
    const stored = await get(KEY)
    return ok(res, { ok: true, site: stored ? normalise(stored) : EMPTY })
  },
})
