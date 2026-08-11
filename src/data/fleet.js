/**
 * Demo fleet dataset for the Mirsad platform.
 * Everything is generated from a fixed seed so the UI is stable across reloads
 * while still looking like real telemetry. Swap these functions for API calls
 * when wiring a backend — the shapes are what the UI consumes.
 */

const RIYADH = { lat: 24.7136, lng: 46.6753 }

/* ── deterministic PRNG (mulberry32) ─────────────────────────────── */
export function makeRng(seed) {
  let a = seed >>> 0
  return function rng() {
    a += 0x6d2b79f5
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const STATUSES = ['moving', 'idle', 'stopped', 'offline']

export const STATUS_COLOR = {
  moving: '#00c391',
  idle: '#f5b301',
  stopped: '#f4634e',
  offline: '#8898ac',
}

/* ── branches / groups ───────────────────────────────────────────── */
export const groups = [
  { id: 1, nameAr: 'الفرع الرئيسي', nameEn: 'Head Office', cityAr: 'الرياض', cityEn: 'Riyadh', managerAr: 'خالد العتيبي', managerEn: 'Khalid Al-Otaibi' },
  { id: 2, nameAr: 'فرع الشرقية', nameEn: 'Eastern Branch', cityAr: 'الدمام', cityEn: 'Dammam', managerAr: 'سعود الدوسري', managerEn: 'Saud Al-Dosari' },
  { id: 3, nameAr: 'فرع الغربية', nameEn: 'Western Branch', cityAr: 'جدة', cityEn: 'Jeddah', managerAr: 'ماجد الحربي', managerEn: 'Majed Al-Harbi' },
]

/* ── vehicles ────────────────────────────────────────────────────── */
const VEHICLE_SEED = [
  { plate: '2293 SSR', modelAr: 'إيسوزو NPR', modelEn: 'Isuzu NPR', driverAr: 'أحمد المطيري', driverEn: 'Ahmed Al-Mutairi', status: 'moving', group: 1 },
  { plate: '2487 NXA', modelAr: 'تويوتا هايس', modelEn: 'Toyota Hiace', driverAr: 'فهد القحطاني', driverEn: 'Fahad Al-Qahtani', status: 'stopped', group: 1 },
  { plate: '2488 NXA', modelAr: 'تويوتا هايس', modelEn: 'Toyota Hiace', driverAr: 'ناصر الشمري', driverEn: 'Nasser Al-Shammari', status: 'stopped', group: 1 },
  { plate: '6903 EXA', modelAr: 'هيونداي H350', modelEn: 'Hyundai H350', driverAr: 'عبدالله الزهراني', driverEn: 'Abdullah Al-Zahrani', status: 'idle', group: 2 },
  { plate: '4471 KLB', modelAr: 'مرسيدس أكتروس', modelEn: 'Mercedes Actros', driverAr: 'تركي العنزي', driverEn: 'Turki Al-Anazi', status: 'moving', group: 2 },
  { plate: '8825 RTD', modelAr: 'فورد ترانزيت', modelEn: 'Ford Transit', driverAr: 'مشعل الغامدي', driverEn: 'Mishal Al-Ghamdi', status: 'moving', group: 3 },
  { plate: '1176 BHN', modelAr: 'نيسان أورفان', modelEn: 'Nissan Urvan', driverAr: 'يوسف السبيعي', driverEn: 'Yousef Al-Subaie', status: 'idle', group: 3 },
  { plate: '5390 QWZ', modelAr: 'فولفو FH16', modelEn: 'Volvo FH16', driverAr: 'راكان البقمي', driverEn: 'Rakan Al-Baqami', status: 'offline', group: 2 },
]

const ADDRESSES_AR = [
  'طريق الملك فهد، الرياض',
  'طريق العليا العام، الرياض',
  'الدائري الشرقي، الرياض',
  'طريق الخرج، الرياض',
  'شارع التخصصي، الرياض',
  'طريق الملك عبدالله، الرياض',
  'المنطقة الصناعية الثانية، الرياض',
  'طريق الحائر، الرياض',
]
const ADDRESSES_EN = [
  'King Fahd Rd, Riyadh',
  'Olaya Main St, Riyadh',
  'Eastern Ring Rd, Riyadh',
  'Al Kharj Rd, Riyadh',
  'Takhassusi St, Riyadh',
  'King Abdullah Rd, Riyadh',
  '2nd Industrial City, Riyadh',
  'Al Haer Rd, Riyadh',
]

/**
 * Builds a plausible road-like path: a seeded random walk that keeps a heading
 * and only turns gradually, so the polyline reads like a route, not noise.
 */
export function buildRoute(seed, points = 220, origin = RIYADH) {
  const rng = makeRng(seed)
  const path = []
  let lat = origin.lat + (rng() - 0.5) * 0.16
  let lng = origin.lng + (rng() - 0.5) * 0.2
  let heading = rng() * 360
  let speed = 40 + rng() * 30

  for (let i = 0; i < points; i++) {
    // occasional turn, mostly straight
    if (rng() > 0.86) heading += (rng() - 0.5) * 90
    else heading += (rng() - 0.5) * 12
    heading = (heading + 360) % 360

    // speed profile with stops
    const phase = rng()
    if (phase > 0.95) speed = Math.max(0, speed - 25)
    else if (phase > 0.6) speed = Math.min(118, speed + rng() * 12)
    else speed = Math.max(0, speed - rng() * 8)

    const step = (speed / 3600) * 0.009 * 10 // ~10s of travel in degrees
    const rad = (heading * Math.PI) / 180
    lat += Math.cos(rad) * step
    lng += Math.sin(rad) * step * 1.1

    path.push({
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6)),
      speed: Math.round(speed),
      heading: Math.round(heading),
      idx: i,
    })
  }
  return path
}

