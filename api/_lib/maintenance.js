/**
 * Service schedule.
 *
 * A record says: this vehicle, this job, due every `period` — counted in
 * kilometres, engine hours or days depending on `kind` — starting from the
 * reading at `start`.
 *
 * What is *stored* is only that plan. How far through it a vehicle is depends
 * on a reading that changes every time the vehicle moves, so `decorate()`
 * derives it at read time instead. Storing a stale `used` was how the demo
 * managed to show a service as overdue and on schedule at once.
 */
import { collection, num, text } from './collection.js'

export const KINDS = ['odometer', 'hours', 'date']
/**
 * The jobs the screen knows an icon and a name for, plus `other` — a job the
 * operator named themselves. `other` carries a `label`; the rest take their
 * name from the reader's language, so the same record reads in Arabic and in
 * English without anything being stored twice.
 */
export const TYPES = ['oil', 'tires', 'brakes', 'inspection', 'battery', 'filter', 'other']

const SEED = [
  { vehicleId: 1, type: 'oil', kind: 'odometer', period: 10000, used: 1.09, cost: 420, vendorAr: 'ورشة الرياض المركزية', vendorEn: 'Riyadh Central Workshop' },
  { vehicleId: 2, type: 'brakes', kind: 'odometer', period: 30000, used: 1.02, cost: 1250, vendorAr: 'مركز الخدمة السريعة', vendorEn: 'Quick Service Center' },
  { vehicleId: 3, type: 'inspection', kind: 'date', period: 365, used: 0.97, cost: 350, vendorAr: 'الفحص الدوري', vendorEn: 'Periodic Inspection' },
  { vehicleId: 4, type: 'tires', kind: 'odometer', period: 45000, used: 0.88, cost: 2600, vendorAr: 'مركز الإطارات', vendorEn: 'Tire Center' },
  { vehicleId: 5, type: 'oil', kind: 'hours', period: 250, used: 0.91, cost: 420, vendorAr: 'ورشة الدمام', vendorEn: 'Dammam Workshop' },
  { vehicleId: 6, type: 'battery', kind: 'date', period: 730, used: 0.62, cost: 780, vendorAr: 'مركز البطاريات', vendorEn: 'Battery Center' },
  { vehicleId: 7, type: 'filter', kind: 'odometer', period: 15000, used: 0.41, cost: 190, vendorAr: 'ورشة جدة', vendorEn: 'Jeddah Workshop' },
  { vehicleId: 8, type: 'inspection', kind: 'date', period: 365, used: 0.24, cost: 350, vendorAr: 'الفحص الدوري', vendorEn: 'Periodic Inspection' },
  { vehicleId: 2, type: 'oil', kind: 'hours', period: 250, used: 0.55, cost: 420, vendorAr: 'ورشة الرياض المركزية', vendorEn: 'Riyadh Central Workshop' },
  { vehicleId: 4, type: 'filter', kind: 'odometer', period: 15000, used: 0.93, cost: 190, vendorAr: 'مركز الخدمة السريعة', vendorEn: 'Quick Service Center' },
]

/** Today counted in whole days since the epoch — the reading a `date` job uses. */
export const today = () => Math.floor(Date.now() / 864e5)

/**
 * The seed carries how far through each period a job should appear to be, so a
 * fresh install shows a believable spread of overdue, due-soon and planned
 * work. `start` is solved backwards from that so the stored plan is real.
 */
function seed() {
  const now = new Date().toISOString()
  return SEED.map((m, i) => {
    /* the registry's own baselines — vehicles.js seeds them at the same index */
    const odometer = Math.round(38000 + (m.vehicleId - 1) * 21000)
    const hours = Math.round(320 + (m.vehicleId - 1) * 340)
    const current = m.kind === 'odometer' ? odometer : m.kind === 'hours' ? hours : today()

    return {
      id: i + 1,
      vehicleId: m.vehicleId,
      type: m.type,
      label: '',
      kind: m.kind,
      period: m.period,
      start: Math.round(current - m.period * m.used),
      cost: m.cost,
      vendorAr: m.vendorAr,
      vendorEn: m.vendorEn,
      lastDoneAt: null,
      createdAt: now,
    }
  })
}

function validate(body, list, existing) {
  if (!TYPES.includes(text(body.type, 20))) return `type must be one of ${TYPES.join(', ')}`
  /* a job filed under `other` has nothing else to be called — an unnamed one
     would show up in the schedule as a row nobody can identify */
  if (text(body.type, 20) === 'other' && !text(body.label, 80)) return 'a maintenance name is required'
  if (!KINDS.includes(text(body.kind, 20))) return `kind must be one of ${KINDS.join(', ')}`
  if (num(body.vehicleId, 1, 1e9) == null) return 'a vehicle is required'
  if (num(body.period, 1, 1e6) == null) return 'period must be a positive number'
  if (!existing && num(body.start, 0, 1e7) == null && body.start !== undefined) return 'invalid start reading'
  return null
}

const shape = (body, existing) => ({
  ...existing,
  vehicleId: num(body.vehicleId, 1, 1e9),
  type: text(body.type, 20),
  /* only a named job keeps a label — picking a known type back drops it, so a
     stale name cannot outlive the type it was typed against */
  label: text(body.type, 20) === 'other' ? text(body.label, 80) : '',
  kind: text(body.kind, 20),
  period: num(body.period, 1, 1e6),
  /* a new record with no explicit start begins at the current reading, which
     is the only sane reading of "schedule this from now" */
  start: num(body.start, 0, 1e7, existing.start ?? null),
  cost: num(body.cost, 0, 1e7, existing.cost ?? 0),
  vendorAr: text(body.vendorAr, 120) || text(body.vendorEn, 120),
  vendorEn: text(body.vendorEn, 120) || text(body.vendorAr, 120),
  lastDoneAt: existing.lastDoneAt ?? null,
})

export const maintenance = collection({ key: 'maintenance', seed, validate, shape })

/** overdue = past due · soon = under 15% of the period left · planned = fine */
export const stateOf = (used) => (used >= 1 ? 'overdue' : used >= 0.85 ? 'soon' : 'planned')

/** The reading a record is measured against, taken from the vehicle registry. */
export function readingFor(record, vehicle) {
  if (record.kind === 'odometer') return Math.round(vehicle?.odometer ?? 0)
  if (record.kind === 'hours') return Math.round(vehicle?.engineHours ?? 0)
  return today()
}

/**
 * Add the derived fields the dashboard renders. Everything here is a function
 * of the plan plus the vehicle's current reading — nothing is stored.
 */
export function decorate(record, vehicle) {
  const current = readingFor(record, vehicle)
  const start = record.start ?? current
  const nextDue = start + record.period
  const used = record.period ? (current - start) / record.period : 0

  return {
    ...record,
    current,
    start,
    nextDue,
    used: Number(used.toFixed(3)),
    remaining: nextDue - current,
    state: stateOf(used),
    /* a due *date* is only real for a date-based job; for the other two it is
       a projection, so it is left out rather than invented */
    dueDate: record.kind === 'date' ? new Date(nextDue * 864e5).toISOString() : null,
    startDate: record.kind === 'date' ? new Date(start * 864e5).toISOString() : (record.createdAt ?? null),
  }
}

/** Completing a job rolls the plan forward from the reading it was done at. */
export const completedFields = (record, vehicle) => ({
  start: readingFor(record, vehicle),
  lastDoneAt: new Date().toISOString(),
})
