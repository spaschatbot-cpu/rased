/**
 * How a stretch of trail is measured.
 *
 * Shared by the server, which segments a whole day, and by the replay screen,
 * which re-measures a segment after clipping it to the time window an operator
 * picked. Both must answer "how far did it go between these two fixes" the same
 * way — the replay used to keep a trip's full distance after trimming half of
 * it off, so narrowing the window made the day look longer than it was.
 */

/** Below this a vehicle is parked, not creeping — GPS jitter alone reads 1-3 km/h. */
export const MOVING_KMH = 4

/**
 * Longest gap between two fixes that is still credited as travel, in hours.
 *
 * A phone that lost signal for ten minutes must not book ten minutes of travel
 * it did not make at the speed of its last fix.
 */
const MAX_LEG_HOURS = 0.25

/** Distance in km covered between two consecutive fixes. */
export function legDistance(prev, next) {
  const gapH = Math.max(0, new Date(next.at) - new Date(prev.at)) / 3600000
  return ((prev.speed + next.speed) / 2) * Math.min(gapH, MAX_LEG_HOURS)
}

/**
 * Measure `points[from..to]` as one segment.
 *
 * `from`/`to` are indices into the day's point array and are carried through,
 * because the replay screen draws segments by slicing that same array.
 */
export function measureRun(points, from, to, moving) {
  let distance = 0
  let maxSpeed = 0

  for (let i = from; i <= to; i++) {
    maxSpeed = Math.max(maxSpeed, points[i].speed)
    if (i > from) distance += legDistance(points[i - 1], points[i])
  }

  const startAt = points[from].at
  const endAt = points[to].at

  return {
    moving,
    from,
    to,
    startAt,
    endAt,
    distance: Number(distance.toFixed(2)),
    maxSpeed,
    points: to - from + 1,
    durationMin: Math.round((new Date(endAt) - new Date(startAt)) / 60000),
  }
}