/**
 * Give a registry row the shape the screens read.
 *
 * The server owns the registry — plate, model, device, branch, odometer — and
 * that is all it owns until a device reports. **Nothing about where a vehicle
 * is, how fast it is going or when it last spoke is invented here.** A vehicle
 * that has not reported is `offline` with no position and no last-seen time,
 * because that is the truth: the platform has never heard from it.
 *
 * This used to hand every vehicle a status off a rotating list and a route to
 * drive around, so a fleet with one live tracker read as eight moving trucks.
 * The dashboard counted those, the pie chart drew them and the driver ranking
 * scored them — every number on the screen was a number nobody could act on.
 *
 * Nothing is filled in any more. The per-period distance summaries the vehicle
 * card shows are totalled from `/api/usage`, and the readings no device
 * reports — fuel, supply voltage — say so on screen rather than carrying a
 * number seeded off an id.
 */
export function hydrateVehicle(row) {
  return {
    /* from the server */
    id: row.id,
    plate: row.plate,
    modelAr: row.modelAr,
    modelEn: row.modelEn,
    driverAr: row.driverAr,
    driverEn: row.driverEn,
    groupId: row.groupId,
    imei: row.imei,
    sim: row.sim,
    simExpiry: row.simExpiry,
    speedLimit: row.speedLimit ?? 120,
    active: row.active !== false,
    odometer: Math.round(row.odometer ?? 0),
    engineHours: Number((row.engineHours ?? 0).toFixed(1)),

    /* not heard from — every one of these is replaced the moment a fix lands */
    status: 'offline',
    lat: null,
    lng: null,
    heading: 0,
    speed: 0,
    ignition: false,
    lastUpdate: null,
    addressAr: null,
    addressEn: null,
    satellites: 0,
    battery: null,
  }
}

/**
 * The offline fallback: the fleet as it was before the registry moved to the
 * server. Rendered only when `GET /api/vehicles` cannot be reached, so a
 * dropped connection shows the last shape of the fleet rather than an empty
 * screen that reads as "you have no vehicles".
 */
