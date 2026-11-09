/**
 * Operations — saved routes, work orders, and the trips they run as.
 *
 *   route      — a named path drawn once on the map, with its road distance
 *                and driving time, reused by any number of work orders
 *   work order — who drives what, on which route, and when: once, on given
 *                weekdays, or every N days
 *   trip       — one run of a work order on one day. Not stored as a row per
 *                run: a repeating order would need rows minted ahead forever.
 *                Runs are worked out from the schedule when asked for, and
 *                only what happened to one (started, completed, cancelled) is
 *                stored, under `workOrderId:date`.
 */
import { collection, num, text } from './collection.js'
import { get, mutate, set } from './store.js'

export const WORK_ORDER_TYPES = ['fieldSupervision', 'siteSupply', 'distribution', 'expressDelivery', 'transport', 'landTransport']
export const RECURSIONS = ['once', 'weekly', 'interval']
export const TRIP_STATUSES = ['scheduled', 'started', 'completed', 'cancelled']
/** A price is either per trip or per kilometre of the route. */
export const PRICE_MODES = ['trip', 'km']

const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

/* ── routes ─────────────────────────────────────────────────────────── */

const cleanPoint = (p) => {
  const lat = Number(p?.lat)
  const lng = Number(p?.lng)
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    ? { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) }
    : null
}

export const routes = collection({
  key: 'routes',
  validate(body) {
    if (!text(body.name, 120)) return 'a route name is required'
    const points = Array.isArray(body.points) ? body.points.map(cleanPoint).filter(Boolean) : []
    if (points.length < 2) return 'a route needs at least a start and an end point'
    return null
  },
  shape: (body, existing) => ({
    ...existing,
    name: text(body.name, 120),
    groupId: body.groupId ? Number(body.groupId) : null,
    /* the stops the operator clicked, in order — first is the start */
    points: body.points.map(cleanPoint).filter(Boolean).slice(0, 25),
    /* the road between them, as the map drew it; thinned so a long route does
       not weigh more than the rest of the store */
    path: (Array.isArray(body.path) ? body.path : [])
      .map((p) => (Array.isArray(p) ? cleanPoint({ lat: p[0], lng: p[1] }) : cleanPoint(p)))
      .filter(Boolean)
      .filter((_, i, all) => all.length <= 1500 || i % Math.ceil(all.length / 1500) === 0)
      .map((p) => [p.lat, p.lng]),
    distanceKm: num(body.distanceKm, 0, 5000) ?? 0,
    durationMin: Math.round(num(body.durationMin, 0, 10000) ?? 0),
    active: body.active !== false,
  }),
})

/* ── work orders ────────────────────────────────────────────────────── */

function cleanSchedule(s = {}) {
  return {
    startDate: DATE.test(s.startDate) ? s.startDate : '',
    endDate: DATE.test(s.endDate) ? s.endDate : '',
    startTime: TIME.test(s.startTime) ? s.startTime : '',
    endTime: TIME.test(s.endTime) ? s.endTime : '',
    weekdays: Array.isArray(s.weekdays) ? [...new Set(s.weekdays.map(Number).filter((d) => d >= 0 && d <= 6))].sort() : [],
    everyDays: Math.round(num(s.everyDays, 1, 365) ?? 1),
  }
}

export const workOrders = collection({
  key: 'workOrders',
  validate(body) {
    if (!text(body.name, 120)) return 'a work order name is required'
    /* one of the listed types, or one the office typed in itself */
    if (!text(body.type, 60)) return 'a work order type is required'
    if (!RECURSIONS.includes(body.recursion)) return `recursion must be one of ${RECURSIONS.join(', ')}`
    if (!Number(body.groupId)) return 'a branch is required'
    if (!Number(body.vehicleId)) return 'a vehicle is required'
    if (!Number(body.driverId)) return 'a driver is required'
    if (!Number(body.routeId)) return 'a route is required'
    const s = cleanSchedule(body.schedule)
    if (!s.startDate) return 'a start date is required'
    if (!s.startTime || !s.endTime) return 'a start and end time are required'
    if (s.endDate && s.endDate < s.startDate) return 'the end date is before the start date'
    if (body.recursion === 'weekly' && !s.weekdays.length) return 'pick at least one weekday'
    return null
  },
  shape: (body, existing) => ({
    ...existing,
    name: text(body.name, 120),
    type: text(body.type, 60),
    recursion: body.recursion,
    groupId: Number(body.groupId),
    vehicleId: Number(body.vehicleId),
    driverId: Number(body.driverId),
    routeId: Number(body.routeId),
    organization: text(body.organization, 120),
    description: text(body.description, 500),
    schedule: cleanSchedule(body.schedule),
    /* what one trip of this order is charged, in SAR */
    price: Math.round((num(body.price, 0, 10_000_000) ?? 0) * 100) / 100,
    active: body.active !== false,
  }),
})

