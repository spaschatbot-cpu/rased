/**
 * The TCP listener a Teltonika connects to.
 *
 * This exists because the API cannot be the thing the device talks to. A
 * tracker opens a raw socket and speaks binary; the site runs on a platform
 * that holds no socket open and answers HTTPS. So: this service listens, does
 * the handshake, decodes, and posts JSON to /api/devices — one small process,
 * on a box with a fixed address, which is the one thing the device needs and
 * the site cannot provide.
 *
 *   PORT                  what to listen on (default 5027)
 *   API_BASE              e.g. https://autotracksa.click/api
 *   DEVICE_INGEST_SECRET  must match the value the API has
 *
 * Run: node tracker/server.js
 */
import net from 'node:net'
import { decodeFrame, readImei, DecodeError } from './codec8.js'

const PORT = Number(process.env.PORT || 5027)
const API_BASE = (process.env.API_BASE || '').replace(/\/+$/, '')
const SECRET = process.env.DEVICE_INGEST_SECRET

if (!API_BASE || !SECRET) {
  console.error('API_BASE and DEVICE_INGEST_SECRET must be set.')
  process.exit(2)
}

/* A device that has been out of signal reconnects and empties its memory in one
   go, so a socket may carry far more than one frame. It is also allowed to sit
   idle between fixes for as long as its reporting interval. */
const IDLE_MS = Number(process.env.IDLE_MS || 10 * 60 * 1000)
const MAX_BUFFER = 512 * 1024

const log = (...a) => console.log(new Date().toISOString(), ...a)

function ioFields(el) {
  if (!el) return {}
  const out = {}
  if (el[239] != null) out.ignition = Number(el[239]) === 1
  if (el[66] != null) out.power = Number(el[66]) / 1000
  return out
}

async function post(imei, records) {
  const points = records.map((r) => ({
    lat: r.lat,
    lng: r.lng,
    speed: r.speed,
    heading: r.heading,
    /* the device reports satellites, not an error radius; a fix with none is
       not a fix, and the API's own validation drops the impossible ones */
    accuracy: r.satellites > 0 ? Math.max(5, 50 - r.satellites * 3) : 9999,
    /* Teltonika IO 239 is the ignition line and IO 66 the external supply in
       millivolts. Either is absent when the device is not configured to send it */
    ...ioFields(r.io?.elements),
    at: r.at,
  }))

  const res = await fetch(`${API_BASE}/devices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SECRET}` },
    body: JSON.stringify({ imei, points }),
  })

  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`api ${res.status}: ${body.error || 'no message'}`)
  return body
}

const server = net.createServer((socket) => {
  const peer = `${socket.remoteAddress}:${socket.remotePort}`
  let buffer = Buffer.alloc(0)
  let imei = null

  socket.setTimeout(IDLE_MS)
  log(`open   ${peer}`)

  const bye = (why) => {
    log(`close  ${peer} ${imei ? `(${imei}) ` : ''}${why}`)
    socket.destroy()
  }

  socket.on('data', async (chunk) => {
    buffer = Buffer.concat([buffer, chunk])
    if (buffer.length > MAX_BUFFER) return bye('buffer overrun')

    try {
      /* step 1: the device announces itself and waits to be let in */
      if (!imei) {
        const hello = readImei(buffer)
        if (!hello) return
        imei = hello.imei
        buffer = hello.rest
        log(`imei   ${peer} ${imei}`)
        socket.write(Buffer.from([0x01]))
      }

      /* step 2: frames, possibly several, possibly split across packets */
      while (true) {
        const frame = decodeFrame(buffer)
        if (!frame) break
        buffer = frame.rest

        const usable = frame.records.filter((r) => r.lat !== 0 || r.lng !== 0)
        const dropped = frame.records.length - usable.length

        if (usable.length) {
          /* Acknowledge only after the API has it. The device keeps unacked
             records and sends them again next time, so a crash between here and
             the write costs a duplicate — while acking first would lose the
             journey outright, and nothing downstream would ever know. */
          const result = await post(imei, usable)
          log(`store  ${imei} ${usable.length} fix(es) -> ${result.plate} recorded=${result.recorded} alerts=${result.alerts}`)
        }
        if (dropped) log(`skip   ${imei} ${dropped} record(s) with no satellite fix`)

        socket.write(u32(frame.records.length))
      }
    } catch (err) {
      if (err instanceof DecodeError) return bye(`protocol: ${err.message}`)
      /* an API failure must NOT be acknowledged — staying silent is what makes
         the device try again rather than discard */
      log(`error  ${peer} ${imei ?? ''} ${err.message}`)
      bye('upstream failed, letting the device retry')
    }
  })

  socket.on('timeout', () => bye('idle'))
  socket.on('error', (err) => bye(`socket: ${err.message}`))
  socket.on('end', () => bye('peer closed'))
})

function u32(n) {
  const b = Buffer.alloc(4)
  b.writeUInt32BE(n)
  return b
}

server.listen(PORT, () => log(`listening on ${PORT}, forwarding to ${API_BASE}/devices`))