export function buildVehicles() {
  return VEHICLE_SEED.map((v, i) =>
    hydrateVehicle(
      {
        id: i + 1,
        plate: v.plate,
        modelAr: v.modelAr,
        modelEn: v.modelEn,
        driverAr: v.driverAr,
        driverEn: v.driverEn,
        groupId: v.group,
        imei: `86${(431290000000 + i * 7919).toString()}`,
        sim: `9665${(30000000 + i * 121317).toString().slice(0, 8)}`,
        simExpiry: new Date(Date.now() + (40 + i * 55) * 864e5).toISOString(),
        odometer: Math.round(38000 + i * 21000),
        engineHours: Math.round(320 + i * 340),
        speedLimit: 120,
        active: true,
      },
      i,
    ),
  )
}

/* ── geofences ───────────────────────────────────────────────────── */
export const initialGeofences = [
  {
    id: 1,
    nameAr: 'المستودع الرئيسي',
    nameEn: 'Main Warehouse',
    type: 'circle',
    color: '#00c391',
    center: { lat: 24.6841, lng: 46.7219 },
    radius: 1800,
  },
  {
    id: 2,
    nameAr: 'منطقة التسليم — العليا',
    nameEn: 'Delivery Zone — Olaya',
    type: 'circle',
    color: '#0ea5e9',
    center: { lat: 24.7521, lng: 46.6628 },
    radius: 2400,
  },
  {
    id: 3,
    nameAr: 'المنطقة الصناعية',
    nameEn: 'Industrial Zone',
    type: 'rectangle',
    color: '#f5b301',
    bounds: [
      { lat: 24.6132, lng: 46.7601 },
      { lat: 24.6688, lng: 46.8345 },
    ],
  },
]

/* ── alert rules + inbox ─────────────────────────────────────────── */
export const initialAlertRules = [
  { id: 1, type: 'speed', threshold: 120, channels: ['web', 'push'], active: true, vehicles: 'all', severity: 'high' },
  { id: 2, type: 'power', threshold: null, channels: ['web', 'mail', 'sms'], active: true, vehicles: 'all', severity: 'high' },
  { id: 3, type: 'geofenceOut', threshold: null, channels: ['web', 'push'], active: true, vehicles: [1, 5, 6], severity: 'medium' },
  { id: 4, type: 'idle', threshold: 20, channels: ['web'], active: false, vehicles: 'all', severity: 'low' },
  { id: 5, type: 'sos', threshold: null, channels: ['web', 'sms', 'push'], active: true, vehicles: 'all', severity: 'high' },
  { id: 6, type: 'maintenance', threshold: 10000, channels: ['mail'], active: true, vehicles: 'all', severity: 'low' },
]

const INBOX_SEED = [
  { type: 'speed', vehicleId: 1, detail: '131 km/h', minutesAgo: 12, severity: 'high' },
  { type: 'geofenceOut', vehicleId: 5, detail: 'Main Warehouse', minutesAgo: 34, severity: 'medium' },
  { type: 'ignitionOn', vehicleId: 6, detail: null, minutesAgo: 58, severity: 'low' },
  { type: 'power', vehicleId: 8, detail: '0.0 V', minutesAgo: 96, severity: 'high' },
  { type: 'idle', vehicleId: 4, detail: '27 min', minutesAgo: 140, severity: 'low' },
  { type: 'geofenceIn', vehicleId: 1, detail: 'Delivery Zone — Olaya', minutesAgo: 175, severity: 'medium' },
  { type: 'speed', vehicleId: 6, detail: '124 km/h', minutesAgo: 220, severity: 'high' },
  { type: 'lowBattery', vehicleId: 3, detail: '3.61 V', minutesAgo: 290, severity: 'medium' },
  { type: 'ignitionOff', vehicleId: 2, detail: null, minutesAgo: 350, severity: 'low' },
  { type: 'maintenance', vehicleId: 7, detail: '10,000 km', minutesAgo: 430, severity: 'low' },
  { type: 'sos', vehicleId: 5, detail: null, minutesAgo: 610, severity: 'high' },
  { type: 'geofenceOut', vehicleId: 4, detail: 'Industrial Zone', minutesAgo: 700, severity: 'medium' },
]

