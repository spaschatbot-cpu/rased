/**
 * Thin fetch wrapper for the site backend.
 *
 * Same-origin, cookie-based sessions — nothing to store client-side and no
 * token for a script on the page to steal. Every call resolves to the parsed
 * body and throws an `ApiError` on a non-2xx reply, so callers only handle
 * success or catch.
 */

export class ApiError extends Error {
  /** `code` is set only where the caller must branch on *which* refusal it is. */
  constructor(message, status, code = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

async function request(path, { method = 'GET', body, signal } = {}) {
  let res
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch (err) {
    if (err.name === 'AbortError') throw err
    throw new ApiError('network unreachable', 0)
  }

  /* A refusal is allowed to arrive without a JSON body — a proxy or the edge
     can produce a bare 404 or 502 — so a failed parse there is not itself the
     story, and `{}` lets the status below speak. */
  let data = null
  let parsed = true
  try {
    data = await res.json()
  } catch {
    parsed = false
    data = {}
  }

  if (!res.ok) {
    throw new ApiError(data.error || `request failed (${res.status})`, res.status, data.code ?? null)
  }

  /* A 2xx that is not JSON is not a success, whatever the status line claims.
     This backend answers /api/* with JSON or not at all, so an HTML body here
     means something upstream served a page instead — an SPA rewrite that has
     swallowed the route is the usual one, and it returns 200 while doing it.
     Returning `{}` for that made every caller destructure `undefined` out of a
     response that looked fine, and the first `.filter` on it during a render
     took the whole app down to a white screen with a clean network tab. */
  if (!parsed || data === null || typeof data !== 'object') {
    throw new ApiError('the server did not return JSON', res.status)
  }

  return data
}

export const api = {
  /* content */
  getSite: (signal) => request('/site', { signal }),
  saveSite: (site) => request('/site', { method: 'PUT', body: site }),

  /* accounts */
  me: (signal) => request('/auth/me', { signal }),
  /* your own account only — name, email, phone, password. Role, branch and
     page grants are not readable here by design */
  saveMe: (profile) => request('/auth/me', { method: 'PUT', body: profile }),
  login: (username, password) => request('/auth/login', { method: 'POST', body: { username, password } }),
  logout: () => request('/auth/logout', { method: 'POST' }),

  /* accounts */
  getUsers: (signal) => request('/users', { signal }),
  createUser: (user) => request('/users', { method: 'POST', body: user }),
  updateUser: (id, user) => request(`/users?id=${id}`, { method: 'PUT', body: user }),
  deleteUser: (id) => request(`/users?id=${id}`, { method: 'DELETE' }),

  /* live tracking — the dashboard only ever reads; drivers report from the
     mobile app, which speaks to /api/track with its own bearer token */
  getPositions: (signal) => request('/positions', { signal }),

  /* coordinates → a street name, so a live vehicle is labelled by where it
     actually is rather than by the seed row it started life as */
  getPlace: (lat, lng, signal) => request(`/geocode?lat=${lat}&lng=${lng}`, { signal }),

  /* fleet registry */
  getVehicles: (signal) => request('/vehicles', { signal }),
  createVehicle: (v) => request('/vehicles', { method: 'POST', body: v }),
  updateVehicle: (id, v) => request(`/vehicles?id=${id}`, { method: 'PUT', body: v }),
  deleteVehicle: (id) => request(`/vehicles?id=${id}`, { method: 'DELETE' }),

  /* branches and groups */
  getGroups: (signal) => request('/groups', { signal }),
  createGroup: (g) => request('/groups', { method: 'POST', body: g }),
  updateGroup: (id, g) => request(`/groups?id=${id}`, { method: 'PUT', body: g }),
  deleteGroup: (id) => request(`/groups?id=${id}`, { method: 'DELETE' }),

  /* geofences */
  getGeofences: (signal) => request('/geofences', { signal }),
  createGeofence: (g) => request('/geofences', { method: 'POST', body: g }),
  updateGeofence: (id, g) => request(`/geofences?id=${id}`, { method: 'PUT', body: g }),
  deleteGeofence: (id) => request(`/geofences?id=${id}`, { method: 'DELETE' }),

  /* alert rules */
  getRules: (signal) => request('/alert-rules', { signal }),
  createRule: (r) => request('/alert-rules', { method: 'POST', body: r }),
  updateRule: (id, r) => request(`/alert-rules?id=${id}`, { method: 'PUT', body: r }),
  deleteRule: (id) => request(`/alert-rules?id=${id}`, { method: 'DELETE' }),

  /* the alert inbox — written by the server on ingest, never posted by us */
  getAlerts: (signal) => request('/alerts', { signal }),
  /* one sent by hand to a vehicle's driver, rather than raised by the engine */
  sendAlert: (payload) => request('/alerts', { method: 'POST', body: payload }),
  readAlert: (id) => request(`/alerts?id=${encodeURIComponent(id)}`, { method: 'PATCH' }),
  readAllAlerts: () => request('/alerts', { method: 'PATCH' }),
  dismissAlert: (id) => request(`/alerts?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),

  /* service schedule */
  getMaintenance: (signal) => request('/maintenance', { signal }),
  createMaintenance: (m) => request('/maintenance', { method: 'POST', body: m }),
  updateMaintenance: (id, m) => request(`/maintenance?id=${id}`, { method: 'PUT', body: m }),
  completeMaintenance: (id) => request(`/maintenance?id=${id}&action=complete`, { method: 'POST' }),
  deleteMaintenance: (id) => request(`/maintenance?id=${id}`, { method: 'DELETE' }),

  /* the recorded trail, for the replay screen */
  getHistory: (vehicleId, date, signal) =>
    request(`/history?vehicle=${vehicleId}&date=${date}`, { signal }),
  getHistoryDays: (vehicleId, signal) => request(`/history?vehicle=${vehicleId}&days=1`, { signal }),

  /* usage series for the dashboard charts, also from the trail */
  getUsage: (vehicleId, signal) =>
    request(vehicleId ? `/usage?vehicle=${vehicleId}` : '/usage', { signal }),

  /* reports, computed from that trail */
  getReport: ({ type, from, to, vehicles }, signal) => {
    const q = new URLSearchParams({ type, from, to })
    if (vehicles?.length) q.set('vehicles', vehicles.join(','))
    return request(`/reports?${q}`, { signal })
  },

  /* technical support — one thread per driver, written from the driver app */
  getSupportThreads: (signal) => request('/support', { signal }),
  getSupportThread: (driverId, signal) => request(`/support?driver=${driverId}`, { signal }),
  replySupport: (driverId, text) =>
    request('/support', { method: 'POST', body: { driver: driverId, text } }),
  readSupport: (driverId) => request(`/support?driver=${driverId}`, { method: 'PATCH' }),

  /* contact form */
  sendMessage: (payload) => request('/messages', { method: 'POST', body: payload }),
  getMessages: (signal) => request('/messages', { signal }),
  deleteMessage: (id) => request(`/messages?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),
}
