/**
 * A heartbeat — and the thing that keeps the database from being switched off.
 *
 * Supabase pauses a free project after a week without activity. For most
 * software that is a reasonable default; for a fleet tracker it is a trap,
 * because the quiet week is exactly the week nobody would notice, and the
 * first thing that fails afterwards is a driver's position failing to land.
 *
 * A cron job in vercel.json calls this once a day. The **read** is what does
 * the work: any request to the database resets the inactivity clock. The write
 * is only so there is a record of when the beat last landed.
 *
 * That write is conditional on purpose. This route is publicly reachable — a
 * cron request carries no credential this backend checks — so an unconditional
 * write would let anyone spend a free tier's monthly budget by holding down
 * refresh. Storing one row per day bounds it no matter who calls, or how often.
 */
import { handler, ok } from '../_lib/http.js'
import { get, set } from '../_lib/store.js'

const KEY = 'heartbeat'

export default handler({
  async GET(_req, res) {
    const today = new Date().toISOString().slice(0, 10)
    const last = await get(KEY)

    let wrote = false
    if (last?.date !== today) {
      await set(KEY, { date: today, at: new Date().toISOString() })
      wrote = true
    }

    /* `since` is the useful number: it says how long the database has gone
       without a beat, which is the only figure that predicts the pause. */
    return ok(res, {
      ok: true,
      date: today,
      wrote,
      lastBeat: last?.at ?? null,
    })
  },
})
