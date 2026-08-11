/**
 * The alert engine, and the inbox it fills.
 *
 * Runs on the ingest path: every fix that arrives is compared against the
 * previous one for that vehicle, and anything the active rules care about
 * becomes an alert. Doing it here rather than on a timer is what makes an
 * alert mean "this happened", not "this was true when we last looked".
 *
 * Two things keep the inbox readable:
 *   • edge-triggered — a vehicle doing 140 for ten minutes is one speeding
 *     alert, not two hundred. The condition has to go false and true again.
 *   • cooled down — a vehicle hovering on the edge of a threshold cannot
 *     rattle the inbox faster than COOLDOWN_MS per rule.
 */
import { get, mutate } from './store.js'
import { rulesFor } from './rules.js'
import { contains } from './geofences.js'

const INBOX = 'alerts'
const stateKey = (vehicleId) => `alert-state:${vehicleId}`

/** Most recent alerts kept. Older ones fall off the end. */
const INBOX_LIMIT = 500

/** The same condition on the same vehicle cannot re-fire sooner than this. */
const COOLDOWN_MS = 2 * 60 * 1000

/** Below this a vehicle counts as stationary for the idle rule. */
const MOVING_KMH = 4

/* ── the conditions ──────────────────────────────────────────────── */

/**
 * Decide what this fix means, given the one before it.
 *
 * Returns descriptors, not alerts: which condition fired and what to show. The
 * caller matches them against the rules, so the conditions stay testable
 * without a store behind them.
 *
 * @param fix      the fix just recorded
 * @param previous the last recorded fix, or null on the first of a shift
 * @param ctx      `{ vehicle, zones, memory }`
 */
export function evaluate(fix, previous, { vehicle, zones = [], memory = {} }) {
  const events = []

  /* speeding — the rule's threshold when it has one, else the vehicle's own
     posted limit, so a rule can be written once for a mixed fleet */
  events.push({ type: 'speed', value: fix.speed, detail: `${fix.speed} km/h` })

  /* geofences: compare the set of zones we are in now against last time. On
     the first fix of a shift there is nothing to diff, so entering is not
     reported — otherwise every shift start would announce the depot. */
  const insideNow = zones.filter((z) => contains(z, fix)).map((z) => z.id)
  const insideBefore = Array.isArray(memory.zones) ? memory.zones : null

  if (insideBefore) {
    for (const id of insideNow) {
      if (!insideBefore.includes(id)) {
        const zone = zones.find((z) => z.id === id)
        events.push({ type: 'geofenceIn', zoneId: id, detail: zone?.nameAr ?? zone?.nameEn ?? null })
      }
    }
    for (const id of insideBefore) {
      if (!insideNow.includes(id)) {
        const zone = zones.find((z) => z.id === id)
        events.push({ type: 'geofenceOut', zoneId: id, detail: zone?.nameAr ?? zone?.nameEn ?? null })
      }
    }
  }

  /* ignition, inferred from movement — a phone has no ignition line, so the
     transition between parked and rolling is the closest honest signal */
  const movingNow = fix.speed > MOVING_KMH
  if (previous) {
    const movingBefore = previous.speed > MOVING_KMH
    if (movingNow && !movingBefore) events.push({ type: 'ignitionOn', detail: null })
    if (!movingNow && movingBefore) events.push({ type: 'ignitionOff', detail: null })
  }

  /* idling — how long the vehicle has been stationary, tracked in memory since
     a single fix cannot tell you how long anything has been true */
  const stoppedSince = movingNow ? null : (memory.stoppedSince ?? fix.at)
  if (stoppedSince && !movingNow) {
    const minutes = Math.floor((new Date(fix.at) - new Date(stoppedSince)) / 60000)
    if (minutes > 0) events.push({ type: 'idle', value: minutes, detail: `${minutes} min` })
  }

  if (fix.battery != null) {
    events.push({ type: 'lowBattery', value: fix.battery, detail: `${fix.battery}%` })
    /* a tracker reporting nothing left is a power failure, not a warning */
    if (fix.battery === 0) events.push({ type: 'power', detail: '0%' })
  }

  if (fix.sos) events.push({ type: 'sos', detail: null })

  return { events, memory: { zones: insideNow, stoppedSince, at: fix.at } }
}

/**
 * Does a rule fire on this event? Threshold rules compare, the rest are
 * conditions that either happened or did not.
 */
function fires(rule, event, vehicle) {
  if (event.type === 'speed') {
    const limit = rule.threshold ?? vehicle?.speedLimit ?? 120
    return event.value > limit
  }
  if (event.type === 'idle') return event.value >= (rule.threshold ?? 20)
  if (event.type === 'lowBattery') return event.value <= (rule.threshold ?? 20)
  return true
}

/* ── running it ──────────────────────────────────────────────────── */

/**
 * Evaluate one fix and write out whatever fired.
 *
 * Best-effort by design: a rule that throws must not cost the driver their
 * position update, so the caller ignores failures here.
 *
 * @returns the alerts written, newest first
 */
