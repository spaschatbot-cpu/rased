/**
 * Turning coordinates into a place a person recognises.
 *
 * `24.713600, 46.675300` tells a driver nothing. "طريق العروبة، العليا" tells
 * them they are where they think they are — which is the whole point of showing
 * a location back to the person standing in it.
 *
 * Nominatim (OpenStreetMap) does the lookup: no key, no account. Its usage
 * policy is strict though — one request per second, and no bulk querying — so
 * two things sit in front of it:
 *
 *   • **A cache keyed on rounded coordinates.** Three decimals is about 110
 *     metres. A vehicle crawling through traffic asks about the same square
 *     over and over, and every one of those is a cache hit.
 *   • **A minimum gap between outbound calls.** Requests that arrive inside the
 *     window wait their turn rather than being fired anyway.
 *
 * A failure here is never fatal. The caller falls back to the coordinates,
 * which were always going to be shown anyway.
 */
import { get, set } from './store.js'

const ENDPOINT = 'https://nominatim.openstreetmap.org/reverse'

/** Decimal places the cache key rounds to. 4 ≈ 11 m — a building, not a block. */
const PRECISION = 4

/** Minimum gap between two outbound lookups, per instance. */
const MIN_GAP_MS = 1100

/** How long a cached address is trusted. Streets do get renamed. */
const CACHE_TTL_MS = 90 * 864e5

/* Nominatim asks for a contact address in the agent string so they can reach
   whoever is generating traffic. Falls back to something identifiable. */
const AGENT = `Mirsad-Fleet/1.0 (${process.env.CONTACT_EMAIL || 'ops@mirsad.sa'})`

const keyFor = (lat, lng) => `geo:${lat.toFixed(PRECISION)},${lng.toFixed(PRECISION)}`

let lastCallAt = 0

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Build the short, readable line a driver actually wants.
 *
 * Nominatim's `display_name` is the full postal chain — road, district, city,
 * region, postcode, country — which is useless on a phone. What matters is
 * "which building, which road, which district", so only those are kept.
 *
 * The line is built from the narrowest detail outwards, because that is the
 * order the answer is read in: the landmark you are standing at, the street it
 * is on, then enough context to place it. A road and a city alone describe a
 * kilometre of tarmac; the house number and the named building are what turn it
 * into the spot the driver is actually parked in.
 */
function shorten(address = {}, separator = '، ') {
  /* whatever occupies this exact point — a station, a shop, a warehouse */
  const spot =
    address.amenity || address.shop || address.office || address.building ||
    address.tourism || address.leisure || address.industrial

  const road = address.road || address.pedestrian || address.footway || address.path
  /* the number belongs on the road, not as its own field */
  const street = road && address.house_number ? `${road} ${address.house_number}` : road

  const area = address.neighbourhood || address.quarter || address.suburb || address.city_district
  const city = address.city || address.town || address.village || address.municipality || address.county

  /* a district repeated as the road, or a city repeated as the district, adds
     nothing but length to a line read at a glance */
  const parts = []
  for (const part of [spot, street, area, city]) {
    if (part && !parts.includes(part)) parts.push(part)
  }

  /* Out on a desert highway there is no road, district or town to name — and a
     speeding row that falls back to raw coordinates is exactly the row an
     operator most wants placed. The governorate and the region are coarse, but
     "محافظة رماح، منطقة الرياض" tells them roughly where the truck was; the
     coordinates told them nothing. Only reached when nothing narrower exists,
     so a city result is never widened. */
  if (!parts.length) {
    for (const part of [address.county, address.province, address.state]) {
      if (part && !parts.includes(part)) parts.push(part)
    }
  }

  return parts.slice(0, 4).join(separator) || null
}

/**
 * The place at these coordinates, in `lang`, or `null` when it cannot be found.
 *
 * @returns `{ ar, en, at }` — both languages come from one lookup each, cached
 *          together so switching language costs nothing.
 */
export async function reverse(lat, lng) {
  const key = keyFor(lat, lng)

  const cached = await get(key)
  if (cached && Date.now() - Date.parse(cached.at) < CACHE_TTL_MS) return cached

  /* respect the one-per-second policy rather than being throttled by it */
  const since = Date.now() - lastCallAt
  if (since < MIN_GAP_MS) await wait(MIN_GAP_MS - since)
  lastCallAt = Date.now()

  const ask = async (lang) => {
    const url = `${ENDPOINT}?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=${lang}`
    const res = await fetch(url, { headers: { 'User-Agent': AGENT, Accept: 'application/json' } })
    if (!res.ok) throw new Error(`nominatim returned ${res.status}`)
    return res.json()
  }

  try {
    const ar = await ask('ar')
    /* the English pass is a second call, so it waits out the window too */
    await wait(MIN_GAP_MS)
    lastCallAt = Date.now()
    const en = await ask('en')

    /* each language gets its own list separator — an Arabic comma in an
       English line reads as a typo, and vice versa */
    const place = {
      ar: shorten(ar.address, '، ') ?? shorten(en.address, '، '),
      en: shorten(en.address, ', ') ?? shorten(ar.address, ', '),
      lat,
      lng,
      at: new Date().toISOString(),
    }

    /* nothing usable came back — do not cache an empty answer for 90 days */
    if (!place.ar && !place.en) return null

    await set(key, place)
    return place
  } catch (err) {
    console.warn('[geocode] lookup failed:', err.message)
    /* a stale cached answer beats no answer when the service is down */
    return cached ?? null
  }
}
