/**
 * The fleet's clock.
 *
 * Every timestamp the platform stores is UTC, which is the only sane way to
 * store one. But nobody using this system thinks in UTC: a shift that runs from
 * 22:00 to 06:00 is one night's work to the driver and to the manager paying
 * for it, and filing its first half under one date and its second half under
 * another makes the record argue with the people reading it.
 *
 * So a *day* here is a Saudi day. The Kingdom keeps UTC+3 all year and has
 * never observed daylight saving, so the offset is a constant rather than a
 * lookup — which means the server can compute a day boundary with arithmetic
 * and get exactly the answer the browser would.
 *
 * Shared by both sides on purpose. The trail is keyed by day on the server and
 * the replay screen filters by hour in the browser; if the two disagreed about
 * when a day starts, an operator would ask for Sunday and be shown a slice of
 * Saturday.
 */

/** For `Intl` — the browser formats in this zone no matter where the viewer is. */
export const FLEET_TZ = 'Asia/Riyadh'

/** UTC+3, fixed. No daylight saving has ever applied in Saudi Arabia. */
export const FLEET_OFFSET_MS = 3 * 60 * 60 * 1000

/** The same instant, shifted so UTC getters read out local wall-clock values. */
const shifted = (at) => new Date(new Date(at ?? Date.now()).getTime() + FLEET_OFFSET_MS)

/** `YYYY-MM-DD` — which Saudi day this instant falls in. */
export const dayOf = (at) => shifted(at).toISOString().slice(0, 10)

/** `HH:MM` on the Saudi clock. */
export const clockOf = (at) => shifted(at).toISOString().slice(11, 16)

/** Hour of the Saudi day, 0–23. */
export const hourOf = (at) => shifted(at).getUTCHours()

/** Minutes since Saudi midnight, 0–1439. */
export const minutesOf = (at) => {
  const d = shifted(at)
  return d.getUTCHours() * 60 + d.getUTCMinutes()
}

/** `YYYY-MM-DD` for `n` Saudi days before today. */
export const dayBack = (n) => dayOf(Date.now() - n * 86400000)

/**
 * The instant a Saudi day begins, in epoch ms.
 * `2026-08-09` starts at 2026-08-08T21:00:00Z.
 */
export const startOfDay = (day) => Date.parse(`${day}T00:00:00Z`) - FLEET_OFFSET_MS

/** The weekday index (0 = Sunday) of a `YYYY-MM-DD` Saudi day. */
export const weekdayOf = (day) => new Date(`${day}T00:00:00Z`).getUTCDay()

/** The day-of-month and month of a `YYYY-MM-DD` Saudi day. */
export const partsOf = (day) => {
  const d = new Date(`${day}T00:00:00Z`)
  return { date: d.getUTCDate(), month: d.getUTCMonth() }
}