export function buildInbox() {
  return INBOX_SEED.map((a, i) => ({
    id: i + 1,
    ...a,
    at: new Date(Date.now() - a.minutesAgo * 60000).toISOString(),
    read: i > 4,
  }))
}

/* Accounts used to live here. They are real server state now — the driver app
   signs in against them — so they come from `GET /api/users` instead. */

/* ── maintenance ─────────────────────────────────────────────────── */
/** أساس احتساب الاستحقاق: مسافة (كم) · ساعات تشغيل · تاريخ (أيام) */
export const MAINTENANCE_KINDS = ['odometer', 'hours', 'date']
export const MAINTENANCE_TYPES = ['oil', 'tires', 'brakes', 'inspection', 'battery', 'filter']

/**
 * used = نسبة استهلاك الفترة الحالية (1 = بلغ الاستحقاق تمامًا، أكبر من 1 = متأخر).
 * البداية تُحسب رجوعًا من القراءة الحالية للمركبة حتى تبقى الأرقام متسقة.
 */
const MAINTENANCE_SEED = [
  { vehicleId: 1, type: 'oil', kind: 'odometer', period: 10000, used: 1.09, cost: 420, vendorAr: 'ورشة الرياض المركزية', vendorEn: 'Riyadh Central Workshop' },
  { vehicleId: 2, type: 'brakes', kind: 'odometer', period: 30000, used: 1.02, cost: 1250, vendorAr: 'مركز الخدمة السريعة', vendorEn: 'Quick Service Center' },
  { vehicleId: 3, type: 'inspection', kind: 'date', period: 365, used: 0.97, cost: 350, vendorAr: 'الفحص الدوري', vendorEn: 'Periodic Inspection' },
  { vehicleId: 4, type: 'tires', kind: 'odometer', period: 45000, used: 0.88, cost: 2600, vendorAr: 'مركز الإطارات', vendorEn: 'Tire Center' },
  { vehicleId: 5, type: 'oil', kind: 'hours', period: 250, used: 0.91, cost: 420, vendorAr: 'ورشة الدمام', vendorEn: 'Dammam Workshop' },
  { vehicleId: 6, type: 'battery', kind: 'date', period: 730, used: 0.62, cost: 780, vendorAr: 'مركز البطاريات', vendorEn: 'Battery Center' },
  { vehicleId: 7, type: 'filter', kind: 'odometer', period: 15000, used: 0.41, cost: 190, vendorAr: 'ورشة جدة', vendorEn: 'Jeddah Workshop' },
  { vehicleId: 8, type: 'inspection', kind: 'date', period: 365, used: 0.24, cost: 350, vendorAr: 'الفحص الدوري', vendorEn: 'Periodic Inspection' },
  { vehicleId: 2, type: 'oil', kind: 'hours', period: 250, used: 0.55, cost: 420, vendorAr: 'ورشة الرياض المركزية', vendorEn: 'Riyadh Central Workshop' },
  { vehicleId: 4, type: 'filter', kind: 'odometer', period: 15000, used: 0.93, cost: 190, vendorAr: 'مركز الخدمة السريعة', vendorEn: 'Quick Service Center' },
]

/** overdue = تجاوز الاستحقاق · soon = تبقّى أقل من ١٥٪ من الفترة · planned = ضمن الجدول */
export function maintenanceState(used) {
  if (used >= 1) return 'overdue'
  if (used >= 0.85) return 'soon'
  return 'planned'
}

