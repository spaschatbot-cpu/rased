/**
 * The four verbs over a collection, with the role gate in front.
 *
 * Every editable list in the dashboard answers the same four requests, so the
 * endpoint files below only declare *who* may read and *who* may write. The
 * behaviour — and therefore the error messages, the id handling and the
 * response shape — stays identical across all of them.
 */
import { handler, readJson, ok } from './http.js'
import { requireUser } from './auth.js'
import { forbidden, idParam } from './collection.js'

/** Roles that may change fleet configuration. Viewers and drivers read only. */
export const WRITE_ROLES = ['superadmin', 'admin', 'manager']

function gate(req, roles) {
  const caller = requireUser(req)
  if (roles && !roles.includes(caller.r)) throw forbidden()
  return caller
}

/**
 * @param store  a `collection()`
 * @param name   plural key the list is returned under, e.g. `vehicles`
 * @param single key one written row is returned under, e.g. `vehicle`
 * @param write  roles allowed to create/update/delete (default: managers up)
 * @param read   roles allowed to list (default: any signed-in caller)
 * @param hooks  optional `{ beforeDelete(row, caller), afterWrite(row, caller) }`
 */
export function crud({ store, name, single, write = WRITE_ROLES, read = null, hooks = {} }) {
  return handler({
    async GET(req, res) {
      gate(req, read)
      return ok(res, { ok: true, [name]: await store.all() })
    },

    async POST(req, res) {
      const caller = gate(req, write)
      const row = await store.create(await readJson(req))
      await hooks.afterWrite?.(row, caller)
      return ok(res, { ok: true, [single]: row })
    },

    async PUT(req, res) {
      const caller = gate(req, write)
      const row = await store.update(idParam(req), await readJson(req))
      await hooks.afterWrite?.(row, caller)
      return ok(res, { ok: true, [single]: row })
    },

    async DELETE(req, res) {
      const caller = gate(req, write)
      const id = idParam(req)
      if (hooks.beforeDelete) await hooks.beforeDelete(await store.find(id), caller)
      await store.remove(id)
      return ok(res, { ok: true })
    },
  })
}
