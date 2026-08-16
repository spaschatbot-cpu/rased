/**
 * Technical support — the driver app's chat with fleet operations.
 *
 *   GET             — a driver reads their own thread; staff read every thread
 *   GET ?driver=    — staff read one driver's thread
 *   POST            — a driver writes `{ text }`; staff reply `{ driver, text }`
 *   PATCH           — clear the caller's own unread counter
 *
 * There is one thread per driver and no way to open a second: support is a
 * conversation with the office, not a ticket queue. Staff never post as a
 * driver — `from` comes from the caller's role, never from the body, so a
 * reply cannot be dressed up as the question it answers.
 */
import { handler, readJson, ok } from '../_lib/http.js'
import { requireUser } from '../_lib/auth.js'
import { badRequest, forbidden, query, text } from '../_lib/collection.js'
import { WRITE_ROLES } from '../_lib/rest.js'
import { allUsers, findById } from '../_lib/users.js'
import { allThreads, append, markRead, thread } from '../_lib/support.js'

/** Longest message we store. Long enough for a paragraph, short of an essay. */
const MAX = 2000

const isStaff = (caller) => WRITE_ROLES.includes(caller.r)

/** The driver whose thread this request is about, with the role gate applied. */
function targetDriver(caller, asked) {
  if (caller.r === 'driver') {
    /* a driver has one thread and it is theirs — asking for another is a 403,
       not a silent redirect to their own */
    if (asked && `${asked}` !== `${caller.i}`) throw forbidden('you may only read your own thread')
    return caller.i
  }
  if (!isStaff(caller)) throw forbidden()
  const id = Number(asked)
  if (!id) throw badRequest('driver is required')
  return id
}

/** A thread plus who it belongs to — the inbox list needs a name, not an id. */
function summarise(row, userById) {
  const driver = userById.get(row.driverId)
  const last = row.messages[row.messages.length - 1] ?? null
  return {
    driverId: row.driverId,
    nameAr: driver?.nameAr ?? `#${row.driverId}`,
    nameEn: driver?.nameEn ?? `#${row.driverId}`,
    username: driver?.username ?? '',
    vehicleId: driver?.vehicleId ?? null,
    active: driver?.active !== false,
    staffUnread: row.staffUnread ?? 0,
    count: row.messages.length,
    updatedAt: row.updatedAt,
    last: last && { from: last.from, text: last.text, at: last.at },
  }
}

export default handler({
  async GET(req, res) {
    const caller = requireUser(req)
    const asked = query(req).get('driver')

    /* the inbox: every thread, summarised. Staff only, and only when no
       particular driver was asked for */
    if (caller.r !== 'driver' && !asked) {
      if (!isStaff(caller)) throw forbidden()
      const rows = await allThreads()
      const userById = new Map((await allUsers()).map((u) => [u.id, u]))
      const threads = rows.map((row) => summarise(row, userById))
      return ok(res, {
        ok: true,
        threads,
        unread: threads.reduce((sum, t) => sum + t.staffUnread, 0),
      })
    }

    const driverId = targetDriver(caller, asked)
    const row = await thread(driverId)
    const driver = caller.r === 'driver' ? null : await findById(driverId)

    return ok(res, {
      ok: true,
      thread: row,
      unread: caller.r === 'driver' ? row.driverUnread : row.staffUnread,
      driver: driver && {
        id: driver.id,
        nameAr: driver.nameAr,
        nameEn: driver.nameEn,
        username: driver.username,
        vehicleId: driver.vehicleId ?? null,
      },
    })
  },

  async POST(req, res) {
    const caller = requireUser(req)
    const body = await readJson(req)

    const driverId = targetDriver(caller, body.driver ?? query(req).get('driver'))
    const message = text(body.text, MAX)
    if (!message) throw badRequest('text is required')

    /* the name on a reply is the account that sent it, read from the store
       rather than the token: a manager renamed yesterday should not sign
       today's message with the name they had when they signed in */
    const author = (await findById(caller.i)) ?? { id: caller.i, nameAr: '', nameEn: '' }

    const { thread: row, message: saved } = await append(driverId, {
      from: caller.r === 'driver' ? 'driver' : 'staff',
      author: { id: author.id, nameAr: author.nameAr, nameEn: author.nameEn },
      text: message,
    })

    return ok(res, { ok: true, message: saved, thread: row })
  },

  async PATCH(req, res) {
    const caller = requireUser(req)
    const driverId = targetDriver(caller, query(req).get('driver'))
    const side = caller.r === 'driver' ? 'driver' : 'staff'
    const row = await markRead(driverId, side)
    return ok(res, { ok: true, thread: row })
  },
})