export async function process(fix, previous, { vehicle, zones, rules, driver }) {
  const before = (await get(stateKey(vehicle.id))) ?? {}
  const { events, memory } = evaluate(fix, previous, { vehicle, zones, memory: before })

  /* The clock the cooldown runs on is the fix's, not the server's. A phone
     that buffered six hours offline delivers them in one second of wall time;
     measuring the gap against arrival would collapse a whole shift's worth of
     genuine alerts into the first one. */
  const at = fix.at ?? new Date().toISOString()
  const now = Date.parse(at)
  const fired = []
  /* what was true last time, so a condition still true does not re-fire */
  const active = { ...(before.active ?? {}) }
  const lastAt = { ...(before.lastAt ?? {}) }

  for (const event of events) {
    const matching = rulesFor(rules, event.type, vehicle.id)
    if (!matching.length) continue

    for (const rule of matching) {
      const seat = `${rule.id}`
      const hit = fires(rule, event, vehicle)

      /* geofence crossings are already edges — they describe a change, not a
         state — so they are not held down by the latch */
      const edgeTriggered = !event.type.startsWith('geofence') && event.type !== 'sos'

      if (!hit) {
        if (edgeTriggered) delete active[seat]
        continue
      }
      if (edgeTriggered && active[seat]) continue
      /* `Math.abs` so a fix that arrives out of order cannot open the gate by
         looking like it came from the distant past */
      if (lastAt[seat] && Math.abs(now - lastAt[seat]) < COOLDOWN_MS) continue

      active[seat] = true
      lastAt[seat] = now

      fired.push({
        id: `${vehicle.id}-${rule.id}-${now}-${fired.length}`,
        ruleId: rule.id,
        type: event.type,
        severity: rule.severity ?? 'low',
        channels: rule.channels ?? ['web'],
        vehicleId: vehicle.id,
        plate: vehicle.plate ?? null,
        driverId: driver?.id ?? null,
        driverName: driver?.nameAr ?? null,
        detail: event.detail ?? null,
        zoneId: event.zoneId ?? null,
        lat: fix.lat,
        lng: fix.lng,
        at,
        read: false,
      })
    }
  }

  await mutate(stateKey(vehicle.id), () => ({ ...memory, active, lastAt }))

  if (fired.length) {
    await mutate(INBOX, (current) => {
      const all = Array.isArray(current) ? current : []
      /* the inbox reads newest first, and `fired` is in the order the journey
         happened, so it goes on reversed */
      return [...fired].reverse().concat(all).slice(0, INBOX_LIMIT)
    })
  }
  return fired
}

/** Clear the latch when a shift ends, so tomorrow starts from a clean slate. */
export const resetState = (vehicleId) => mutate(stateKey(vehicleId), () => ({}))

/**
 * The alert types a driver's phone can put a name to.
 *
 * The app carries its own labels, baked in when it was built, and shows the
 * raw key for anything it does not recognise. So a hand-sent alert has to be
 * one of these: an operator must not be able to compose a notice that reaches
 * the driver reading `alert.something`. The note they write rides in `detail`,
 * which the app already prints underneath the title as free text.
 */
export const MANUAL_TYPES = [
  'speed', 'geofenceIn', 'geofenceOut', 'ignitionOn', 'ignitionOff',
  'idle', 'lowBattery', 'power', 'sos', 'maintenance',
]

/**
 * Send one alert by hand to a vehicle's driver.
 *
 * The engine raises alerts from what a vehicle did; this raises one from what
 * a person decided — "come back to the depot", "your service is overdue". It
 * lands in the same inbox and reaches the same phone, and is marked `manual`
 * with the name of whoever sent it, because a driver told to turn around
 * deserves to know that a colleague said so and not a sensor.
 *
 * No cooldown and no latch: those exist to stop a condition that stays true
 * from repeating itself. A person pressing send has already decided.
 */
export async function sendManual({ vehicle, type, severity, detail, author }) {
  const alert = {
    id: `m-${vehicle.id}-${Date.now()}`,
    ruleId: null,
    manual: true,
    type,
    severity,
    channels: ['web', 'push'],
    vehicleId: vehicle.id,
    plate: vehicle.plate ?? null,
    driverId: vehicle.driverId ?? null,
    driverName: vehicle.driverAr ?? null,
    detail: detail || null,
    sentBy: author ? { id: author.id, nameAr: author.nameAr, nameEn: author.nameEn } : null,
    zoneId: null,
    lat: null,
    lng: null,
    at: new Date().toISOString(),
    read: false,
  }

  await mutate(INBOX, (current) => {
    const all = Array.isArray(current) ? current : []
    return [alert, ...all].slice(0, INBOX_LIMIT)
  })

  return alert
}

/* ── the inbox ───────────────────────────────────────────────────────
   Held as one JSON array rather than a Redis list: the dashboard reads the
   whole thing on every poll and flips `read` on individual rows, and a list
   type gives neither of those cheaply. The cap keeps the document small. */

export const inbox = async () => (await get(INBOX)) ?? []

/** Mark one alert read, or every alert when `id` is omitted. */
export async function markRead(id) {
  return mutate(INBOX, (current) =>
    (Array.isArray(current) ? current : []).map((a) =>
      id == null || a.id === id ? { ...a, read: true } : a,
    ),
  )
}

/** Drop one alert, or clear the inbox entirely when `id` is omitted. */
export async function removeAlert(id) {
  let removed = false
  await mutate(INBOX, (current) => {
    const all = Array.isArray(current) ? current : []
    if (id == null) {
      removed = all.length > 0
      return []
    }
    const kept = all.filter((a) => a.id !== id)
    removed = kept.length !== all.length
    return kept
  })
  return removed
}
