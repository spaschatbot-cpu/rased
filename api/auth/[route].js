/**
 * The three `/api/auth/*` routes.
 *
 * A second entry point rather than one catch-all, because a single
 * `api/[...path].js` does not in fact catch a nested path here: deployed, it
 * answered `/api/site` and left `/api/auth/login` to Vercel's own 404, which
 * arrives before any of this code runs. One dynamic segment per directory is
 * the shape that actually matches, so `auth/` gets its own.
 *
 * Both entry points hand off to the same dispatch, which keys off the full
 * request URL — so `auth/login` resolves the same way here as `site` does
 * one directory up, and there is still only one route table.
 */
export { default } from '../_routes/index.js'
