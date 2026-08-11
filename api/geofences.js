/**
 * Geofences.
 *
 *   GET    — any signed-in caller; the map draws them
 *   POST · PUT ?id= · DELETE ?id= — managers and up
 */
import { crud } from './_lib/rest.js'
import { geofences } from './_lib/geofences.js'

export default crud({ store: geofences, name: 'geofences', single: 'geofence' })
