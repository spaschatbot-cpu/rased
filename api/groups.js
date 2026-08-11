/**
 * Branches and groups.
 *
 *   GET    — any signed-in caller
 *   POST · PUT ?id= · DELETE ?id= — managers and up
 *
 * A branch still holding vehicles or accounts cannot be deleted; the operator
 * moves them first, so nothing is reassigned behind their back.
 */
import { crud } from './_lib/rest.js'
import { groups } from './_lib/groups.js'
import { vehicles } from './_lib/vehicles.js'
import { allUsers } from './_lib/users.js'
import { badRequest } from './_lib/collection.js'

export default crud({
  store: groups,
  name: 'groups',
  single: 'group',

  hooks: {
    async beforeDelete(row) {
      if (!row) return
      const [fleet, accounts] = await Promise.all([vehicles.all(), allUsers()])
      const usedBy = fleet.filter((v) => v.groupId === row.id).length
      const staff = accounts.filter((u) => u.groupId === row.id).length
      if (usedBy || staff) {
        throw badRequest(
          `branch still has ${usedBy} vehicle(s) and ${staff} account(s) — move them first`,
        )
      }
    },
  },
})
