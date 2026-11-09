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

/* What each digital input is wired to differs per installation, so it is set
   per deployment rather than guessed: DIN_ROLES="1=door,2=panic,3=tank".
   Roles: door, panic, tank, mixer, seatbelt. */
const DIN_ROLES = Object.fromEntries(
  String(process.env.DIN_ROLES || '')
    .split(',')
    .map((p) => p.trim().split('='))
    .filter(([n, role]) => /^[1-4]$/.test(n) && role),
)

/* readUIntBE hands back every value unsigned; temperatures go below zero */
const signed = (v, bytes) => {
  const n = Number(v)
  const half = 2 ** (bytes * 8 - 1)
  return n >= half ? n - 2 * half : n
}

/**
 * Teltonika IO element ids (FMB/FMC/FMM family) to the names the API stores —
 * see shared/sensors.js. Anything a device does not send stays absent, and the
 * API and dashboard show only what is present.
 */
function ioFields(el) {
  if (!el) return {}
  const out = {}
  const has = (id) => el[id] != null && !Buffer.isBuffer(el[id])
  const num = (id) => Number(el[id])

  if (has(239)) out.ignition = num(239) === 1
  if (has(66)) out.power = num(66) / 1000
  if (has(67)) out.batteryVoltage = num(67) / 1000
  /* IO 113 is the backup battery level in percent; IO 236 is the alarm
     event, raised by the panic button wired to the unit */
  if (has(113)) out.battery = num(113)
  if (has(236) && num(236) === 1) out.sos = true
  if (has(21)) out.gsm = num(21)
  if (has(16)) out.deviceOdometer = num(16) / 1000

  /* fuel: CAN level %, then OBD level %, then a fuel-level sensor in litres */
  if (has(89)) out.fuel = num(89)
  else if (has(48)) out.fuel = num(48)
  if (has(84)) out.fuelLiters = num(84) / 10
  else if (has(201)) out.fuelLiters = num(201) / 10
  if (has(83)) out.fuelUsed = num(83) / 10
  if (has(85)) out.rpm = num(85)
  else if (has(36)) out.rpm = num(36)
  if (has(32)) out.coolant = signed(el[32], 1)

  /* temperature: wired Dallas probes (0.1 °C, 4 bytes) first, then Bluetooth
     probes (0.01 °C, 2 bytes). Out-of-range codes mean "probe not connected"
     and are dropped by the API's own range check. */
  const tempKeys = ['temperature', 'temperature2', 'temperature3', 'temperature4']
  ;[72, 73, 74, 75].forEach((id, i) => {
    if (has(id)) out[tempKeys[i]] = signed(el[id], 4) / 10
  })
  ;[25, 26, 27, 28].forEach((id, i) => {
    if (out[tempKeys[i]] == null && has(id)) out[tempKeys[i]] = signed(el[id], 2) / 100
  })
  if (has(86)) out.humidity = num(86) / 10

  /* green driving: 1 acceleration, 2 braking, 3 cornering */
  if (has(253)) out.harsh = { 1: 'accel', 2: 'brake', 3: 'corner' }[num(253)]
  if (has(247) && num(247) > 0) out.crash = true
  if (has(246)) out.towing = num(246) === 1
  if (has(252)) out.unplugged = num(252) === 1
  if (has(78) && num(78) !== 0) out.driverKey = BigInt(el[78]).toString(16).toUpperCase()

  for (const [n, role] of Object.entries(DIN_ROLES)) {
    if (!has(n)) continue
    const on = num(n) === 1
    if (role === 'panic') {
      if (on) out.sos = true
    } else out[role] = on
  }
  return out
}

/** Every IO element as plain JSON, so an unmapped sensor is still not lost. */
function rawIo(el) {
  if (!el) return undefined
  const out = {}
  for (const [id, v] of Object.entries(el)) {
    out[id] = Buffer.isBuffer(v) ? v.toString('hex') : typeof v === 'bigint' ? v.toString() : v
  }
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
    /* Teltonika IO elements the API understands — see ioFields. Each is
       absent when the device is not configured to send it */
    ...ioFields(r.io?.elements),
    io: rawIo(r.io?.elements),
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
