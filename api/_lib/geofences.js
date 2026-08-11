/**
 * Geofences — the zones the alert engine tests every incoming fix against.
 *
 * Three shapes, matching the three the map lets an operator draw:
 *   circle    — a centre and a radius in metres
 *   rectangle — two opposite corners
 *   polygon   — three or more corners, for a district no box fits
 *
 * `contains()` is the whole point of this file. It runs on the ingest path for
 * every fix, so it stays plain arithmetic — no projection, no library.
 */
import { collection, num, text } from './collection.js'

const SEED = [
  {
    nameAr: 'المستودع الرئيسي', nameEn: 'Main Warehouse',
    type: 'circle', color: '#00c391',
    center: { lat: 24.6841, lng: 46.7219 }, radius: 1800,
  },
  {
    nameAr: 'منطقة التسليم — العليا', nameEn: 'Delivery Zone — Olaya',
    type: 'circle', color: '#0ea5e9',
    center: { lat: 24.7521, lng: 46.6628 }, radius: 2400,
  },
  {
    nameAr: 'المنطقة الصناعية', nameEn: 'Industrial Zone',
    type: 'rectangle', color: '#f5b301',
    bounds: [{ lat: 24.6132, lng: 46.7601 }, { lat: 24.6688, lng: 46.8345 }],
  },
]

const seed = () => SEED.map((g, i) => ({ id: i + 1, active: true, ...g, createdAt: new Date().toISOString() }))

/** A `{lat, lng}` pair, or null when the input is not one. */
function point(raw) {
  if (!raw || typeof raw !== 'object') return null
  const lat = num(raw.lat, -90, 90)
  const lng = num(raw.lng, -180, 180)
  return lat == null || lng == null ? null : { lat, lng }
}

/** Corners one polygon may have. Well past any district drawn by hand. */
const MAX_POLYGON_POINTS = 200

function validate(body) {
  if (!text(body.nameAr, 120) && !text(body.nameEn, 120)) return 'a zone name is required'

  const type = text(body.type, 20)
  if (!['circle', 'rectangle', 'polygon'].includes(type)) {
    return 'type must be circle, rectangle or polygon'
  }

  if (type === 'circle') {
    if (!point(body.center)) return 'a valid centre point is required'
    if (num(body.radius, 20, 200000) == null) return 'radius must be between 20 and 200000 metres'
    return null
  }

  if (type === 'polygon') {
    const path = Array.isArray(body.path) ? body.path.map(point) : []
    if (path.length < 3 || path.some((p) => !p)) return 'a polygon needs at least three valid corners'
    if (path.length > MAX_POLYGON_POINTS) return `a polygon may have at most ${MAX_POLYGON_POINTS} corners`
    return null
  }

  const bounds = Array.isArray(body.bounds) ? body.bounds.map(point) : []
  if (bounds.length !== 2 || bounds.some((p) => !p)) return 'a rectangle needs two valid corners'
  return null
}

function shape(body, existing) {
  const type = text(body.type, 20)
  const base = {
    ...existing,
    nameAr: text(body.nameAr, 120) || text(body.nameEn, 120),
    nameEn: text(body.nameEn, 120) || text(body.nameAr, 120),
    type,
    color: /^#[0-9a-f]{6}$/i.test(String(body.color)) ? body.color : (existing.color ?? '#00c391'),
    active: body.active !== false,
  }

  /* keep only the geometry this type actually uses — a circle carrying stale
     rectangle corners would make `contains()` depend on write order */
  if (type === 'circle') {
    return { ...base, center: point(body.center), radius: num(body.radius, 20, 200000), bounds: undefined, path: undefined }
  }
  if (type === 'polygon') {
    return { ...base, path: body.path.map(point), center: undefined, radius: undefined, bounds: undefined }
  }
  return { ...base, bounds: body.bounds.map(point), center: undefined, radius: undefined, path: undefined }
}

export const geofences = collection({ key: 'geofences', seed, validate, shape })

/* ── containment ─────────────────────────────────────────────────── */

const EARTH_R = 6371000
const rad = (deg) => (deg * Math.PI) / 180

/**
 * Distance in metres between two points, on the equirectangular approximation.
 * Over the few kilometres a geofence spans the error against the great-circle
 * distance is under a metre — far below GPS accuracy, and much cheaper.
 */
export function distance(a, b) {
  const x = rad(b.lng - a.lng) * Math.cos(rad((a.lat + b.lat) / 2))
  const y = rad(b.lat - a.lat)
  return Math.sqrt(x * x + y * y) * EARTH_R
}

/**
 * Even-odd ray casting: count how many edges a ray from the point crosses.
 * Odd means inside.
 *
 * Latitude and longitude are used as plain x/y. A degree of longitude is
 * shorter than a degree of latitude at Riyadh, but that stretch is the same
 * for the polygon and for the point being tested, and stretching one axis
 * cannot move a point across an edge — so the answer is unaffected.
 */
function insidePath(path, fix) {
  let inside = false
  for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
    const a = path[i]
    const b = path[j]
    const straddles = a.lat > fix.lat !== b.lat > fix.lat
    if (!straddles) continue
    const crossingLng = ((b.lng - a.lng) * (fix.lat - a.lat)) / (b.lat - a.lat) + a.lng
    if (fix.lng < crossingLng) inside = !inside
  }
  return inside
}

/** Is this fix inside this zone? Inactive zones contain nothing. */
export function contains(zone, fix) {
  if (!zone?.active) return false

  if (zone.type === 'circle') {
    if (!zone.center || !zone.radius) return false
    return distance(zone.center, fix) <= zone.radius
  }

  if (zone.type === 'rectangle' && Array.isArray(zone.bounds) && zone.bounds.length === 2) {
    const [a, b] = zone.bounds
    return (
      fix.lat >= Math.min(a.lat, b.lat) && fix.lat <= Math.max(a.lat, b.lat) &&
      fix.lng >= Math.min(a.lng, b.lng) && fix.lng <= Math.max(a.lng, b.lng)
    )
  }

  if (zone.type === 'polygon' && Array.isArray(zone.path) && zone.path.length >= 3) {
    return insidePath(zone.path, fix)
  }

  return false
}

/** Ids of every zone containing this fix — what the in/out comparison diffs. */
export const zonesAt = (list, fix) => list.filter((z) => contains(z, fix)).map((z) => z.id)
