import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { buildVehicles, hydrateVehicle, groups as fallbackGroups } from '../data/fleet'
import { api } from '../lib/api'

const FleetContext = createContext(null)

/**
 * How often the dashboard asks the server for real fixes (ms).
 *
 * Ten seconds, not five. The driver app reports every thirty, so half the polls
 * at the old rate returned a fix the map was already drawing — paid for, and
 * identical to what was on screen. The interval that matters is the reporting
 * one; polling faster than it buys nothing but traffic, and this poll runs for
 * as long as a dashboard stays open.
 */
const POLL_MS = 10000

/** How often the alert inbox is refreshed (ms). Alerts are rarer than fixes. */
const ALERT_POLL_MS = 15000

/**
 * How far a vehicle moves before its address is asked for again (metres).
 *
 * A grid would be simpler, but two points either side of a grid line can be a
 * metre apart and still count as different squares — while two points at
 * opposite corners of one square are 150 m apart and count as the same. Real
 * distance is what the answer actually depends on.
 *
 * Forty metres is short enough that a parked vehicle is named by the building
 * it is at rather than the block, and long enough that GPS jitter on a
 * stationary vehicle does not re-ask on every poll.
 */
const PLACE_REFRESH_M = 40

/** Metres between two fixes. Equirectangular is exact enough at this scale. */
function metresBetween(a, b) {
  const R = 6371000
  const toRad = Math.PI / 180
  const x = (b.lng - a.lng) * toRad * Math.cos(((a.lat + b.lat) / 2) * toRad)
  const y = (b.lat - a.lat) * toRad
  return Math.sqrt(x * x + y * y) * R
}

/** What to show while the lookup is in flight, or when it comes back empty. */
const coordsOf = (fix) => `${fix.lat.toFixed(5)}, ${fix.lng.toFixed(5)}`

/**
 * Everything the dashboard knows about the fleet.
 *
 * All of it is server state now: the registry, the branches, the zones, the
 * rules, the schedule and the inbox are read from `/api` and written back
 * through it, so two people looking at the same screen see the same fleet and
 * a reload changes nothing.
 *
 * Nothing about a vehicle's movement is generated here. Where it is, how fast
 * it is going, when it last spoke and whether it is on the road at all come
 * from `/api/positions` and from nowhere else; a vehicle with no fix is
 * `offline` with no position, which is what "we have not heard from it" looks
 * like when it is stated honestly.
 *
 * Nothing else is seeded either. Readings no device on this fleet reports —
 * fuel, supply voltage — are absent rather than filled in, and the screens that
 * have a place for them say there is no reading yet.
 */
