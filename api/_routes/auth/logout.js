import { handler, ok } from '../../_lib/http.js'
import { clearedCookie } from '../../_lib/auth.js'

export default handler({
  POST(req, res) {
    return ok(res, { ok: true }, { 'Set-Cookie': clearedCookie() })
  },
})
