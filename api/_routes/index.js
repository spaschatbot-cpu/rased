/**
 * The route table, and the dispatch over it.
 *
 * Vercel turns each file under `api/` into its own function, so the twenty
 * handlers this backend has were twenty functions — past the twelve a Hobby
 * deployment is allowed, which made the free plan unavailable to a project
 * whose code was already small enough for it. Underscored paths are not routed,
 * so the handlers live here and two thin entry points dispatch to them:
 * `api/[route].js` and `api/auth/[route].js`.
 *
 * Two rather than one because a single `api/[...path].js` does not catch a
 * nested path: deployed, it served `/api/site` and left `/api/auth/login` to
 * Vercel's own 404. One dynamic segment per directory is what matches. Both
 * entry points share this dispatch, so there is still only one route table.
 *
 * Nothing about a handler changed: they are the same plain `(req, res)` modules
 * reachable at the same URLs, and each still parses `req.url` itself rather
 * than trusting a framework to hand it parsed query parameters — which is why
 * this indirection costs them nothing.
 *
 * The table lives in this file rather than in the function, so the dev server
 * can dispatch through the very same map. Two tables would drift, and the
 * failure that drift produces is the worst kind: a route that works all the way
 * through local testing and 404s only once deployed.
 *
 * The imports are static on purpose. Vercel traces the dependency graph to
 * decide what to bundle, and a dynamic `import(variable)` is an edge it cannot
 * see — the module would resolve locally and be missing in production.
 */
import alertRules from './alert-rules.js'
import alerts from './alerts.js'
import geocode from './geocode.js'
import geofences from './geofences.js'
import groups from './groups.js'
import health from './health.js'
import history from './history.js'
import maintenance from './maintenance.js'
import messages from './messages.js'
import positions from './positions.js'
import reports from './reports.js'
import shifts from './shifts.js'
import site from './site.js'
import support from './support.js'
import track from './track.js'
import usage from './usage.js'
import users from './users.js'
import vehicles from './vehicles.js'
import login from './auth/login.js'
import logout from './auth/logout.js'
import me from './auth/me.js'

/** Path under `/api/` → handler. The keys are the URLs the clients already use. */
export const ROUTES = {
  'alert-rules': alertRules,
  alerts,
  geocode,
  geofences,
  groups,
  health,
  history,
  maintenance,
  messages,
  positions,
  reports,
  shifts,
  site,
  support,
  track,
  usage,
  users,
  vehicles,
  'auth/login': login,
  'auth/logout': logout,
  'auth/me': me,
}

/** `/api/auth/login?x=1` → `auth/login`. */
export function routeKey(url) {
  /* the pathname only — a query string must not change which handler runs */
  const { pathname } = new URL(url, 'http://localhost')
  return pathname.replace(/^\/api\/?/, '').replace(/\/+$/, '')
}

export function notFound(res, pathname) {
  res.statusCode = 404
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify({ ok: false, error: `no route for ${pathname}` }))
}

export default async function dispatch(req, res) {
  const key = routeKey(req.url)
  const run = ROUTES[key]
  if (!run) return notFound(res, `/api/${key}`)

  /* handlers wrap their own errors via `handler()`/`crud()`, so anything that
     escapes one is a fault in the wrapper itself and belongs in the log */
  return run(req, res)
}