export function FleetProvider({ children }) {
  /* ── server-backed collections ─────────────────────────────────── */
  const [vehicles, setVehicles] = useState([])
  const [groups, setGroups] = useState(fallbackGroups)
  const [geofences, setGeofences] = useState([])
  const [alertRules, setAlertRules] = useState([])
  const [maintenance, setMaintenance] = useState([])
  const [inbox, setInbox] = useState([])
  const [users, setUsers] = useState([])

  const [usersError, setUsersError] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [loading, setLoading] = useState(true)

  const [selectedId, setSelectedId] = useState(null)
  const [live, setLive] = useState(true)

  /* which vehicles are reporting right now — the fleet minus these is offline */
  const [tracked, setTracked] = useState(() => new Set())

  /* the live state of each vehicle, kept across registry reloads so editing a
     plate does not drop the position the map is already drawing */
  const telemetry = useRef(new Map())

  /* the last place name resolved for each tracked vehicle, with the square it
     was resolved in, so the map does not re-ask for a location it already has */
  const places = useRef(new Map())

  /* one geocoding pass at a time: the lookups are rate-limited server-side, and
     a second pass starting on the next poll would only queue behind the first */
  const naming = useRef(false)

  /* ── loading ───────────────────────────────────────────────────── */

  /**
   * Merge a registry row with whatever telemetry we already have for it.
   * A new vehicle is hydrated; an existing one keeps where it is and only
   * takes the fields the operator just edited.
   */
  const applyRegistry = useCallback((rows) => {
    const next = rows.map((row, i) => {
      const known = telemetry.current.get(row.id)
      const merged = known
        ? {
            ...known,
            plate: row.plate,
            modelAr: row.modelAr,
            modelEn: row.modelEn,
            driverAr: row.driverAr,
            driverEn: row.driverEn,
            groupId: row.groupId,
            imei: row.imei,
            sim: row.sim,
            simExpiry: row.simExpiry,
            speedLimit: row.speedLimit ?? 120,
            active: row.active !== false,
            odometer: Math.round(row.odometer ?? 0),
            engineHours: Number((row.engineHours ?? 0).toFixed(1)),
          }
        : hydrateVehicle(row, i)
      telemetry.current.set(row.id, merged)
      return merged
    })

    /* drop telemetry for vehicles that no longer exist */
    const living = new Set(rows.map((r) => r.id))
    for (const id of telemetry.current.keys()) {
      if (!living.has(id)) telemetry.current.delete(id)
    }

    setVehicles(next)
    return next
  }, [])

  const reloadVehicles = useCallback(
    async (signal) => {
      const { vehicles: rows } = await api.getVehicles(signal)
      return applyRegistry(rows)
    },
    [applyRegistry],
  )

  const reloadGroups = useCallback(async (signal) => {
    const { groups: rows } = await api.getGroups(signal)
    setGroups(rows)
    return rows
  }, [])

  const reloadGeofences = useCallback(async (signal) => {
    const { geofences: rows } = await api.getGeofences(signal)
    setGeofences(rows)
    return rows
  }, [])

  const reloadRules = useCallback(async (signal) => {
    const { rules } = await api.getRules(signal)
    setAlertRules(rules)
    return rules
  }, [])

  const reloadMaintenance = useCallback(async (signal) => {
    const { maintenance: rows } = await api.getMaintenance(signal)
    setMaintenance(rows)
    return rows
  }, [])

  const reloadAlerts = useCallback(async (signal) => {
    const { alerts } = await api.getAlerts(signal)
    setInbox(alerts)
    return alerts
  }, [])

  /* accounts: viewers and drivers are not allowed to list them, which is a
     permission, not a failure — the screen simply has nothing to show */
  const reloadUsers = useCallback(async (signal) => {
    try {
      const { users: rows } = await api.getUsers(signal)
      setUsers(rows)
      setUsersError(null)
      return rows
    } catch (err) {
      if (err.name === 'AbortError') return null
      setUsersError(err.status === 403 ? null : err.message)
      setUsers([])
      return null
    }
  }, [])

  /* One load on mount. The registry is the only one the screens cannot render
     without, so a failure there falls back to the demo fleet and says so;
     the rest simply come back empty. */
  useEffect(() => {
    const ctrl = new AbortController()

    ;(async () => {
      try {
        const rows = await reloadVehicles(ctrl.signal)
        setSelectedId((current) => current ?? rows[0]?.id ?? null)
        setLoadError(null)
      } catch (err) {
        if (err.name === 'AbortError') return
        console.warn('[fleet] could not load the registry:', err.message)
        setLoadError(err.message)
        const demo = buildVehicles()
        demo.forEach((v) => telemetry.current.set(v.id, v))
        setVehicles(demo)
        setSelectedId((current) => current ?? demo[0]?.id ?? null)
      } finally {
        setLoading(false)
      }

      /* the rest are independent — one failing must not hide the others */
      await Promise.allSettled([
        reloadGroups(ctrl.signal),
        reloadGeofences(ctrl.signal),
        reloadRules(ctrl.signal),
        reloadMaintenance(ctrl.signal),
        reloadAlerts(ctrl.signal),
        reloadUsers(ctrl.signal),
      ])
    })()

    return () => ctrl.abort()
  }, [reloadVehicles, reloadGroups, reloadGeofences, reloadRules, reloadMaintenance, reloadAlerts, reloadUsers])

  /* ── live positions ────────────────────────────────────────────── */
  useEffect(() => {
    let cancelled = false
    const ctrl = new AbortController()

    /**
     * Give every vehicle that has moved into a new square a street name.
     *
     * One at a time, and one pass at a time: the endpoint serialises its calls
     * to the geocoder to stay inside its usage policy, so a fleet-wide burst
     * would only queue behind itself while the map waited.
     */
    const nameNewPlaces = async (fixes) => {
      if (naming.current) return
      naming.current = true
      try {
        for (const fix of fixes.values()) {
          if (cancelled) return
          const known = places.current.get(fix.vehicleId)
          if (known && metresBetween(known.at, fix) < PLACE_REFRESH_M) continue

          let place = null
          try {
            ;({ place } = await api.getPlace(fix.lat, fix.lng, ctrl.signal))
          } catch (err) {
            if (err.name === 'AbortError') return
            /* the geocoder being down leaves the coordinates showing, which is
               what the card had anyway — nothing to report */
            continue
          }
          /* nowhere anybody has mapped: the coordinates already on screen stay */
          if (!place || cancelled) continue

          const named = {
            /* the point it was resolved at, not the point it is at now — the
               vehicle may have moved on while the lookup was in flight */
            at: { lat: fix.lat, lng: fix.lng },
            ar: place.ar || coordsOf(fix),
            en: place.en || coordsOf(fix),
          }
          places.current.set(fix.vehicleId, named)

          setVehicles((prev) =>
            prev.map((v) => {
              if (v.id !== fix.vehicleId) return v
              const updated = { ...v, addressAr: named.ar, addressEn: named.en }
              telemetry.current.set(v.id, updated)
              return updated
            }),
          )
        }
      } finally {
        naming.current = false
      }
    }

    const poll = async () => {
      try {
        const { positions } = await api.getPositions(ctrl.signal)
        if (cancelled) return

        const fixes = new Map(positions.map((p) => [p.vehicleId, p]))
        setTracked(new Set(fixes.keys()))

        setVehicles((prev) =>
          prev.map((v) => {
            const fix = fixes.get(v.id)

            /* No fix means the platform has not heard from this vehicle — it
               never reported, or its shift ended and the server dropped it off
               the live map. Either way it goes back to knowing nothing about
               it. Leaving the last fix in place is how a vehicle parked since
               yesterday keeps reading as "moving" on a dashboard someone is
               making decisions from. */
            if (!fix) {
              if (v.status === 'offline' && v.lat === null) return v
              const cleared = {
                ...v,
                status: 'offline',
                lat: null,
                lng: null,
                speed: 0,
                heading: 0,
                ignition: false,
                lastUpdate: null,
                addressAr: null,
                addressEn: null,
                satellites: 0,
              }
              telemetry.current.set(v.id, cleared)
              places.current.delete(v.id)
              return cleared
            }

            const named = places.current.get(v.id)
            const stillThere = named && metresBetween(named.at, fix) < PLACE_REFRESH_M
            const merged = {
              ...v,
              lat: fix.lat,
              lng: fix.lng,
              speed: fix.speed,
              heading: fix.heading,
              status: fix.status,
              ignition: fix.status === 'moving' || fix.status === 'idle',
              battery: fix.battery ?? v.battery,
              satellites: fix.accuracy ? Math.max(4, 14 - Math.round(fix.accuracy / 5)) : v.satellites,
              lastUpdate: fix.at,
              /* A vehicle reporting from a real device must never keep the
                 seeded address it was born with — that is how a truck in
                 another country ends up labelled with a Riyadh street. Until
                 the lookup lands, its own coordinates are the honest answer. */
              addressAr: stillThere ? named.ar : coordsOf(fix),
              addressEn: stillThere ? named.en : coordsOf(fix),
            }
            telemetry.current.set(v.id, merged)
            return merged
          }),
        )

        await nameNewPlaces(fixes)
      } catch (err) {
        /* a signed-out or offline dashboard just keeps the last known map */
        if (err.name !== 'AbortError' && err.status !== 401) {
          console.warn('[fleet] position poll failed:', err.message)
        }
      }
    }

    poll()
    const timer = setInterval(poll, POLL_MS)
    return () => {
      cancelled = true
      ctrl.abort()
      clearInterval(timer)
    }
  }, [])

  /* ── the alert inbox and the rules behind it ───────────────────────
     Alerts are raised on the server as fixes arrive, so the dashboard only
     ever reads them. It no longer invents one every 45 seconds to look busy —
     an empty inbox now means nothing has happened.

     The rules are polled alongside them. They used to be read once at mount
     and then only after this tab wrote one, which meant a rule added anywhere
     else — a colleague's screen, or simply a second tab of this dashboard —
     never appeared until the page was reloaded. A rule you cannot see is a
     rule you cannot trust, so the list follows the server like the inbox does.

     A tab that has been in the background does not wait for the next tick:
     coming back to a screen is exactly when its contents are read. */
  useEffect(() => {
    const ctrl = new AbortController()

    const poll = () =>
      Promise.all([reloadAlerts(ctrl.signal), reloadRules(ctrl.signal)]).catch((err) => {
        if (err.name !== 'AbortError' && err.status !== 401) {
          console.warn('[fleet] alert poll failed:', err.message)
        }
      })

    const onVisible = () => document.visibilityState === 'visible' && poll()
    document.addEventListener('visibilitychange', onVisible)

    const timer = setInterval(poll, ALERT_POLL_MS)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      ctrl.abort()
      clearInterval(timer)
    }
  }, [reloadAlerts, reloadRules])

  /* There is no simulation loop any more. A vehicle moves on this map when a
     driver's phone says it moved, and at no other time. */

  /* ── derived ──────────────────────────────────────────────────── */
  const counts = useMemo(() => {
    const c = { all: vehicles.length, moving: 0, idle: 0, stopped: 0, offline: 0 }
    vehicles.forEach((v) => {
      if (c[v.status] != null) c[v.status] += 1
    })
    return c
  }, [vehicles])

  const selected = useMemo(() => vehicles.find((v) => v.id === selectedId) ?? null, [vehicles, selectedId])
  const unreadCount = useMemo(() => inbox.filter((a) => !a.read).length, [inbox])

  /* ── writes ────────────────────────────────────────────────────────
     Every one of these is the same shape: call the server, then reload the
     collection from it. Reloading rather than patching local state is what
     keeps a second operator's edits from being silently overwritten by ours,
     and it is cheap — these are small lists changed by hand. */

  const saveVehicle = useCallback(
    async (id, payload) => {
      const res = id ? await api.updateVehicle(id, payload) : await api.createVehicle(payload)
      await reloadVehicles()
      return res.vehicle
    },
    [reloadVehicles],
  )
  const removeVehicle = useCallback(
    async (id) => {
      await api.deleteVehicle(id)
      await reloadVehicles()
      setSelectedId((current) => (current === id ? null : current))
    },
    [reloadVehicles],
  )

  const saveGroup = useCallback(
    async (id, payload) => {
      const res = id ? await api.updateGroup(id, payload) : await api.createGroup(payload)
      await reloadGroups()
      return res.group
    },
    [reloadGroups],
  )
  const removeGroup = useCallback(
    async (id) => {
      await api.deleteGroup(id)
      await reloadGroups()
    },
    [reloadGroups],
  )

  const addGeofence = useCallback(
    async (g) => {
      const { geofence } = await api.createGeofence(g)
      await reloadGeofences()
      return geofence
    },
    [reloadGeofences],
  )
  const updateGeofence = useCallback(
    async (id, patch) => {
      /* the API takes a whole zone, and the screens send partial edits — merge
         against what we already hold so a toggle does not blank the geometry */
      const current = geofences.find((g) => g.id === id)
      const { geofence } = await api.updateGeofence(id, { ...current, ...patch })
      await reloadGeofences()
      return geofence
    },
    [geofences, reloadGeofences],
  )
  const removeGeofence = useCallback(
    async (id) => {
      await api.deleteGeofence(id)
      await reloadGeofences()
    },
    [reloadGeofences],
  )

  const addRule = useCallback(
    async (r) => {
      const { rule } = await api.createRule(r)
      await reloadRules()
      return rule
    },
    [reloadRules],
  )
  const updateRule = useCallback(
    async (id, patch) => {
      const current = alertRules.find((r) => r.id === id)
      const { rule } = await api.updateRule(id, { ...current, ...patch })
      await reloadRules()
      return rule
    },
    [alertRules, reloadRules],
  )
  const removeRule = useCallback(
    async (id) => {
      await api.deleteRule(id)
      await reloadRules()
    },
    [reloadRules],
  )

  const saveMaintenance = useCallback(
    async (id, payload) => {
      const res = id ? await api.updateMaintenance(id, payload) : await api.createMaintenance(payload)
      await reloadMaintenance()
      return res.record
    },
    [reloadMaintenance],
  )
  const completeMaintenance = useCallback(
    async (id) => {
      await api.completeMaintenance(id)
      await reloadMaintenance()
    },
    [reloadMaintenance],
  )
  const removeMaintenance = useCallback(
    async (id) => {
      await api.deleteMaintenance(id)
      await reloadMaintenance()
    },
    [reloadMaintenance],
  )

  const saveUser = useCallback(
    async (id, payload) => {
      const res = id ? await api.updateUser(id, payload) : await api.createUser(payload)
      await reloadUsers()
      return res.user
    },
    [reloadUsers],
  )
  const deleteUser = useCallback(
    async (id) => {
      await api.deleteUser(id)
      await reloadUsers()
    },
    [reloadUsers],
  )

  /* Reading an alert is optimistic: the row greys out at once and the server
     is told after. Getting it wrong costs an unread badge, not data. */
  const markRead = useCallback((id) => {
    setInbox((prev) => prev.map((a) => (a.id === id ? { ...a, read: true } : a)))
    api.readAlert(id).catch((err) => console.warn('[fleet] could not mark read:', err.message))
  }, [])

  const markAllRead = useCallback(() => {
    setInbox((prev) => prev.map((a) => ({ ...a, read: true })))
    api.readAllAlerts().catch((err) => console.warn('[fleet] could not mark all read:', err.message))
  }, [])

  const dismissAlert = useCallback(
    async (id) => {
      setInbox((prev) => prev.filter((a) => a.id !== id))
      await api.dismissAlert(id)
    },
    [],
  )

  /* Sending one by hand. Not optimistic, unlike marking read: the operator is
     told it reached the driver, so it must actually be on the server before
     the screen says so. */
  const sendAlert = useCallback(
    async (payload) => {
      const { alert } = await api.sendAlert(payload)
      await reloadAlerts()
      return alert
    },
    [reloadAlerts],
  )

  const value = useMemo(
    () => ({
      /* collections */
      vehicles,
      tracked,
      groups,
      users,
      geofences,
      alertRules,
      maintenance,
      inbox,

      /* status */
      loading,
      loadError,
      usersError,

      /* selection and the simulation switch */
      counts,
      selected,
      selectedId,
      setSelectedId,
      live,
      setLive,
      unreadCount,

      /* writes */
      saveVehicle,
      removeVehicle,
      saveGroup,
      removeGroup,
      addGeofence,
      updateGeofence,
      removeGeofence,
      addRule,
      updateRule,
      removeRule,
      saveMaintenance,
      completeMaintenance,
      removeMaintenance,
      saveUser,
      deleteUser,
      markRead,
      markAllRead,
      dismissAlert,
      sendAlert,

      /* refreshes, for screens that need to pull after an out-of-band change */
      reloadVehicles,
      reloadGroups,
      reloadUsers,
      reloadAlerts,
      reloadMaintenance,
    }),
    [
      vehicles, tracked, groups, users, geofences, alertRules, maintenance, inbox,
      loading, loadError, usersError,
      counts, selected, selectedId, live, unreadCount,
      saveVehicle, removeVehicle, saveGroup, removeGroup,
      addGeofence, updateGeofence, removeGeofence,
      addRule, updateRule, removeRule,
      saveMaintenance, completeMaintenance, removeMaintenance,
      saveUser, deleteUser, markRead, markAllRead, dismissAlert, sendAlert,
      reloadVehicles, reloadGroups, reloadUsers, reloadAlerts, reloadMaintenance,
    ],
  )

  return <FleetContext.Provider value={value}>{children}</FleetContext.Provider>
}

export function useFleet() {
  const ctx = useContext(FleetContext)
  if (!ctx) throw new Error('useFleet must be used inside <FleetProvider>')
  return ctx
}
