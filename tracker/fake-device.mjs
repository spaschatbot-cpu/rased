/**
 * Speaks Codec 8 at the server the way the real unit will.
 *
 * Usage: node tracker/fake-device.mjs <imei> [host] [port]
 *
 * It drives a short journey through Riyadh so the result is checkable by eye on
 * the map, rather than a single point that could be anything.
 */
import net from 'node:net'
import { crc16 } from './codec8.js'

const [imei = '864454079569400', host = '127.0.0.1', port = '5027'] = process.argv.slice(2)

const u8 = (n) => Buffer.from([n])
const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16BE(n); return b }
const i16 = (n) => { const b = Buffer.alloc(2); b.writeInt16BE(n); return b }
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b }
const i32 = (n) => { const b = Buffer.alloc(4); b.writeInt32BE(n); return b }
const u64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(n)); return b }

function avlRecord({ at, lat, lng, speed, heading, satellites = 11 }) {
  const io = Buffer.concat([
    u8(0), u8(1),                 // event id 0, one element in total
    u8(1), u8(239), u8(1),        // 1-byte: ignition on
    u8(0), u8(0), u8(0),          // no 2/4/8-byte elements
  ])
  return Buffer.concat([
    u64(at), u8(1),
    i32(Math.round(lng * 1e7)), i32(Math.round(lat * 1e7)),
    i16(612), u16(heading), u8(satellites), u16(speed),
    io,
  ])
}

function frame(records) {
  const data = Buffer.concat([u8(0x08), u8(records.length), ...records, u8(records.length)])
  return Buffer.concat([u32(0), u32(data.length), data, u32(crc16(data))])
}

/* east along a Riyadh street, ~40 s apart, accelerating then stopping */
const start = Date.now() - 5 * 60 * 1000
const leg = [
  { lat: 24.7136, lng: 46.6753, speed: 0, heading: 90 },
  { lat: 24.7138, lng: 46.6790, speed: 42, heading: 88 },
  { lat: 24.7141, lng: 46.6835, speed: 61, heading: 91 },
  { lat: 24.7143, lng: 46.6880, speed: 58, heading: 93 },
  { lat: 24.7144, lng: 46.6902, speed: 0, heading: 93 },
].map((p, i) => avlRecord({ ...p, at: start + i * 40000 }))

const socket = net.createConnection({ host, port: Number(port) }, () => {
  console.log(`connected to ${host}:${port}`)
  socket.write(Buffer.concat([u16(imei.length), Buffer.from(imei, 'ascii')]))
})

let stage = 'imei'
socket.on('data', (buf) => {
  if (stage === 'imei') {
    if (buf[0] !== 0x01) { console.log('REFUSED by server'); return socket.end() }
    console.log('accepted, sending 5 fixes')
    stage = 'data'
    return socket.write(frame(leg))
  }
  console.log(`server acknowledged ${buf.readUInt32BE(0)} record(s)`)
  socket.end()
})

socket.on('error', (e) => { console.log('socket error:', e.message); process.exit(1) })
socket.on('close', () => process.exit(0))