/* ── pricing ────────────────────────────────────────────────────────── */

const PRICING = 'pricing'

/** The price list: per work-order type, `{ mode: trip|km, amount }`. */
export async function getPricing() {
  const saved = (await get(PRICING)) ?? {}
  return Object.fromEntries(WORK_ORDER_TYPES.map((t) => [t, saved[t] ?? { mode: 'trip', amount: 0 }]))
}

export async function setPricing(body = {}) {
  const next = {}
  for (const t of WORK_ORDER_TYPES) {
    const p = body[t] ?? {}
    next[t] = {
      mode: PRICE_MODES.includes(p.mode) ? p.mode : 'trip',
      amount: Math.round((num(p.amount, 0, 10_000_000) ?? 0) * 100) / 100,
    }
  }
  await set(PRICING, next)
  return next
}

/* ── trips ──────────────────────────────────────────────────────────── */

const TRIP_STATE = 'tripRuns'
/** Longest range one request may list. */
export const MAX_TRIP_DAYS = 62

const dayMs = 864e5
const toUtc = (d) => Date.parse(`${d}T00:00:00Z`)
const fromUtc = (t) => new Date(t).toISOString().slice(0, 10)

/** Every date a work order runs on between `from` and `to`, with its run number. */
export function runsOf(wo, from, to) {
  const s = wo.schedule ?? {}
  if (!s.startDate) return []
  const first = toUtc(s.startDate)
  const last = Math.min(toUtc(to), s.endDate ? toUtc(s.endDate) : Infinity, wo.recursion === 'once' ? first : Infinity)
  const out = []
  let n = 0
  for (let t = first; t <= last; t += dayMs) {
    const runs =
      wo.recursion === 'once' ||
      (wo.recursion === 'weekly' && s.weekdays.includes(new Date(t).getUTCDay())) ||
      (wo.recursion === 'interval' && Math.round((t - first) / dayMs) % (s.everyDays || 1) === 0)
    if (!runs) continue
    n += 1
    if (t >= toUtc(from)) out.push({ date: fromUtc(t), execution: n })
  }
  return out
}

export const tripId = (workOrderId, date) => `${workOrderId}:${date}`

/** The trips between two dates, newest schedule first, with what happened to each. */
export async function tripsBetween(from, to, { driverId = null } = {}) {
  const [orders, state] = await Promise.all([workOrders.all(), get(TRIP_STATE)])
  const done = state ?? {}
  const rows = []
  for (const wo of orders) {
    if (driverId && wo.driverId !== driverId) continue
    for (const run of runsOf(wo, from, to)) {
      const id = tripId(wo.id, run.date)
      const saved = done[id]
      /* an order switched off stops producing new runs, but a run that already
         started or finished stays on record */
      if (!wo.active && !saved) continue
      rows.push({
        id,
        workOrderId: wo.id,
        workOrderName: wo.name,
        type: wo.type,
        execution: run.execution,
        date: run.date,
        plannedStart: `${run.date}T${wo.schedule.startTime}`,
        plannedEnd: `${run.date}T${wo.schedule.endTime}`,
        vehicleId: wo.vehicleId,
        driverId: wo.driverId,
        routeId: wo.routeId,
        groupId: wo.groupId,
        price: wo.price ?? 0,
        status: saved?.status ?? 'scheduled',
        startedAt: saved?.startedAt ?? null,
        completedAt: saved?.completedAt ?? null,
      })
    }
  }
  return rows.sort((a, b) => a.plannedStart.localeCompare(b.plannedStart))
}

/** Move one trip along. `action`: start · complete · cancel · reset. */
export async function setTripState(id, action, by) {
  const now = new Date().toISOString()
  let next = null
  await mutate(TRIP_STATE, (current) => {
    const all = { ...(current ?? {}) }
    const was = all[id] ?? { status: 'scheduled' }
    if (action === 'reset') {
      delete all[id]
      next = { status: 'scheduled' }
      return all
    }
    if (action === 'start' && was.status === 'scheduled') next = { ...was, status: 'started', startedAt: now }
    else if (action === 'complete' && (was.status === 'started' || was.status === 'scheduled'))
      next = { ...was, status: 'completed', startedAt: was.startedAt ?? now, completedAt: now }
    else if (action === 'cancel' && was.status !== 'completed') next = { ...was, status: 'cancelled' }
    else return undefined
    all[id] = { ...next, by, at: now }
    return all
  })
  return next
}
