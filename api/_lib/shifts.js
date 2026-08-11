/**
 * Shifts — when a driver started, and when they stopped.
 *
 * The platform could always answer "where was this vehicle at 10:40" from the
 * trail, but not "did Ahmed work yesterday, and for how long". Those are
 * different questions: a trail is a line on a map, a shift is a claim about a
 * person's working day, and payroll and disputes are settled with the second.
 *
 * Derived rather than declared. The app has no "I am starting now" call — it
 * simply begins sending fixes — so a shift **opens on the first fix that finds
 * no shift open**, and closes when the driver ends it. That keeps the record
 * true to what actually happened instead of to what the app remembered to
 * announce: a phone killed by the OS mid-route never sends its closing call,
 * and a shift that depended on one would stay open forever.
 *
 * Which is why an open shift also expires. A driver who closes the app without
 * ending the shift leaves one hanging; the next day's first fix would otherwise
 * be filed under yesterday and report a twenty-hour day. Any shift whose last
 * fix is older than [STALE_AFTER_MS] is closed at that last fix — the moment we
 * last had evidence they were working — and marked so nobody mistakes it for a
 * clean clock-out.
 */
import { del, get, list, set, unshift } from './store.js'

/** One list per driver: a driver only ever reads their own, and writes to it
    are serialised by their own phone rather than raced by the fleet. */
const keyFor = (driverId) => `shifts:${driverId}`

/** The shift currently being written to, if any. */
const openKeyFor = (driverId) => `shift:open:${driverId}`

/** No fix for this long means the phone stopped reporting, not that the driver
    is still working. Longer than the live map's own staleness window, because
    a tunnel or a dead zone is not the end of a working day. */
export const STALE_AFTER_MS = 45 * 60 * 1000

/** How many shifts are kept per driver. About three months of daily work. */
const KEEP = 120

const minutesBetween = (from, to) =>
  Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 60000))

/**
 * Fold the fix into this driver's shift record.
 *
 * Called on every point, so it is written to stay cheap: the common case is a
 * fix landing inside an already-open shift, which is one read and one write of
 * a small object.
 */
export async function noteFix(driver, fix) {
  const openKey = openKeyFor(driver.id)
  const open = await get(openKey)
  const at = Date.parse(fix.at)

  /* The phone went quiet long enough that this is a new working day.
     Only a gap *forward* counts: a fix that predates what we already hold is a
     buffered point arriving late, not a driver returning after an hour. */
  if (open && at - Date.parse(open.lastAt) > STALE_AFTER_MS) {
    await close(driver.id, { reason: 'stale' })
    return start(driver, fix)
  }

  if (!open) return start(driver, fix)

  const updated = {
    ...open,
    /* the shift stretches to cover a late fix at either end, and never shrinks
       to it — a backfilled point must not rewind the clock on a live shift and
       make the next real fix look like a new day */
    startedAt: at < Date.parse(open.startedAt) ? fix.at : open.startedAt,
    lastAt: at > Date.parse(open.lastAt) ? fix.at : open.lastAt,
    points: (open.points ?? 0) + 1,
    /* the top speed of the shift, which is the number a dispute asks about */
    maxSpeed: Math.max(open.maxSpeed ?? 0, fix.speed ?? 0),
  }
  await set(openKey, updated)
  return updated
}

async function start(driver, fix) {
  const shift = {
    id: `${driver.id}-${Date.parse(fix.at)}`,
    driverId: driver.id,
    vehicleId: driver.vehicleId ?? null,
    startedAt: fix.at,
    lastAt: fix.at,
    points: 1,
    maxSpeed: fix.speed ?? 0,
  }
  await set(openKeyFor(driver.id), shift)
  return shift
}

/**
 * Close the open shift and file it.
 *
 * `reason` separates a driver who pressed the button (`ended`) from one whose
 * phone simply stopped talking (`stale`). Both are real shifts; only one of
 * them is a clock-out, and a timesheet that cannot tell them apart invites an
 * argument nobody can settle.
 */
export async function close(driverId, { reason = 'ended' } = {}) {
  const openKey = openKeyFor(driverId)
  const open = await get(openKey)
  if (!open) return null

  const endedAt = reason === 'stale' ? open.lastAt : new Date().toISOString()

  const finished = {
    id: open.id,
    driverId: open.driverId,
    vehicleId: open.vehicleId,
    startedAt: open.startedAt,
    endedAt,
    minutes: minutesBetween(open.startedAt, endedAt),
    points: open.points ?? 0,
    maxSpeed: open.maxSpeed ?? 0,
    reason,
  }

  await unshift(keyFor(driverId), finished, KEEP)
  await del(openKey)
  return finished
}

/**
 * This driver's shifts, newest first, with the one in progress at the top.
 *
 * The open shift is returned alongside the finished ones rather than hidden
 * until it closes — a driver looking at the screen mid-route is looking for
 * today, and today is the one that has not ended yet.
 */
export async function forDriver(driverId) {
  const [finished, open] = await Promise.all([
    list(keyFor(driverId)),
    get(openKeyFor(driverId)),
  ])

  const rows = [...finished]

  if (open) {
    rows.unshift({
      id: open.id,
      driverId: open.driverId,
      vehicleId: open.vehicleId,
      startedAt: open.startedAt,
      endedAt: null,
      minutes: minutesBetween(open.startedAt, new Date().toISOString()),
      points: open.points ?? 0,
      maxSpeed: open.maxSpeed ?? 0,
      reason: 'open',
    })
  }

  return rows
}
