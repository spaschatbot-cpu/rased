/**
 * The vehicle registry.
 *
 *   GET    — any signed-in caller; the map and every report need the list
 *   POST · PUT ?id= · DELETE ?id= — admins and up
 *
 * Deleting a vehicle takes its live fix and its assignment with it, so a driver
 * is never left reporting into a row that no longer exists.
 */
import { crud } from './_lib/rest.js'
import { vehicles } from './_lib/vehicles.js'
import { clear } from './_lib/positions.js'
import { allUsers, saveUsers } from './_lib/users.js'

export default crud({
  store: vehicles,
  name: 'vehicles',
  single: 'vehicle',

  hooks: {
    async beforeDelete(row) {
      if (!row) return
      await clear(row.id)
      /* unassign the drivers who were pointed at it — leaving a dangling
         vehicleId would fail their next shift with a confusing 409 */
      const list = await allUsers()
      const touched = list.map((u) => (u.vehicleId === row.id ? { ...u, vehicleId: null } : u))
      if (touched.some((u, i) => u !== list[i])) await saveUsers(touched)
    },
  },
})
