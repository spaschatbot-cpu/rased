/**
 * Decoder checks. Run: node tracker/codec8.test.mjs
 *
 * The two frames below are the worked examples from Teltonika's own protocol
 * documentation, which is the only way to know the parser agrees with the
 * device rather than with my reading of the spec.
 */
import { crc16, decodeFrame, readImei, DecodeError } from './codec8.js'

let pass = 0
let fail = 0
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  ok ? pass++ : fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`)
}
const ok = (label, cond, detail = '') => {
  cond ? pass++ : fail++
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${cond ? '' : `  ${detail}`}`)
}

const hex = (s) => Buffer.from(s.replace(/\s+/g, ''), 'hex')

/* ── the IMEI handshake ──────────────────────────────────────────── */

const imeiFrame = Buffer.concat([
  Buffer.from([0x00, 0x0f]),
  Buffer.from('864454079569400', 'ascii'),
])
check('reads the IMEI of the device we are pairing', readImei(imeiFrame).imei, '864454079569400')
ok('a half-arrived IMEI is not an error, just not ready', readImei(imeiFrame.subarray(0, 6)) === null)

/* ── Codec 8, one record — Teltonika documentation example ───────── */

const CODEC8 = hex('000000000000003608010000016B40D8EA30010000000000000000000000000000000105021503010101425E0F01F10000601A014E0000000000000000010000C7CF')

const one = decodeFrame(CODEC8)
ok('codec 8 frame decodes', one !== null)
check('codec byte', one.codec, 0x08)
check('one record', one.records.length, 1)
/* 0x0000016B40D8EA30, verified against the raw bytes rather than taken from
   the decoder's own output — 2019-06-10T10:04:46Z */
check('timestamp', one.records[0].timestamp, 1560161086000)
check('and as an ISO instant', one.records[0].at, '2019-06-10T10:04:46.000Z')
check('priority', one.records[0].priority, 1)
check('speed', one.records[0].speed, 0)
check('event io id', one.records[0].io.eventId, 1)
check('io elements counted', one.records[0].io.total, 5)
ok('element 21 (GSM signal) = 3', one.records[0].io.elements[21] === 3, String(one.records[0].io.elements[21]))
ok('element 66 (external voltage) = 0x5E0F', one.records[0].io.elements[66] === 0x5e0f, String(one.records[0].io.elements[66]))
ok('nothing left over', one.rest.length === 0, `${one.rest.length} bytes`)

/* ── Codec 8 Extended ─────────────────────────────── */

/**
 * Built here rather than quoted from the documentation, so this is a
 * round-trip and not an independent check of the 8E layout. It earns its place
 * anyway: 8E differs from 8 only in field widths and the extra variable group,
 * and the frame above already pins the shared two thirds against the real
 * specification. What this catches is the width arithmetic.
 */
function buildCodec8E(record) {
  const io = Buffer.concat([
    u16(record.eventId), u16(4),
    u16(1), u16(1), Buffer.from([record.b1]),          // one 1-byte element
    u16(1), u16(2), u16(record.b2),                    // one 2-byte
    u16(1), u16(3), u32(record.b4),                    // one 4-byte
    u16(1), u16(4), u64(record.b8),                    // one 8-byte
    u16(1), u16(5), u16(record.vlen.length), record.vlen, // one variable
  ])
  const body = Buffer.concat([
    u64(record.timestamp), Buffer.from([record.priority]),
    i32(Math.round(record.lng * 1e7)), i32(Math.round(record.lat * 1e7)),
    i16(record.altitude), u16(record.heading),
    Buffer.from([record.satellites]), u16(record.speed),
    io,
  ])
  const data = Buffer.concat([Buffer.from([0x8e, 1]), body, Buffer.from([1])])
  return Buffer.concat([u32(0), u32(data.length), data, u32(crc16(data))])
}

const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16BE(n); return b }
const i16 = (n) => { const b = Buffer.alloc(2); b.writeInt16BE(n); return b }
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b }
const i32 = (n) => { const b = Buffer.alloc(4); b.writeInt32BE(n); return b }
const u64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(n)); return b }

/* Riyadh, so a wrong sign or a swapped lat/lng is visible rather than 0,0 */
const sent = {
  timestamp: 1757000000000, priority: 1,
  lat: 24.7136, lng: 46.6753, altitude: 612, heading: 275, satellites: 11, speed: 84,
  eventId: 240, b1: 1, b2: 0x5e0f, b4: 66775182, b8: 1234567890, vlen: Buffer.from('ok'),
}

const ext = decodeFrame(buildCodec8E(sent))
ok('codec 8E frame decodes', ext !== null)
check('codec byte', ext.codec, 0x8e)
const r = ext.records[0]
check('latitude survives the round trip', r.lat, 24.7136)
check('longitude survives the round trip', r.lng, 46.6753)
check('speed', r.speed, 84)
check('heading', r.heading, 275)
check('satellites', r.satellites, 11)
check('altitude', r.altitude, 612)
check('event id (2 bytes on 8E)', r.io.eventId, 240)
ok('1-byte element', r.io.elements[1] === 1)
ok('2-byte element', r.io.elements[2] === 0x5e0f)
ok('4-byte element', r.io.elements[3] === 66775182)
ok('8-byte element', r.io.elements[4] === 1234567890n, String(r.io.elements[4]))
ok('variable-length element', r.io.elements[5]?.toString() === 'ok')

/* ── the guards ──────────────────────────────────────────────────── */

ok('a truncated frame waits rather than throwing', decodeFrame(CODEC8.subarray(0, 20)) === null)

const corrupt = Buffer.from(CODEC8)
corrupt[corrupt.length - 1] ^= 0xff
let threw = null
try { decodeFrame(corrupt) } catch (e) { threw = e }
ok('a corrupted frame is rejected, not half-parsed', threw instanceof DecodeError, String(threw))

check('crc16 of the documented data field', crc16(CODEC8.subarray(8, CODEC8.length - 4)), 0xc7cf)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
