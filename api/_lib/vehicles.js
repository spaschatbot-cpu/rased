/**
 * The vehicle registry — what the fleet is made of.
 *
 * This is deliberately the *registry*, not the telemetry: plate, model, device,
 * SIM, which branch it belongs to. Where a vehicle is right now lives in
 * positions.js, and what it did earlier lives in history.js, because those
 * change every few seconds while a plate changes once a year.
 *
 * Seeded with the fleet the demo has always shown, so an existing deployment
 * looks the same the first time this runs — only now the rows can be edited and
 * the edits survive a reload.
 */
import { collection, num, text } from './collection.js'

const KEY = 'vehicles'

const SEED = [
  { plate: '2293 SSR', modelAr: 'إيسوزو NPR', modelEn: 'Isuzu NPR', driverAr: 'أحمد المطيري', driverEn: 'Ahmed Al-Mutairi', groupId: 1 },
  { plate: '2487 NXA', modelAr: 'تويوتا هايس', modelEn: 'Toyota Hiace', driverAr: 'فهد القحطاني', driverEn: 'Fahad Al-Qahtani', groupId: 1 },
  { plate: '2488 NXA', modelAr: 'تويوتا هايس', modelEn: 'Toyota Hiace', driverAr: 'ناصر الشمري', driverEn: 'Nasser Al-Shammari', groupId: 1 },
  { plate: '6903 EXA', modelAr: 'هيونداي H350', modelEn: 'Hyundai H350', driverAr: 'عبدالله الزهراني', driverEn: 'Abdullah Al-Zahrani', groupId: 2 },
  { plate: '4471 KLB', modelAr: 'مرسيدس أكتروس', modelEn: 'Mercedes Actros', driverAr: 'تركي العنزي', driverEn: 'Turki Al-Anazi', groupId: 2 },
  { plate: '8825 RTD', modelAr: 'فورد ترانزيت', modelEn: 'Ford Transit', driverAr: 'مشعل الغامدي', driverEn: 'Mishal Al-Ghamdi', groupId: 3 },
  { plate: '1176 BHN', modelAr: 'نيسان أورفان', modelEn: 'Nissan Urvan', driverAr: 'يوسف السبيعي', driverEn: 'Yousef Al-Subaie', groupId: 3 },
  { plate: '5390 QWZ', modelAr: 'فولفو FH16', modelEn: 'Volvo FH16', driverAr: 'راكان البقمي', driverEn: 'Rakan Al-Baqami', groupId: 2 },
]

function seed() {
  const now = new Date().toISOString()
  return SEED.map((v, i) => ({
    id: i + 1,
    plate: v.plate,
    modelAr: v.modelAr,
    modelEn: v.modelEn,
    driverAr: v.driverAr,
    driverEn: v.driverEn,
    groupId: v.groupId,
    imei: `86${(431290000000 + i * 7919).toString()}`,
    sim: `9665${(30000000 + i * 121317).toString().slice(0, 8)}`,
    simExpiry: new Date(Date.now() + (40 + i * 55) * 864e5).toISOString(),
    /* baseline readings — real ones accumulate from the trail as it comes in */
    odometer: Math.round(38000 + i * 21000),
    engineHours: Math.round(320 + i * 340),
    speedLimit: 120,
    active: true,
    createdAt: now,
  }))
}

/** IMEI and plate both identify one physical thing — neither may repeat. */
function validate(body, list, existing) {
  const plate = text(body.plate, 20)
  if (!plate) return 'plate is required'
  if (list.some((v) => v.plate.toLowerCase() === plate.toLowerCase() && v.id !== existing?.id)) {
    return 'plate is already registered'
  }

  const imei = text(body.imei, 20)
  if (imei && !/^\d{10,20}$/.test(imei)) return 'IMEI must be 10 to 20 digits'
  if (imei && list.some((v) => v.imei === imei && v.id !== existing?.id)) {
    return 'IMEI is already registered to another vehicle'
  }

  if (!text(body.modelAr, 120) && !text(body.modelEn, 120)) return 'a model is required'

  const sim = text(body.sim, 20)
  if (sim && !/^\d{6,20}$/.test(sim)) return 'SIM number must be digits'

  if (body.simExpiry && Number.isNaN(Date.parse(body.simExpiry))) return 'invalid SIM expiry date'

  return null
}

function shape(body, existing) {
  return {
    ...existing,
    plate: text(body.plate, 20),
    modelAr: text(body.modelAr, 120) || text(body.modelEn, 120),
    modelEn: text(body.modelEn, 120) || text(body.modelAr, 120),
    driverAr: text(body.driverAr, 120) || text(body.driverEn, 120),
    driverEn: text(body.driverEn, 120) || text(body.driverAr, 120),
    groupId: num(body.groupId, 1, 1e6, existing.groupId ?? 1),
    imei: text(body.imei, 20),
    sim: text(body.sim, 20),
    simExpiry: body.simExpiry ? new Date(body.simExpiry).toISOString() : (existing.simExpiry ?? null),
    odometer: num(body.odometer, 0, 5e6, existing.odometer ?? 0),
    engineHours: num(body.engineHours, 0, 1e6, existing.engineHours ?? 0),
    /* what the speeding rule measures against when it has no rule threshold */
    speedLimit: num(body.speedLimit, 20, 300, existing.speedLimit ?? 120),
    active: body.active !== false,
  }
}

export const vehicles = collection({ key: KEY, seed, validate, shape })

/** Ids of every registered vehicle — what the position poll reads. */
export const vehicleIds = async () => (await vehicles.all()).map((v) => v.id)
