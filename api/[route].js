/**
 * Every single-segment API route — `/api/site`, `/api/vehicles`, `/api/track`…
 *
 * The table and the dispatch live in `api/_routes/index.js`; this file exists
 * only to be the function Vercel routes those URLs to. `/api/auth/*` needs its
 * own entry point next door — see that file for why.
 */
export { default } from './_routes/index.js'
