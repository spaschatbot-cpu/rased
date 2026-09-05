/**
 * Teltonika Codec 8 / 8 Extended decoder.
 *
 * The device opens a TCP connection and speaks first:
 *
 *   1. it sends its IMEI   — 2-byte length, then the digits as ASCII
 *   2. the server replies  — 0x01 to accept, 0x00 to hang up
 *   3. it sends AVL data   — one or more records, framed and CRC'd
 *   4. the server replies  — the record count as a 4-byte integer
 *
 * Step 4 is the acknowledgement. Until it arrives the device keeps the records
 * in its own memory and sends them again on the next connection, which is what
 * makes a tunnel through a dead zone come back in order rather than be lost. A
 * server that replies before it has stored the data throws that away, so the
 * ack in server.js is sent after the write and not before.
 *
 * Codec 8 Extended (0x8E) differs from Codec 8 (0x08) only in the IO section:
 * the element counts and IDs are 2 bytes instead of 1, and it adds a variable
 * length group. Everything up to that point is byte-identical, so one parser
 * handles both and branches only where the spec does.
 */

/** Records arrive as (value / 10^7) degrees, signed. */
const DEG = 1e7

export class DecodeError extends Error {}

/** CRC-16/IBM (a.k.a. ARC) over the data field — what the trailing 4 bytes hold. */
export function crc16(buf) {
  let crc = 0
  for (const byte of buf) {
    crc ^= byte
    for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >> 1) ^ 0xa001 : crc >> 1
  }
  return crc
}

/**
 * The opening packet: `[len:2][imei ascii]`.
 * Returns null when fewer bytes have arrived than the length promises.
 */
export function readImei(buf) {
  if (buf.length < 2) return null
  const len = buf.readUInt16BE(0)
  if (len < 8 || len > 20) throw new DecodeError(`implausible IMEI length ${len}`)
  if (buf.length < 2 + len) return null

  const imei = buf.subarray(2, 2 + len).toString('ascii')
  if (!/^\d+$/.test(imei)) throw new DecodeError(`IMEI is not digits: ${JSON.stringify(imei)}`)
  return { imei, rest: buf.subarray(2 + len) }
}

function readIo(buf, at, extended) {
  const io = {}
  const size = extended ? 2 : 1
  const num = (o) => (extended ? buf.readUInt16BE(o) : buf.readUInt8(o))

  io.eventId = num(at)
  at += size
  const total = num(at)
  at += size

  /* four groups of fixed-width values, then — on 8E only — a variable group */
  const elements = {}
  for (const width of [1, 2, 4, 8]) {
    const count = num(at)
    at += size
    for (let i = 0; i < count; i++) {
      const id = num(at)
      at += size
      elements[id] =
        width === 8 ? buf.readBigUInt64BE(at) : buf.readUIntBE(at, width)
      at += width
    }
  }

  if (extended) {
    const count = buf.readUInt16BE(at)
    at += 2
    for (let i = 0; i < count; i++) {
      const id = buf.readUInt16BE(at)
      at += 2
      const len = buf.readUInt16BE(at)
      at += 2
      elements[id] = buf.subarray(at, at + len)
      at += len
    }
  }

  io.elements = elements
  io.total = total
  return { io, at }
}

/**
 * Decode one AVL frame. Returns null if the whole frame has not arrived yet —
 * TCP gives no message boundaries, so a short read is normal, not an error.
 */
export function decodeFrame(buf) {
  if (buf.length < 8) return null

  const preamble = buf.readUInt32BE(0)
  if (preamble !== 0) throw new DecodeError(`expected a zero preamble, got ${preamble}`)

  const dataLength = buf.readUInt32BE(4)
  if (dataLength > 1 << 20) throw new DecodeError(`implausible data length ${dataLength}`)

  const frameEnd = 8 + dataLength + 4
  if (buf.length < frameEnd) return null

  const data = buf.subarray(8, 8 + dataLength)
  const stated = buf.readUInt32BE(8 + dataLength)
  const actual = crc16(data)
  if (stated !== actual) {
    throw new DecodeError(`CRC mismatch: frame says ${stated}, data is ${actual}`)
  }

  const codec = data.readUInt8(0)
  if (codec !== 0x08 && codec !== 0x8e) throw new DecodeError(`unsupported codec 0x${codec.toString(16)}`)
  const extended = codec === 0x8e

  const count = data.readUInt8(1)
  let at = 2
  const records = []

  for (let i = 0; i < count; i++) {
    const timestamp = Number(data.readBigUInt64BE(at))
    at += 8
    const priority = data.readUInt8(at)
    at += 1

    const lng = data.readInt32BE(at) / DEG
    at += 4
    const lat = data.readInt32BE(at) / DEG
    at += 4
    const altitude = data.readInt16BE(at)
    at += 2
    const heading = data.readUInt16BE(at)
    at += 2
    const satellites = data.readUInt8(at)
    at += 1
    const speed = data.readUInt16BE(at)
    at += 2

    const parsed = readIo(data, at, extended)
    at = parsed.at

    records.push({
      at: new Date(timestamp).toISOString(),
      timestamp,
      priority,
      lat,
      lng,
      altitude,
      heading,
      satellites,
      speed,
      io: parsed.io,
    })
  }

  /* the count is repeated at the end; a mismatch means we lost our place */
  const trailing = data.readUInt8(at)
  if (trailing !== count) {
    throw new DecodeError(`record count mismatch: header ${count}, trailer ${trailing}`)
  }

  return { codec, records, rest: buf.subarray(frameEnd) }
}
