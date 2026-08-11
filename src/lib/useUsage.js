import { useEffect, useState } from 'react'
import { api } from './api'

/** What the charts render before the first response, and after a failed one. */
const EMPTY = {
  daily: [],
  weekly: [],
  monthly: [],
  speedProfile: [],
  since: null,
  retentionDays: 30,
  vehicles: 0,
}

/**
 * Recorded usage for one vehicle, or for the whole fleet when `vehicleId` is
 * null.
 *
 * Every series is totalled from trails the vehicles actually reported, so a
 * chart is flat where nothing was recorded rather than filled in. `since` is
 * the first day with any trail at all — the screens use it to label the flat
 * stretch before it, so an empty chart reads as "not recorded yet" instead of
 * as an outage.
 */
export function useUsage(vehicleId = null) {
  const [usage, setUsage] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const ctrl = new AbortController()
    setLoading(true)

    api
      .getUsage(vehicleId, ctrl.signal)
      .then((data) => {
        setUsage(data)
        setError(null)
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        setUsage(EMPTY)
        setError(err.message)
      })
      .finally(() => setLoading(false))

    return () => ctrl.abort()
  }, [vehicleId])

  return { usage, loading, error }
}
