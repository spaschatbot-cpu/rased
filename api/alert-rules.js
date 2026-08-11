/**
 * Alert rules.
 *
 *   GET    — any signed-in caller
 *   POST · PUT ?id= · DELETE ?id= — admins and up
 *
 * Changes take effect on the next fix that arrives: the engine reads the rules
 * per request rather than caching them, so a rule switched off stops firing
 * immediately instead of at the next deploy.
 */
import { crud } from './_lib/rest.js'
import { rules } from './_lib/rules.js'

export default crud({ store: rules, name: 'rules', single: 'rule' })
