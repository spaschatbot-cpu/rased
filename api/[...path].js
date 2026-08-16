/**
 * The one function this backend deploys as.
 *
 * Vercel routes `/api/<anything>` here; the table and the dispatch live in
 * `api/_routes/index.js` so the dev server can share them. See that file for
 * why the twenty handlers became one function.
 */
export { default } from './_routes/index.js'
