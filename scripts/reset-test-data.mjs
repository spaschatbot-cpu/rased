/**
 * Clear what a test run leaves behind, and nothing else.
 *
 * The contract suites drive real journeys: they record trails, open shifts,
 * fire alerts and file support threads. Run against a throwaway store that is
 * fine. Run against the store a dashboard is pointed at — which is a thing that
 * happens, and did — and every report afterwards shows kilometres nobody drove.
 *
 * So this deletes by prefix, from a list, and refuses to guess. The registry
 * and the account table are not test residue and are never touched: wiping
 * `users` re-seeds the accounts, which is a different operation with different
 * consequences, and it belongs in a different script than one anybody is
 * expected to run casually.
 *
 *   node scripts/reset-test-data.mjs           # dry run — lists what would go
 *   node scripts/reset-test-data.mjs --yes     # actually delete
 *
 * Credentials come from `.env.admin` (gitignored), or from the environment.
 * Deliberately NOT from `.env`: that file is what `npm run dev` and the contract
 * suites read, and the whole reason this script exists is that pointing those at
 * a live project fills it with journeys nobody drove. Two files, so the app can
 * never reach the database this script is for.
 *
 *   SUPABASE_URL=https://<project>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=<service_role key>
 */
import { readFileSync } from 'node:fs'

/* real environment wins, so CI can pass them without a file on disk */
try {
  /* strip a UTF-8 BOM: Notepad writes one by default, and it would ride along
     into the first key's name so the value silently never arrives */
  const text = readFileSync(new URL('../.env.admin', import.meta.url), 'utf8').replace(/^﻿/, '')
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 0) continue
    const name = line.slice(0, eq).trim()
    if (!process.env[name]) process.env[name] = line.slice(eq + 1).trim()
  }
} catch {
  /* no file is fine — the guard below reports what is missing */
}

/** Key prefixes a test run creates. Everything else is left alone. */
const RESIDUE_PREFIXES = ['trail:', 'trail-days:', 'shifts:', 'alert-state:', 'geo:', 'support:']

/** Whole keys that a test run fills but does not create. */
const RESIDUE_KEYS = ['alerts', 'messages']

/** Never deleted, whatever else changes. Seed state and live configuration. */
const PROTECTED = ['users', 'vehicles', 'groups', 'geofences', 'alertRules', 'maintenance', 'site', 'heartbeat']

const URL_BASE = (process.env.SUPABASE_URL || '').replace(/\/+$/, '')
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const CONFIRMED = process.argv.includes('--yes')

if (!URL_BASE || !KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not set.')
  console.error('Put them in .env.admin (gitignored), or pass them in the environment.')
  console.error('Not in .env — that one is read by the dev server and the test suites.')
  process.exit(2)
}

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

const isResidue = (key) =>
  RESIDUE_KEYS.includes(key) || RESIDUE_PREFIXES.some((p) => key.startsWith(p))

const res = await fetch(`${URL_BASE}/rest/v1/kv?select=key`, { headers })
if (!res.ok) {
  console.error(`storage: supabase returned ${res.status} — ${(await res.text()).slice(0, 200)}`)
  process.exit(1)
}

const keys = (await res.json()).map((r) => r.key)
const doomed = keys.filter(isResidue)
const kept = keys.filter((k) => !isResidue(k))

/* A protected key matching the residue rules would mean the lists above have
   drifted apart. Stop rather than delete something the caller did not expect. */
const overlap = doomed.filter((k) => PROTECTED.includes(k))
if (overlap.length) {
  console.error(`refusing to run: protected key(s) matched the residue rules — ${overlap.join(', ')}`)
  process.exit(1)
}

console.log(`${keys.length} key(s) in the store\n`)
console.log(`keeping (${kept.length}):`)
for (const k of kept.sort()) console.log(`  ${k}`)
console.log(`\n${CONFIRMED ? 'deleting' : 'would delete'} (${doomed.length}):`)
for (const k of doomed.sort()) console.log(`  ${k}`)

if (!doomed.length) {
  console.log('\nnothing to do.')
  process.exit(0)
}

if (!CONFIRMED) {
  console.log('\ndry run. pass --yes to delete.')
  process.exit(0)
}

let removed = 0
for (const key of doomed) {
  const del = await fetch(`${URL_BASE}/rest/v1/kv?key=eq.${encodeURIComponent(key)}`, {
    method: 'DELETE',
    headers: { ...headers, Prefer: 'return=minimal' },
  })
  if (!del.ok) {
    console.error(`\nfailed on ${key}: ${del.status}`)
    process.exit(1)
  }
  removed += 1
}

console.log(`\n${removed} key(s) deleted.`)
