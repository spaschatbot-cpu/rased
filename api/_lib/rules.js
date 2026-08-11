/**
 * Alert rules — what the ingest path is watching for.
 *
 * A rule is a type, an optional threshold, who it applies to and how loudly it
 * should land. The engine in alerts.js reads them; this file only decides what
 * a well-formed rule is.
 *
 * `vehicles` is either the string `'all'` or a list of ids. Keeping the literal
 * rather than expanding it means a rule written today still covers a vehicle
 * registered tomorrow.
 */
import { collection, num, text } from './collection.js'

/** Every condition the engine knows how to evaluate. */
export const RULE_TYPES = [
  'speed',        // threshold = km/h; falls back to the vehicle's own limit
  'idle',         // threshold = minutes stationary with the engine reporting
  'geofenceIn',
  'geofenceOut',
  'power',        // external power lost
  'lowBattery',   // threshold = percent
  'sos',          // panic button from the driver app
  'ignitionOn',
  'ignitionOff',
  'maintenance',  // a service record crossed its due mark
]

export const SEVERITIES = ['low', 'medium', 'high']
export const CHANNELS = ['web', 'push', 'mail', 'sms']

const SEED = [
  { type: 'speed', threshold: 120, channels: ['web', 'push'], active: true, vehicles: 'all', severity: 'high' },
  { type: 'power', threshold: null, channels: ['web', 'mail', 'sms'], active: true, vehicles: 'all', severity: 'high' },
  { type: 'geofenceOut', threshold: null, channels: ['web', 'push'], active: true, vehicles: [1, 5, 6], severity: 'medium' },
  { type: 'idle', threshold: 20, channels: ['web'], active: false, vehicles: 'all', severity: 'low' },
  { type: 'sos', threshold: null, channels: ['web', 'sms', 'push'], active: true, vehicles: 'all', severity: 'high' },
  { type: 'maintenance', threshold: 10000, channels: ['mail'], active: true, vehicles: 'all', severity: 'low' },
]

const seed = () => SEED.map((r, i) => ({ id: i + 1, ...r, createdAt: new Date().toISOString() }))

function validate(body) {
  if (!RULE_TYPES.includes(text(body.type, 30))) return `type must be one of ${RULE_TYPES.join(', ')}`
  if (body.severity && !SEVERITIES.includes(text(body.severity, 10))) return 'severity must be low, medium or high'

  const channels = Array.isArray(body.channels) ? body.channels : []
  if (channels.some((c) => !CHANNELS.includes(c))) return `channels may only be ${CHANNELS.join(', ')}`

  if (body.vehicles !== 'all' && !Array.isArray(body.vehicles)) return "vehicles must be 'all' or a list of ids"

  /* a speed or idle rule with no number to compare against would fire on
     everything or on nothing — neither is what the operator meant */
  const needsThreshold = ['speed', 'idle', 'lowBattery', 'maintenance']
  if (needsThreshold.includes(body.type) && num(body.threshold, 0, 1e6) == null) {
    return `a ${body.type} rule needs a threshold`
  }
  return null
}

const shape = (body, existing) => ({
  ...existing,
  type: text(body.type, 30),
  threshold: num(body.threshold, 0, 1e6),
  channels: (Array.isArray(body.channels) ? body.channels : []).filter((c) => CHANNELS.includes(c)),
  vehicles: body.vehicles === 'all' ? 'all' : body.vehicles.map(Number).filter(Number.isFinite),
  severity: SEVERITIES.includes(body.severity) ? body.severity : 'low',
  active: body.active !== false,
})

export const rules = collection({ key: 'alertRules', seed, validate, shape })

/** Does this rule watch this vehicle? */
export const covers = (rule, vehicleId) =>
  rule.vehicles === 'all' || (Array.isArray(rule.vehicles) && rule.vehicles.includes(Number(vehicleId)))

/** The active rules of one type that apply to one vehicle. */
export const rulesFor = (list, type, vehicleId) =>
  list.filter((r) => r.active && r.type === type && covers(r, vehicleId))
