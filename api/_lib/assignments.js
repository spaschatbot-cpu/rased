/**
 * Who drove which vehicle, and since when.
 *
 * One capped list per vehicle (`assign:<id>`), newest first. An entry is written
 * whenever an account's vehicle changes from the Management screen — assigned,
 * moved to another vehicle, or removed — so the vehicle page can show the
 * hand-over history rather than only the current driver.
 *
 * Writing here is bookkeeping. A failure must never fail the account change
 * that caused it, so callers go through `noteAssignmentChange`, which swallows
 * and logs.
 */
import { list, unshift } from './store.js'

const keyFor = (vehicleId) => `assign:${vehicleId}`
const LIMIT = 200

/** The vehicle's assignment history, newest first. */
export const assignmentsFor = (vehicleId) => list(keyFor(vehicleId))

/**
 * Record the move of `user` from `before` to `after` (vehicle ids, either may
 * be null). Nothing is written when the vehicle did not change.
 */
export async function noteAssignmentChange(user, before, after, by = null) {
  if ((before ?? null) === (after ?? null)) return
  const at = new Date().toISOString()
  const who = {
    driverId: user.id,
    nameAr: user.nameAr || user.nameEn || '',
    nameEn: user.nameEn || user.nameAr || '',
    by,
    at,
  }
  try {
    if (before) await unshift(keyFor(before), { ...who, action: 'unassigned' }, LIMIT)
    if (after) await unshift(keyFor(after), { ...who, action: 'assigned' }, LIMIT)
  } catch (err) {
    console.error('[assignments] could not record:', err.message)
  }
}
