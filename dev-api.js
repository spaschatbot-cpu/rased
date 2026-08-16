/**
 * Runs the `api/` folder inside the Vite dev server.
 *
 * On Vercel a single catch-all function dispatches every `/api/` request
 * through `api/_routes/index.js`. Locally there is no such runtime, so this
 * plugin mounts that same module as middleware — same table, same handlers,
 * same request objects, no second process and no `vercel dev` login.
 *
 * Modules are loaded through Vite's SSR runner rather than a bare import, so
 * editing anything a handler depends on — a helper, the translations file —
 * invalidates the whole chain. A plain import would cache the dependencies and
 * quietly serve a stale copy of them.
 */
import { loadEnv } from 'vite'

/* The route table, not the filesystem. In production one catch-all function
   dispatches through this module; resolving paths to files here instead would
   be a second router, and the drift between two routers shows up as a route
   that passes every local test and 404s only once deployed. */
const ROUTER = '/api/_routes/index.js'

export default function devApi() {
  return {
    name: 'mirsad-dev-api',
    apply: 'serve',

    /* Vite only exposes .env to the browser bundle; the handlers read
       process.env, so mirror the file into it here. */
    config(_, { mode }) {
      const env = loadEnv(mode, process.cwd(), '')
      for (const [key, value] of Object.entries(env)) {
        if (process.env[key] === undefined) process.env[key] = value
      }
    },

    configureServer(server) {
      /* The driver app is a separate Flutter build dropped into public/driver.
         Vite's SPA fallback would answer `/driver/` with the React shell, so
         point bare directory requests at that build's own index. */
      server.middlewares.use((req, res, next) => {
        if (req.url === '/driver' || req.url === '/driver/') {
          req.url = '/driver/index.html'
        }
        next()
      })

      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://localhost')
        if (!url.pathname.startsWith('/api')) return next()

        try {
          const mod = await server.ssrLoadModule(ROUTER)
          await mod.default(req, res)
        } catch (err) {
          server.config.logger.error(`[dev-api] ${url.pathname}\n${err.stack || err}`)
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: false, error: 'internal error' }))
        }
      })
    },
  }
}
