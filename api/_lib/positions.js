/**
 * Live vehicle positions.
 *
 * One key per vehicle (`pos:<id>`), not one document for the fleet. The single
 * document was simpler to read but every reporting vehicle raced every other
 * one for it: two drivers reporting in the same instant meant one of the two
 * updates was silently lost. A vehicle only ever writes its own key now, so
 * there is nothing left to race over.
 *
 * Reads stay one round-trip regardless, because the registry already knows
 * every vehicle id and the store can fetch them together.
 */
import { del, get, mget, set } from './store.js'
import { vehicleIds } from './vehicles.js'

const keyFor = (vehicleId) => `pos:${vehicleId}`

/** A fix older than this means the tracker stopped reporting. */
export const STALE_AFTER_MS = 3 * 60 * 1000

/** The last fix for one vehicle, or null. */
export const positionOf = (vehicleId) => get(keyFor(vehicleId))

/** The last fix for every registered vehicle, keyed by id. Absent ones are omitted. */
export async function allPositions() {
  const ids = await vehicleIds()
  if (!ids.length) return {}

  const fixes = await mget(ids.map(keyFor))
  const out = {}
  ids.forEach((id, i) => {
    if (fixes[i]) out[id] = fixes[i]
  })
  return out
}

/**
 * Reject anything that is not a usable fix. GPS chips emit nonsense while they
 * are still acquiring, and a single bad point teleports a vehicle across the
 * map, so it is cheaper to drop it here than to explain it later.
 */
export function validate(body) {
  const lat = Number(body.lat)
  const lng = Number(body.lng)

  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return { error: 'lat must be between -90 and 90' }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) return { error: 'lng must be between -180 and 180' }

  const num = (v, min, max, fallback = 0) => {
    const n = Number(v)
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
  }

  return {
    fix: {
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6)),
      speed: Math.round(num(body.speed, 0, 300)),
      heading: Math.round(num(body.heading, 0, 360)),
      accuracy: Math.round(num(body.accuracy, 0, 10000)),
      battery: body.battery == null ? null : Math.round(num(body.battery, 0, 100)),
      /* optional sensors — only present when the device actually has one, and
         carried through so the cold-chain report can be built from real data */
      temperature: body.temperature == null ? null : num(body.temperature, -60, 100),
      humidity: body.humidity == null ? null : Math.round(num(body.humidity, 0, 100)),
      sos: body.sos === true,
      /* the device's own clock is not trusted for ordering, only recorded */
      deviceAt: typeof body.at === 'string' ? body.at.slice(0, 40) : null,
    },
  }
}

/**
 * When a fix happened.
 *
 * The device's own clock is preferred, because a phone that buffered an hour of
 * points offline and sent them at once would otherwise have every one of them
 * stamped with the same arrival time — flattening the trail's time axis and
 * making an hour of driving look like a single instant.
 *
 * It is only trusted inside a sane window. A clock set to 2035, or to last
 * year, would reorder the trail or file the day under the wrong date, so
 * anything outside the window falls back to server time.
 */
const CLOCK_SKEW_MS = 5 * 60 * 1000
const MAX_BUFFER_MS = 7 * 864e5

export function timeOf(fix, now = Date.now()) {
  const claimed = fix.deviceAt ? Date.parse(fix.deviceAt) : NaN
  if (!Number.isFinite(claimed)) return new Date(now).toISOString()
  if (claimed > now + CLOCK_SKEW_MS) return new Date(now).toISOString()
  if (claimed < now - MAX_BUFFER_MS) return new Date(now).toISOString()
  return new Date(claimed).toISOString()
}

/**
 * Record a fix for one vehicle. Returns `{ fix, previous }` — the caller needs
 * the point that was replaced to tell a change from a steady state.
 *
 * A fix older than the one already stored updates the trail but not the live
 * position: a late-arriving buffered point must not drag the map backwards.
 */
export async function record(vehicleId, fix, driver) {
  const previous = await positionOf(vehicleId)

  const stored = {
    ...fix,
    vehicleId: Number(vehicleId),
    driverId: driver?.id ?? previous?.driverId ?? null,
    driverName: driver?.nameAr ?? previous?.driverName ?? null,
    at: timeOf(fix),
    receivedAt: new Date().toISOString(),
    source: 'app',
  }

  const isNewer = !previous || Date.parse(stored.at) >= Date.parse(previous.at)
  if (isNewer) await set(keyFor(vehicleId), stored)

  return { fix: stored, previous, live: isNewer }
}

/** Clear one vehicle's fix — the driver ended their shift. */
export async function clear(vehicleId) {
  const existing = await positionOf(vehicleId)
  if (!existing) return false
  await del(keyFor(vehicleId))
  return true
}

/**
 * `moving` / `idle` is derived rather than sent: a phone reports speed, not
 * ignition, and letting the client declare its own status invites drift
 * between what two vehicles mean by the same word.
 */
export function statusOf(fix, now = Date.now()) {
  if (!fix) return 'offline'
  if (now - new Date(fix.at).getTime() > STALE_AFTER_MS) return 'offline'
  if (fix.speed >= 5) return 'moving'
  return fix.speed > 0 ? 'idle' : 'stopped'
}
