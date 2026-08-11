/**
 * Runs the `api/` folder inside the Vite dev server.
 *
 * On Vercel each file under api/ becomes a function automatically. Locally
 * there is no such runtime, so this plugin mounts the very same modules as
 * middleware — same handlers, same request objects, no second process and no
 * `vercel dev` login.
 *
 * Modules are loaded through Vite's SSR runner rather than a bare import, so
 * editing anything a handler depends on — a helper, the translations file —
 * invalidates the whole chain. A plain import would cache the dependencies and
 * quietly serve a stale copy of them.
 */
import path from 'node:path'
import { loadEnv } from 'vite'

const API_DIR = path.resolve(process.cwd(), 'api')

/** `/api/auth/login` → `api/auth/login.js`. Underscored folders stay private. */
function resolveHandler(pathname) {
  const rel = pathname.replace(/^\/api\/?/, '').replace(/\/+$/, '')
  if (!rel || rel.includes('..') || rel.split('/').some((s) => s.startsWith('_'))) return null
  return path.join(API_DIR, `${rel}.js`)
}

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

        const file = resolveHandler(url.pathname)
        if (!file) {
          res.statusCode = 404
          res.setHeader('Content-Type', 'application/json')
          return res.end(JSON.stringify({ ok: false, error: 'not found' }))
        }

        try {
          const mod = await server.ssrLoadModule(`/${path.relative(process.cwd(), file).split(path.sep).join('/')}`)
          await mod.default(req, res)
        } catch (err) {
          if (err?.code === 'ERR_MODULE_NOT_FOUND' || /Failed to load url/.test(err?.message || '')) {
            res.statusCode = 404
            res.setHeader('Content-Type', 'application/json')
            return res.end(JSON.stringify({ ok: false, error: `no route for ${url.pathname}` }))
          }
          server.config.logger.error(`[dev-api] ${url.pathname}\n${err.stack || err}`)
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: false, error: 'internal error' }))
        }
      })
    },
  }
}
