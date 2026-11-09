/**
 * Every sensor a tracker may carry, in one list.
 *
 * Most vehicles report none of these. A field is present on a fix only when the
 * device actually sent it, and every screen shows only the ones present — so a
 * fuel probe, a cold-chain thermometer or a door switch fitted next month starts
 * appearing on its own, with no change here or anywhere else.
 *
 * `extra` marks a sensor few vehicles have (a second, third or fourth probe):
 * screens list it only once a device reports it.
 *
 * The API uses `min`/`max`/`decimals` to clamp what it stores; the dashboard uses
 * the labels and units to show it. `ignition`, `power`, `battery`, `temperature`,
 * `humidity` and `sos` predate this list and are kept under the same names.
 */
export const SENSORS = [
  { key: 'ignition', kind: 'bool', ar: 'المحرك', en: 'Ignition', on: ['يعمل', 'On'], off: ['متوقف', 'Off'] },
  { key: 'power', kind: 'number', ar: 'فولت الطاقة', en: 'Supply voltage', unit: 'V', min: 0, max: 60, decimals: 1 },
  { key: 'batteryVoltage', kind: 'number', ar: 'فولت بطارية الجهاز', en: 'Device battery', unit: 'V', min: 0, max: 20, decimals: 2 },
  { key: 'fuel', kind: 'number', ar: 'مستوى الوقود', en: 'Fuel level', unit: '%', min: 0, max: 100, decimals: 0 },
  { key: 'fuelLiters', kind: 'number', ar: 'الوقود باللتر', en: 'Fuel', unit: 'L', min: 0, max: 5000, decimals: 1 },
  { key: 'fuelUsed', kind: 'number', ar: 'الوقود المستهلك', en: 'Fuel used', unit: 'L', min: 0, max: 1e7, decimals: 1 },
  { key: 'rpm', kind: 'number', ar: 'دورات المحرك', en: 'Engine RPM', unit: 'rpm', min: 0, max: 20000, decimals: 0 },
  { key: 'coolant', kind: 'number', ar: 'حرارة المحرك', en: 'Coolant temp', unit: '°C', min: -60, max: 200, decimals: 0 },
  { key: 'temperature', kind: 'number', ar: 'الحرارة', en: 'Temperature', unit: '°C', min: -60, max: 100, decimals: 1 },
  { key: 'temperature2', extra: true, kind: 'number', ar: 'الحرارة ٢', en: 'Temperature 2', unit: '°C', min: -60, max: 100, decimals: 1 },
  { key: 'temperature3', extra: true, kind: 'number', ar: 'الحرارة ٣', en: 'Temperature 3', unit: '°C', min: -60, max: 100, decimals: 1 },
  { key: 'temperature4', extra: true, kind: 'number', ar: 'الحرارة ٤', en: 'Temperature 4', unit: '°C', min: -60, max: 100, decimals: 1 },
  { key: 'humidity', kind: 'number', ar: 'الرطوبة', en: 'Humidity', unit: '%', min: 0, max: 100, decimals: 0 },
  { key: 'weight', kind: 'number', ar: 'الحمولة', en: 'Load weight', unit: 'kg', min: 0, max: 200000, decimals: 0 },
  { key: 'gsm', kind: 'number', ar: 'إشارة الشبكة', en: 'GSM signal', unit: '/5', min: 0, max: 5, decimals: 0 },
  { key: 'deviceOdometer', kind: 'number', ar: 'عداد الجهاز', en: 'Device odometer', unit: 'km', min: 0, max: 1e7, decimals: 0 },
  { key: 'door', kind: 'bool', ar: 'الباب', en: 'Door', on: ['مفتوح', 'Open'], off: ['مغلق', 'Closed'] },
  { key: 'tank', kind: 'bool', ar: 'غطاء الخزان', en: 'Tank lid', on: ['مفتوح', 'Open'], off: ['مغلق', 'Closed'] },
  { key: 'mixer', kind: 'bool', ar: 'الخلاطة', en: 'Mixer drum', on: ['تدور', 'Rotating'], off: ['متوقفة', 'Stopped'] },
  { key: 'seatbelt', kind: 'bool', ar: 'حزام الأمان', en: 'Seatbelt', on: ['مربوط', 'Fastened'], off: ['غير مربوط', 'Unfastened'] },
  { key: 'crash', kind: 'bool', ar: 'تصادم', en: 'Crash', on: ['تم رصد تصادم', 'Detected'], off: ['لا', 'No'] },
  { key: 'towing', kind: 'bool', ar: 'سحب المركبة', en: 'Towing', on: ['يتم سحبها', 'Being towed'], off: ['لا', 'No'] },
  { key: 'unplugged', kind: 'bool', ar: 'فصل الجهاز', en: 'Device unplugged', on: ['مفصول', 'Unplugged'], off: ['متصل', 'Connected'] },
  { key: 'harsh', kind: 'enum', ar: 'قيادة عنيفة', en: 'Harsh driving',
    values: { accel: ['تسارع مفاجئ', 'Harsh acceleration'], brake: ['فرملة مفاجئة', 'Harsh braking'], corner: ['انعطاف حاد', 'Harsh cornering'] } },
  { key: 'driverKey', kind: 'text', ar: 'بطاقة السائق', en: 'Driver ID card', max: 32 },
]

export const SENSOR_KEYS = SENSORS.map((s) => s.key)

/** Keep only the sensor fields a fix actually carries. */
export function sensorsOf(fix) {
  const out = {}
  if (!fix) return out
  for (const s of SENSORS) if (fix[s.key] != null) out[s.key] = fix[s.key]
  return out
}

/** Clamp one incoming value to what the sensor can mean; `null` when unusable. */
export function cleanSensor(s, raw) {
  if (raw == null) return null
  if (s.kind === 'bool') return typeof raw === 'boolean' ? raw : null
  if (s.kind === 'enum') return Object.hasOwn(s.values, raw) ? raw : null
  if (s.kind === 'text') {
    const t = String(raw).trim().slice(0, s.max)
    return t || null
  }
  const n = Number(raw)
  if (!Number.isFinite(n) || n < s.min || n > s.max) return null
  return Number(n.toFixed(s.decimals))
}

/** How a reading reads on screen. `lang` is 'ar' or 'en'. */
export function formatSensor(s, value, lang) {
  const i = lang === 'ar' ? 0 : 1
  if (s.kind === 'bool') return value ? s.on[i] : s.off[i]
  if (s.kind === 'enum') return s.values[value]?.[i] ?? String(value)
  if (s.kind === 'text') return String(value)
  return `${value.toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US')} ${s.unit}`
}
