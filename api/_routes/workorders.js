/**
 * Work orders — who drives which vehicle on which route, and when.
 *
 *   GET — the office (a driver reads their runs from /trips instead)
 *   POST · PUT ?id= · DELETE ?id= — admins and up
 */
import { crud } from '../_lib/rest.js'
import { workOrders } from '../_lib/operations.js'

export default crud({
  store: workOrders,
  name: 'workOrders',
  single: 'workOrder',
  read: ['superadmin', 'admin', 'viewer'],
})
