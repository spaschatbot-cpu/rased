/**
 * Saved routes — drawn once on the map, reused by work orders.
 *
 *   GET — any signed-in caller (the driver app names the route of a trip)
 *   POST · PUT ?id= · DELETE ?id= — admins and up
 */
import { crud } from '../_lib/rest.js'
import { routes } from '../_lib/operations.js'

export default crud({ store: routes, name: 'routes', single: 'route' })