/**
 * يبني سجلات الصيانة اعتمادًا على القراءات الحالية للمركبات.
 * كل سجل يحمل: البداية · الفترة · الاستحقاق · القراءة الحالية · الحالة.
 */
export function buildMaintenance(vehicles = buildVehicles()) {
  const byId = new Map(vehicles.map((v) => [v.id, v]))
  return MAINTENANCE_SEED.map((m, i) => {
    const v = byId.get(m.vehicleId)
    // القراءة الحالية حسب أساس الاحتساب
    const current =
      m.kind === 'odometer' ? Math.round(v?.odometer ?? 0)
      : m.kind === 'hours' ? Math.round(v?.engineHours ?? 0)
      : Math.floor(Date.now() / 864e5) // اليوم بالأيام منذ الحقبة
    const start = Math.round(current - m.period * m.used)
    const nextDue = start + m.period

    return {
      id: 1000 + i + 1,
      vehicleId: m.vehicleId,
      type: m.type,
      kind: m.kind,
      cost: m.cost,
      vendorAr: m.vendorAr,
      vendorEn: m.vendorEn,
      start,
      period: m.period,
      nextDue,
      current,
      used: m.used,
      state: maintenanceState(m.used),
      // بقيّة الفترة — بالكيلومترات أو الساعات أو الأيام حسب النوع
      remaining: nextDue - current,
      startDate: new Date(Date.now() - m.period * m.used * (m.kind === 'date' ? 864e5 : 0) - i * 3 * 864e5).toISOString(),
      dueDate:
        m.kind === 'date'
          ? new Date((nextDue) * 864e5).toISOString()
          : new Date(Date.now() + (1 - m.used) * m.period * (m.kind === 'hours' ? 0.6 : 0.02) * 864e5).toISOString(),
    }
  })
}

/* ── chart datasets ──────────────────────────────────────────────── */
export const weekKeysAr = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
export const weekKeysEn = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function buildWeeklyDistance(vehicleId = 0) {
  const rng = makeRng(77 + vehicleId * 13)
  return weekKeysEn.map((_, i) => ({
    i,
    distance: Math.round(420 + rng() * 680),
    trips: Math.round(18 + rng() * 30),
    engineHours: Math.round(26 + rng() * 34),
  }))
}

/** YYYY-MM-DD from local date parts (avoids the UTC shift of toISOString). */
const isoDate = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const monthKeysAr = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
export const monthKeysEn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Daily distance (km) and engine hours for the last `days` days — oldest first.
 * The series drifts like real telemetry (a slow-moving baseline) instead of
 * jumping randomly: weekends dip, and the odd maintenance/idle day drops to ~0.
 */
export function buildDailyUsage(vehicleId = 0, days = 30) {
  const rng = makeRng(151 + vehicleId * 29)
  const today = new Date()
  let level = 185 + rng() * 70 // خط الأساس المتحرك للمسافة اليومية

  return Array.from({ length: days }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1 - i))
    const weekend = d.getDay() === 5 || d.getDay() === 6

    level += (rng() - 0.5) * 38 // انجراف بطيء يخلي المنحنى مترابط مش مسنن
    level = Math.min(305, Math.max(115, level))

    const idleDay = rng() > 0.94 // يوم صيانة/توقف نادر
    const distance = idleDay
      ? Math.round(rng() * 22)
      : Math.round(level * (weekend ? 0.45 + rng() * 0.15 : 0.92 + rng() * 0.18))

    // ساعات التشغيل = زمن الحركة + وقت تباطؤ/انتظار المحرك
    const engineHours = distance
      ? Math.round((distance / (36 + rng() * 9) + 0.6 + rng() * 0.8) * 10) / 10
      : 0

    return {
      day: d.getDate(),
      month: d.getMonth(),
      date: isoDate(d),
      label: `${d.getDate()}/${d.getMonth() + 1}`,
      distance,
      engineHours,
    }
  })
}

/**
 * Weekly distance (km) and engine hours for the last `weeks` weeks — oldest first.
 * Labelled by the week's start date, same drifting baseline as the daily series.
 */
export function buildWeeklyUsage(vehicleId = 0, weeks = 12) {
  const rng = makeRng(181 + vehicleId * 31)
  const today = new Date()
  let level = 1150 + rng() * 350 // خط الأساس الأسبوعي

  return Array.from({ length: weeks }, (_, i) => {
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (weeks - 1 - i) * 7)

    level += (rng() - 0.48) * 190
    level = Math.min(1850, Math.max(700, level))

    const distance = Math.round(level * (0.94 + rng() * 0.12))
    return {
      week: i + 1,
      date: isoDate(start),
      label: `${start.getDate()}/${start.getMonth() + 1}`,
      distance,
      engineHours: Math.round((distance / (37 + rng() * 7) + 4 + rng() * 3) * 10) / 10,
    }
  })
}

/**
 * Monthly distance (km) and engine hours for the last `months` months — oldest first.
 * Carries a mild summer peak plus a slow trend so the bars read like a real year.
 */
export function buildMonthlyUsage(vehicleId = 0, months = 12) {
  const rng = makeRng(211 + vehicleId * 37)
  const today = new Date()
  let level = 4200 + rng() * 900

  return Array.from({ length: months }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth() - (months - 1 - i), 1)
    const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
    const season = 1 + Math.sin(((d.getMonth() - 2) / 12) * Math.PI * 2) * 0.12 // ذروة خفيفة في الصيف

    level += (rng() - 0.45) * 320
    level = Math.min(6200, Math.max(2600, level))

    const distance = Math.round((level * season * daysInMonth) / 30)
    return {
      month: d.getMonth(),
      year: d.getFullYear(),
      date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      distance,
      engineHours: Math.round(distance / (38 + rng() * 6) + daysInMonth * (0.5 + rng() * 0.3)),
    }
  })
}

export function buildSpeedProfile(vehicleId = 0) {
  const rng = makeRng(91 + vehicleId * 17)
  let level = 52 + rng() * 12 // متوسط متحرك حتى لا تقفز الساعات فجأة
  return Array.from({ length: 24 }, (_, h) => {
    const rush = h >= 7 && h <= 9 ? 0.55 : h >= 15 && h <= 18 ? 0.6 : 1
    const night = h <= 5 || h >= 22 ? 0.35 : 1
    level += (rng() - 0.5) * 14
    level = Math.min(88, Math.max(34, level))
    return {
      hour: `${String(h).padStart(2, '0')}:00`,
      avgSpeed: Math.round(level * rush * night),
      active: Math.round((2 + rng() * 6) * night),
    }
  })
}

/** Per-vehicle history for a given day: track points, trips and stops. */
export function buildHistory(vehicleId, dateStr) {
  const dayHash = [...String(dateStr)].reduce((acc, c) => acc + c.charCodeAt(0), 0)
  const route = buildRoute(vehicleId * 131 + dayHash, 300)
  const start = new Date(`${dateStr}T06:00:00`)
  const points = route.map((p, i) => ({
    ...p,
    at: new Date(start.getTime() + i * 3 * 60000).toISOString(),
  }))

  // segment into trips (speed > 0) and stops (speed === 0 runs)
  const trips = []
  const stops = []
  let cur = null
  points.forEach((p, i) => {
    const isMoving = p.speed > 3
    if (!cur || cur.moving !== isMoving) {
      if (cur) (cur.moving ? trips : stops).push(cur)
      cur = { moving: isMoving, from: i, to: i, startAt: p.at, endAt: p.at, distance: 0, maxSpeed: p.speed }
    } else {
      cur.to = i
      cur.endAt = p.at
      cur.maxSpeed = Math.max(cur.maxSpeed, p.speed)
      cur.distance += (p.speed / 3600) * 3 * 60
    }
  })
  if (cur) (cur.moving ? trips : stops).push(cur)

  const totalDistance = points.reduce((s, p) => s + (p.speed / 3600) * 3, 0)
  const maxSpeed = points.reduce((m, p) => Math.max(m, p.speed), 0)
  const movingPts = points.filter((p) => p.speed > 3)
  const avgSpeed = movingPts.length ? movingPts.reduce((s, p) => s + p.speed, 0) / movingPts.length : 0

  return {
    points,
    trips: trips.filter((t) => t.to - t.from >= 2).slice(0, 12),
    stops: stops.filter((s) => s.to - s.from >= 3).slice(0, 12),
    stats: {
      points: points.length,
      totalDistance: Number(totalDistance.toFixed(1)),
      maxSpeed,
      avgSpeed: Number(avgSpeed.toFixed(1)),
      durationMin: points.length * 3,
    },
  }
}

/** Rows for the reports page, shaped per report type. */
export function buildReportRows(type, vehicles, dateStr) {
  const rng = makeRng([...String(type + dateStr)].reduce((a, c) => a + c.charCodeAt(0), 0))
  const list = vehicles.length ? vehicles : []

  if (type === 'driving') {
    return list.flatMap((v) =>
      Array.from({ length: 3 + Math.floor(rng() * 3) }, (_, k) => {
        const startH = 6 + k * 3 + Math.floor(rng() * 2)
        const dur = 25 + Math.floor(rng() * 90)
        return {
          id: `${v.id}-${k}`,
          vehicleId: v.id,
          plate: v.plate,
          start: `${String(startH).padStart(2, '0')}:${String(Math.floor(rng() * 59)).padStart(2, '0')}`,
          end: `${String(startH + Math.floor(dur / 60)).padStart(2, '0')}:${String(Math.floor(rng() * 59)).padStart(2, '0')}`,
          durationMin: dur,
          distance: Number((dur * (0.4 + rng() * 0.6)).toFixed(1)),
          maxSpeed: Math.round(70 + rng() * 55),
          stops: Math.floor(rng() * 5),
        }
      }),
    )
  }

  if (type === 'speed') {
    return list.flatMap((v) =>
      Array.from({ length: 2 + Math.floor(rng() * 4) }, (_, k) => ({
        id: `${v.id}-s${k}`,
        vehicleId: v.id,
        plate: v.plate,
        at: `${String(7 + Math.floor(rng() * 14)).padStart(2, '0')}:${String(Math.floor(rng() * 59)).padStart(2, '0')}`,
        speed: Math.round(121 + rng() * 42),
        limit: 120,
        durationSec: Math.round(12 + rng() * 180),
        addressAr: ADDRESSES_AR[Math.floor(rng() * ADDRESSES_AR.length)],
        addressEn: ADDRESSES_EN[Math.floor(rng() * ADDRESSES_EN.length)],
      })),
    )
  }

  if (type === 'sfda') {
    return list.flatMap((v) =>
      Array.from({ length: 6 }, (_, k) => {
        const temp = Number((2 + rng() * 8).toFixed(1))
        return {
          id: `${v.id}-t${k}`,
          vehicleId: v.id,
          plate: v.plate,
          at: `${String(6 + k * 3).padStart(2, '0')}:00`,
          temperature: temp,
          humidity: Math.round(38 + rng() * 30),
          compliant: temp >= 2 && temp <= 8,
        }
      }),
    )
  }

  // general
  return list.map((v) => ({
    id: `${v.id}-g`,
    vehicleId: v.id,
    plate: v.plate,
    distance: Number((80 + rng() * 420).toFixed(1)),
    engineHours: Number((2 + rng() * 9).toFixed(1)),
    maxSpeed: Math.round(85 + rng() * 60),
    avgSpeed: Math.round(38 + rng() * 30),
    stops: Math.floor(2 + rng() * 12),
    violations: Math.floor(rng() * 6),
    idleMin: Math.round(10 + rng() * 120),
  }))
}
