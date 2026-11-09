/**
 * Operations — the three Management tabs for planned work:
 *
 *   RoutesSection     — paths drawn once on the map, with road distance and time
 *   WorkOrdersSection — who drives what, on which route, when (once / weekly /
 *                       every N days), entered in three steps like Rased's form
 *   TripsSection      — the runs those orders produce, with their status
 *
 * Each section reads its own data from the API: none of it is needed anywhere
 * else in the dashboard, so it does not belong in the fleet context.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Marker, Polyline, useMapEvents } from 'react-leaflet'
import { Route as RouteIcon, ClipboardList, CalendarClock, Plus, Pencil, Trash2, Undo2, Ban, Check, Tag } from 'lucide-react'
import { useLang } from '../../context/LanguageContext'
import { useFleet } from '../../context/FleetContext'
import { Card, CardHeader, Table, Td, Badge, Button, Input, Modal, Field, Select, Segmented, cn } from '../../components/ui'
import FleetMap, { pointIcon } from '../../components/map/FleetMap'
import { api } from '../../lib/api'
import { apiErrorText } from '../../lib/apiErrors'
import { dayBack } from '../../../shared/clock'

export const WO_TYPES = ['fieldSupervision', 'siteSupply', 'distribution', 'expressDelivery', 'transport', 'landTransport']
const L = {
  type: {
    fieldSupervision: ['إشراف ميداني', 'Field supervision'],
    siteSupply: ['تموين مواقع', 'Site supply'],
    distribution: ['توزيع', 'Distribution'],
    expressDelivery: ['توصيل سريع', 'Express delivery'],
    transport: ['نقل', 'Transport'],
    landTransport: ['نقل بري', 'Land transport'],
  },
  recursion: { once: ['مرة واحدة', 'One time'], weekly: ['أسبوعي', 'Weekly'], interval: ['تكرار ثابت', 'Constant frequency'] },
  trip: { scheduled: ['مجدولة', 'Scheduled'], started: ['جارية', 'In progress'], completed: ['مكتملة', 'Completed'], cancelled: ['ملغاة', 'Cancelled'] },
}
const TRIP_TONE = { scheduled: 'sky', started: 'amber', completed: 'brand', cancelled: 'slate' }
const WEEKDAYS = [
  [0, 'الأحد', 'Sun'], [1, 'الاثنين', 'Mon'], [2, 'الثلاثاء', 'Tue'], [3, 'الأربعاء', 'Wed'],
  [4, 'الخميس', 'Thu'], [5, 'الجمعة', 'Fri'], [6, 'السبت', 'Sat'],
]
const lbl = (group, key, lang) => L[group][key]?.[lang === 'ar' ? 0 : 1] ?? key

const TABLE_CARD = 'lg:flex lg:min-h-0 lg:flex-1 lg:flex-col'
const TABLE_SCROLL = 'lg:min-h-0 lg:flex-1 lg:overflow-y-auto'

const Plate = ({ plate }) =>
  plate ? (
    <bdi dir="ltr" className="inline-flex rounded-md border border-[var(--s-border)] bg-[var(--s-panel-2)] px-2 py-0.5 text-[12px] font-extrabold tabular-nums">
      {plate}
    </bdi>
  ) : (
    <span className="text-muted">—</span>
  )

function RowButtons({ onEdit, onDelete }) {
  const { t } = useLang()
  return (
    <span className="inline-flex gap-1">
      {onEdit && (
        <button type="button" title={t('common.edit')} onClick={onEdit} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-[var(--s-panel-2)] hover:text-[var(--s-text)]">
          <Pencil size={15} />
        </button>
      )}
      {onDelete && (
        <button type="button" title={t('common.delete')} onClick={onDelete} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-[#f4634e]/12 hover:text-[#e04b34]">
          <Trash2 size={15} />
        </button>
      )}
    </span>
  )
}

/** One list from the API, reloaded on demand. */
function useList(load, key) {
  const [rows, setRows] = useState([])
  const [error, setError] = useState(null)
  const reload = useCallback(async () => {
    try {
      const data = await load()
      setRows(data[key] ?? [])
      setError(null)
    } catch (err) {
      setError(err.message)
    }
  }, [load, key])
  useEffect(() => {
    reload()
  }, [reload])
  return { rows, setRows, reload, error }
}

/* ══ Routes ═══════════════════════════════════════════════════════════ */

/**
 * The road between the clicked points, from the public OSRM router. If it is
 * unreachable the route is still saved — as straight lines, with the distance
 * measured along them and the time at an assumed 50 km/h — rather than not at all.
 */
async function roadBetween(points) {
  const coords = points.map((p) => `${p.lng},${p.lat}`).join(';')
  try {
    const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`)
    const data = await res.json()
    const r = data.routes?.[0]
    if (!r) throw new Error('no route')
    return {
      path: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
      distanceKm: Math.round((r.distance / 1000) * 10) / 10,
      durationMin: Math.round(r.duration / 60),
      road: true,
    }
  } catch {
    const R = 6371
    let km = 0
    for (let i = 1; i < points.length; i++) {
      const [a, b] = [points[i - 1], points[i]]
      const dLat = ((b.lat - a.lat) * Math.PI) / 180
      const dLng = ((b.lng - a.lng) * Math.PI) / 180
      const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
      km += 2 * R * Math.asin(Math.sqrt(h))
    }
    return { path: points.map((p) => [p.lat, p.lng]), distanceKm: Math.round(km * 10) / 10, durationMin: Math.round((km / 50) * 60), road: false }
  }
}

function ClickToAdd({ onAdd }) {
  useMapEvents({ click: (e) => onAdd({ lat: e.latlng.lat, lng: e.latlng.lng }) })
  return null
}

function RouteEditor({ open, row, groups, onClose, onSaved }) {
  const { t, lang, nf } = useLang()
  const [name, setName] = useState('')
  const [groupId, setGroupId] = useState('')
  const [points, setPoints] = useState([])
  const [road, setRoad] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open) return
    setName(row?.name ?? '')
    setGroupId(row?.groupId ?? groups[0]?.id ?? '')
    setPoints(row?.points ?? [])
    setRoad(row ? { path: row.path, distanceKm: row.distanceKm, durationMin: row.durationMin, road: true } : null)
    setError(null)
  }, [open, row, groups])

  /* the road is redrawn whenever the stops change */
  useEffect(() => {
    if (!open) return undefined
    if (points.length < 2) {
      setRoad(null)
      return undefined
    }
    let live = true
    roadBetween(points).then((r) => live && setRoad(r))
    return () => {
      live = false
    }
  }, [open, points])

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const body = { name, groupId: Number(groupId) || null, points, ...(road ?? {}) }
      if (row) await api.updateRoute(row.id, body)
      else await api.createRoute(body)
      onSaved()
    } catch (err) {
      setError(apiErrorText(err.message, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      error={error}
      title={row ? `${t('common.edit')} — ${row.name}` : lang === 'ar' ? 'مسار جديد' : 'New route'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={save} disabled={busy || points.length < 2 || !name.trim()}>{busy ? t('common.loading') : t('common.save')}</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={lang === 'ar' ? 'اسم المسار *' : 'Route name *'}>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t('mng.group')}>
          <Select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{lang === 'ar' ? g.nameAr : g.nameEn}</option>
            ))}
          </Select>
        </Field>
      </div>
      <p className="mt-4 mb-2 text-[12.5px] font-bold text-muted">
        {lang === 'ar'
          ? 'اضغط على الخريطة لإضافة نقاط المسار بالترتيب: أول نقطة البداية وآخر نقطة النهاية.'
          : 'Click the map to add the route’s points in order: the first is the start, the last the end.'}
      </p>
      <div className="h-[340px] overflow-hidden rounded-xl border border-[var(--s-border)]">
        <FleetMap vehicles={[]} showGeofences={false} center={points[0] ? [points[0].lat, points[0].lng] : undefined}>
          <ClickToAdd onAdd={(p) => setPoints((prev) => [...prev, p].slice(0, 25))} />
          {road?.path?.length > 1 && <Polyline positions={road.path} pathOptions={{ color: '#00a97a', weight: 5, opacity: 0.85 }} />}
          {points.map((p, i) => (
            <Marker key={`${p.lat}-${p.lng}-${i}`} position={[p.lat, p.lng]} icon={pointIcon(i === 0 ? '#00a97a' : i === points.length - 1 ? '#f4634e' : '#38a3ff', 14)} />
          ))}
        </FleetMap>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[13px] font-bold">
        <span>{lang === 'ar' ? 'النقاط' : 'Points'}: {nf(points.length)}</span>
        <span>{lang === 'ar' ? 'المسافة الكلية' : 'Total distance'}: {road ? `${nf(road.distanceKm)} km` : '0 km'}</span>
        <span>{lang === 'ar' ? 'الوقت الكلي' : 'Total time'}: {road ? `${nf(road.durationMin)} ${lang === 'ar' ? 'دقيقة' : 'min'}` : '0'}</span>
        <span className="ms-auto flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => setPoints((p) => p.slice(0, -1))} disabled={!points.length}>
            <Undo2 size={14} /> {lang === 'ar' ? 'تراجع' : 'Undo'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPoints([])} disabled={!points.length}>
            {lang === 'ar' ? 'مسح' : 'Clear'}
          </Button>
        </span>
      </div>
      {road && !road.road && (
        <p className="mt-2 text-[12px] font-bold text-amber-600">
          {lang === 'ar' ? 'تعذّر حساب الطريق الفعلي — المسافة محسوبة بخط مستقيم.' : 'Could not reach the road router — distance is measured in straight lines.'}
        </p>
      )}
    </Modal>
  )
}

export function RoutesSection({ query, canWrite }) {
  const { t, lang, nf } = useLang()
  const { groups } = useFleet()
  const load = useCallback(() => api.getRoutes(), [])
  const { rows, reload, error } = useList(load, 'routes')
  const [editing, setEditing] = useState(null) // { row } | null

  const groupName = (id) => {
    const g = groups.find((x) => x.id === id)
    return g ? (lang === 'ar' ? g.nameAr : g.nameEn) : '—'
  }
  const q = query.trim().toLowerCase()
  const shown = rows.filter((r) => !q || r.name.toLowerCase().includes(q))

  const remove = async (r) => {
    if (!window.confirm(lang === 'ar' ? `حذف المسار «${r.name}»؟` : `Delete route "${r.name}"?`)) return
    try {
      await api.deleteRoute(r.id)
      reload()
    } catch (err) {
      window.alert(apiErrorText(err.message, t))
    }
  }

  return (
    <>
      <Card className={cn('overflow-hidden', TABLE_CARD)}>
        <CardHeader
          title={lang === 'ar' ? 'المسارات' : 'Routes'}
          subtitle={`${nf(rows.length)} ${lang === 'ar' ? 'مسار' : 'routes'}`}
          icon={RouteIcon}
          action={canWrite && <Button size="sm" onClick={() => setEditing({ row: null })}><Plus size={15} />{lang === 'ar' ? 'مسار جديد' : 'New route'}</Button>}
        />
        {error && <p className="mx-5 mb-3 text-[12.5px] font-bold text-[#e04b34]">{error}</p>}
        <Table
          fit
          className={TABLE_SCROLL}
          columns={[
            { key: 'n', label: lang === 'ar' ? 'اسم المسار' : 'Route name', width: '34%' },
            { key: 'b', label: t('mng.group'), width: '20%' },
            { key: 'd', label: lang === 'ar' ? 'المسافة الكلية' : 'Total distance', width: '15%' },
            { key: 'm', label: lang === 'ar' ? 'الوقت الكلي' : 'Total time', width: '13%' },
            { key: 's', label: t('common.status'), width: '10%' },
            { key: 'a', label: t('common.actions'), width: '8%', className: 'text-end' },
          ]}
          rows={shown}
          empty={lang === 'ar' ? 'لا توجد مسارات — ارسم أول مسار' : 'No routes yet — draw the first one'}
          renderRow={(r) => (
            <>
              <Td className="font-extrabold">{r.name}</Td>
              <Td className="text-muted">{groupName(r.groupId)}</Td>
              <Td className="tabular-nums">{nf(r.distanceKm)} km</Td>
              <Td className="tabular-nums">{nf(r.durationMin)} {lang === 'ar' ? 'دقيقة' : 'min'}</Td>
              <Td><Badge tone={r.active ? 'brand' : 'slate'} dot>{r.active ? t('common.active') : t('common.inactive')}</Badge></Td>
              <Td className="text-end">{canWrite && <RowButtons onEdit={() => setEditing({ row: r })} onDelete={() => remove(r)} />}</Td>
            </>
          )}
        />
      </Card>
      <RouteEditor
        open={Boolean(editing)}
        row={editing?.row}
        groups={groups}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null)
          reload()
        }}
      />
    </>
  )
}

/* ══ Work orders ══════════════════════════════════════════════════════ */

const blankOrder = (groups) => ({
  name: '',
  type: '',
  recursion: 'once',
  groupId: groups[0]?.id ?? '',
  vehicleId: '',
  driverId: '',
  organization: '',
  description: '',
  routeId: '',
  price: 0,
  active: true,
  schedule: { startDate: dayBack(0), endDate: '', startTime: '08:00', endTime: '17:00', weekdays: [], everyDays: 1 },
})

/** The price a work order gets from the price list, for its type and route. */
function suggestedPrice(pricing, type, route) {
  const p = pricing?.[type]
  if (!p) return 0
  if (p.mode === 'km') return route ? Math.round(p.amount * route.distanceKm * 100) / 100 : 0
  return p.amount
}

const SAR = (lang) => (lang === 'ar' ? 'ريال' : 'SAR')

function PricingEditor({ open, pricing, onClose, onSaved }) {
  const { t, lang } = useLang()
  const [d, setD] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open) return
    setD(Object.fromEntries(WO_TYPES.map((x) => [x, { ...(pricing?.[x] ?? { mode: 'trip', amount: 0 }) }])))
    setError(null)
  }, [open, pricing])

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await api.savePricing(d)
      onSaved(res.pricing)
    } catch (err) {
      setError(apiErrorText(err.message, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      error={error}
      title={lang === 'ar' ? 'الأسعار' : 'Pricing'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={save} disabled={busy}>{busy ? t('common.loading') : t('common.save')}</Button>
        </>
      }
    >
      <p className="mb-4 text-[12.5px] font-bold text-muted">
        {lang === 'ar'
          ? 'سعر كل نوع من أوامر العمل — يظهر تلقائيًا في أمر العمل الجديد ويمكن تغييره هناك.'
          : 'A price for each work-order type — filled into a new work order, where it can still be changed.'}
      </p>
      <div className="space-y-3">
        {WO_TYPES.map((x) => (
          <div key={x} className="grid grid-cols-[1fr_6.5rem_8.5rem] items-center gap-2">
            <span className="text-[13px] font-extrabold">{lbl('type', x, lang)}</span>
            <Input
              type="number"
              min="0"
              step="0.01"
              dir="ltr"
              value={d[x]?.amount ?? 0}
              onChange={(e) => setD((all) => ({ ...all, [x]: { ...all[x], amount: e.target.value } }))}
              className="h-10 text-[12.5px]"
            />
            <Select value={d[x]?.mode ?? 'trip'} onChange={(e) => setD((all) => ({ ...all, [x]: { ...all[x], mode: e.target.value } }))} className="h-10 text-[12.5px]">
              <option value="trip">{lang === 'ar' ? 'ريال / رحلة' : 'SAR / trip'}</option>
              <option value="km">{lang === 'ar' ? 'ريال / كم' : 'SAR / km'}</option>
            </Select>
          </div>
        ))}
      </div>
    </Modal>
  )
}

function WorkOrderEditor({ open, row, routes, pricing, onClose, onSaved }) {
  const { t, lang, nf } = useLang()
  const { groups, vehicles, users } = useFleet()
  const [d, setD] = useState(blankOrder(groups))
  const [step, setStep] = useState('main')
  /* once the price is typed by hand, the price list stops overwriting it */
  const [priceTouched, setPriceTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const drivers = users.filter((u) => u.role === 'driver' && u.active !== false)

  useEffect(() => {
    if (!open) return
    setD(row ? { ...row, price: row.price ?? 0, schedule: { ...row.schedule } } : blankOrder(groups))
    setPriceTouched(Boolean(row))
    setStep('main')
    setError(null)
  }, [open, row, groups])

  const set = (patch) => setD((x) => ({ ...x, ...patch }))
  const setS = (patch) => setD((x) => ({ ...x, schedule: { ...x.schedule, ...patch } }))

  /* choosing a driver brings their vehicle with them, as the drivers tab links them */
  const pickDriver = (id) => {
    const u = drivers.find((x) => x.id === Number(id))
    set({ driverId: id, ...(u?.vehicleId && !d.vehicleId ? { vehicleId: u.vehicleId } : null) })
  }

  /* a new order takes its price from the list, following its type and route */
  useEffect(() => {
    if (!open || priceTouched) return
    const price = suggestedPrice(pricing, d.type, routes.find((r) => r.id === Number(d.routeId)))
    setD((x) => (x.price === price ? x : { ...x, price }))
  }, [open, priceTouched, pricing, routes, d.type, d.routeId])

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const body = { ...d, price: Number(d.price) || 0, groupId: Number(d.groupId), vehicleId: Number(d.vehicleId), driverId: Number(d.driverId), routeId: Number(d.routeId) }
      if (row) await api.updateWorkOrder(row.id, body)
      else await api.createWorkOrder(body)
      onSaved()
    } catch (err) {
      setError(apiErrorText(err.message, t))
    } finally {
      setBusy(false)
    }
  }

  const steps = [
    { value: 'main', label: lang === 'ar' ? '١. البيانات الأساسية' : '1. Main info' },
    { value: 'schedule', label: lang === 'ar' ? '٢. الجدول' : '2. Schedule' },
    { value: 'route', label: lang === 'ar' ? '٣. المسار' : '3. Route' },
  ]
  const order = steps.map((s) => s.value)
  const at = order.indexOf(step)
  const route = routes.find((r) => r.id === Number(d.routeId))

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      error={error}
      title={row ? `${t('common.edit')} — ${row.name}` : lang === 'ar' ? 'أمر عمل جديد' : 'New work order'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          {at > 0 && <Button variant="ghost" onClick={() => setStep(order[at - 1])}>{lang === 'ar' ? 'السابق' : 'Back'}</Button>}
          {at < order.length - 1 ? (
            <Button onClick={() => setStep(order[at + 1])}>{lang === 'ar' ? 'التالي' : 'Next'}</Button>
          ) : (
            <Button onClick={save} disabled={busy}>{busy ? t('common.loading') : t('common.save')}</Button>
          )}
        </>
      }
    >
      <Segmented options={steps} value={step} onChange={setStep} className="mb-5 w-full [&>button]:flex-1" size="sm" />

      {step === 'main' && (
        <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={lang === 'ar' ? 'الاسم *' : 'Name *'}>
            <Input value={d.name} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <Field label={lang === 'ar' ? 'النوع *' : 'Type *'}>
            {/* pick a listed type or type a new one */}
            <Input
              list="wo-types"
              value={lbl('type', d.type, lang)}
              placeholder={lang === 'ar' ? 'اختر أو اكتب' : 'Pick or type'}
              onChange={(e) => {
                const v = e.target.value
                set({ type: WO_TYPES.find((k) => L.type[k].includes(v)) ?? v })
              }}
            />
            <datalist id="wo-types">
              {WO_TYPES.map((x) => <option key={x} value={lbl('type', x, lang)} />)}
            </datalist>
          </Field>
          <Field label={lang === 'ar' ? 'نوع التكرار *' : 'Recursion type *'}>
            <Select value={d.recursion} onChange={(e) => set({ recursion: e.target.value })}>
              {Object.keys(L.recursion).map((x) => <option key={x} value={x}>{lbl('recursion', x, lang)}</option>)}
            </Select>
          </Field>
          <Field label={`${t('mng.group')} *`}>
            <Select value={d.groupId} onChange={(e) => set({ groupId: e.target.value })}>
              {groups.map((g) => <option key={g.id} value={g.id}>{lang === 'ar' ? g.nameAr : g.nameEn}</option>)}
            </Select>
          </Field>
          <Field label={`${t('common.driver')} *`}>
            <Select value={d.driverId} onChange={(e) => pickDriver(e.target.value)}>
              <option value="">—</option>
              {drivers.map((u) => <option key={u.id} value={u.id}>{lang === 'ar' ? u.nameAr : u.nameEn}</option>)}
            </Select>
          </Field>
          <Field label={`${t('mng.vehicle')} *`}>
            <Select value={d.vehicleId} onChange={(e) => set({ vehicleId: e.target.value })}>
              <option value="">—</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate}</option>)}
            </Select>
          </Field>
          <Field label={lang === 'ar' ? 'الجهة' : 'Organization'}>
            <Input value={d.organization} onChange={(e) => set({ organization: e.target.value })} />
          </Field>
          <Field label={t('common.status')}>
            <Select value={d.active ? '1' : '0'} onChange={(e) => set({ active: e.target.value === '1' })}>
              <option value="1">{t('common.active')}</option>
              <option value="0">{t('common.inactive')}</option>
            </Select>
          </Field>
          <Field label={`${lang === 'ar' ? 'سعر الرحلة' : 'Trip price'} (${SAR(lang)})`}>
            <Input
              type="number"
              min="0"
              step="0.01"
              dir="ltr"
              value={d.price}
              onChange={(e) => {
                setPriceTouched(true)
                set({ price: e.target.value })
              }}
            />
          </Field>
          <Field label={lang === 'ar' ? 'الوصف' : 'Description'} className="sm:col-span-2 lg:col-span-3">
            <Input value={d.description} onChange={(e) => set({ description: e.target.value })} />
          </Field>
        </div>
      )}

      {step === 'schedule' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={lang === 'ar' ? 'تاريخ البداية *' : 'Start date *'}>
            <Input type="date" dir="ltr" value={d.schedule.startDate} onChange={(e) => setS({ startDate: e.target.value })} />
          </Field>
          {d.recursion !== 'once' && (
            <Field label={lang === 'ar' ? 'تاريخ الانتهاء' : 'End date'}>
              <Input type="date" dir="ltr" value={d.schedule.endDate} onChange={(e) => setS({ endDate: e.target.value })} />
            </Field>
          )}
          <Field label={lang === 'ar' ? 'وقت البداية المخطط *' : 'Planned start time *'}>
            <Input type="time" dir="ltr" value={d.schedule.startTime} onChange={(e) => setS({ startTime: e.target.value })} />
          </Field>
          <Field label={lang === 'ar' ? 'وقت النهاية المخطط *' : 'Planned end time *'}>
            <Input type="time" dir="ltr" value={d.schedule.endTime} onChange={(e) => setS({ endTime: e.target.value })} />
          </Field>
          {d.recursion === 'weekly' && (
            <Field label={lang === 'ar' ? 'أيام الأسبوع *' : 'Weekdays *'} className="sm:col-span-2">
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map(([n, ar, en]) => {
                  const on = d.schedule.weekdays.includes(n)
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setS({ weekdays: on ? d.schedule.weekdays.filter((x) => x !== n) : [...d.schedule.weekdays, n] })}
                      className={cn('rounded-lg border px-3 py-1.5 text-[12.5px] font-bold', on ? 'border-brand-500 bg-brand-500 text-[#04120c]' : 'border-[var(--s-border)]')}
                    >
                      {lang === 'ar' ? ar : en}
                    </button>
                  )
                })}
              </div>
            </Field>
          )}
          {d.recursion === 'interval' && (
            <Field label={lang === 'ar' ? 'كل كم يوم *' : 'Every how many days *'}>
              <Input type="number" min="1" dir="ltr" value={d.schedule.everyDays} onChange={(e) => setS({ everyDays: Number(e.target.value) })} />
            </Field>
          )}
        </div>
      )}

      {step === 'route' && (
        <div className="space-y-4">
          <Field label={lang === 'ar' ? 'المسار *' : 'Route *'}>
            <Select value={d.routeId} onChange={(e) => set({ routeId: e.target.value })}>
              <option value="">—</option>
              {routes.filter((r) => r.active || r.id === Number(d.routeId)).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          </Field>
          {!routes.length && (
            <p className="text-[12.5px] font-bold text-muted">
              {lang === 'ar' ? 'لا توجد مسارات بعد — ارسمها من تبويب «المسارات».' : 'No routes yet — draw them in the Routes tab.'}
            </p>
          )}
          {route && (
            <>
              <div className="flex gap-4 text-[13px] font-bold">
                <span>{lang === 'ar' ? 'المسافة الكلية' : 'Total distance'}: {nf(route.distanceKm)} km</span>
                <span>{lang === 'ar' ? 'الوقت الكلي' : 'Total time'}: {nf(route.durationMin)} {lang === 'ar' ? 'دقيقة' : 'min'}</span>
              </div>
              <div className="h-[280px] overflow-hidden rounded-xl border border-[var(--s-border)]">
                <FleetMap vehicles={[]} showGeofences={false} center={route.points[0] ? [route.points[0].lat, route.points[0].lng] : undefined} key={route.id}>
                  <Polyline positions={route.path?.length ? route.path : route.points.map((p) => [p.lat, p.lng])} pathOptions={{ color: '#00a97a', weight: 5 }} />
                  {route.points.map((p, i) => (
                    <Marker key={i} position={[p.lat, p.lng]} icon={pointIcon(i === 0 ? '#00a97a' : i === route.points.length - 1 ? '#f4634e' : '#38a3ff', 14)} />
                  ))}
                </FleetMap>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  )
}

export function WorkOrdersSection({ query, canWrite }) {
  const { t, lang, nf } = useLang()
  const { groups, vehicles, users } = useFleet()
  const loadOrders = useCallback(() => api.getWorkOrders(), [])
  const loadRoutes = useCallback(() => api.getRoutes(), [])
  const { rows, reload, error } = useList(loadOrders, 'workOrders')
  const { rows: routes } = useList(loadRoutes, 'routes')
  const [editing, setEditing] = useState(null)
  const [pricing, setPricing] = useState(null)
  const [pricingOpen, setPricingOpen] = useState(false)

  useEffect(() => {
    api.getPricing().then((r) => setPricing(r.pricing)).catch(() => {})
  }, [])

  const name = (list, id, ar = 'nameAr', en = 'nameEn') => {
    const x = list.find((r) => r.id === id)
    return x ? (lang === 'ar' ? x[ar] : x[en]) : '—'
  }
  const q = query.trim().toLowerCase()
  const shown = rows.filter(
    (r) => !q || r.name.toLowerCase().includes(q) || String(r.id) === q || (vehicles.find((v) => v.id === r.vehicleId)?.plate ?? '').toLowerCase().includes(q),
  )

  const remove = async (r) => {
    if (!window.confirm(lang === 'ar' ? `حذف أمر العمل «${r.name}»؟` : `Delete work order "${r.name}"?`)) return
    try {
      await api.deleteWorkOrder(r.id)
      reload()
    } catch (err) {
      window.alert(apiErrorText(err.message, t))
    }
  }

  return (
    <>
      <Card className={cn('overflow-hidden', TABLE_CARD)}>
        <CardHeader
          title={lang === 'ar' ? 'أوامر العمل' : 'Work orders'}
          subtitle={`${nf(rows.length)} ${lang === 'ar' ? 'أمر' : 'orders'}`}
          icon={ClipboardList}
          action={
            canWrite && (
              <span className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setPricingOpen(true)}><Tag size={15} />{lang === 'ar' ? 'الأسعار' : 'Pricing'}</Button>
                <Button size="sm" onClick={() => setEditing({ row: null })}><Plus size={15} />{lang === 'ar' ? 'أمر عمل جديد' : 'New work order'}</Button>
              </span>
            )
          }
        />
        {error && <p className="mx-5 mb-3 text-[12.5px] font-bold text-[#e04b34]">{error}</p>}
        <Table
          fit
          className={TABLE_SCROLL}
          columns={[
            { key: 'i', label: '#', width: '5%' },
            { key: 'n', label: lang === 'ar' ? 'الاسم' : 'Name', width: '15%' },
            { key: 'b', label: t('mng.group'), width: '10%' },
            { key: 'p', label: lang === 'ar' ? 'رقم اللوحة' : 'Plate', width: '10%' },
            { key: 'd', label: t('common.driver'), width: '11%' },
            { key: 'r', label: lang === 'ar' ? 'المسار' : 'Route', width: '11%' },
            { key: 's', label: lang === 'ar' ? 'الموعد المخطط' : 'Planned time', width: '13%' },
            { key: 'k', label: lang === 'ar' ? 'المسافة / الوقت' : 'Distance / time', width: '10%' },
            { key: 't', label: t('common.status'), width: '7%' },
            { key: 'a', label: '', width: '8%', className: 'text-end' },
          ]}
          rows={shown}
          empty={lang === 'ar' ? 'لا توجد أوامر عمل' : 'No work orders'}
          renderRow={(r) => {
            const route = routes.find((x) => x.id === r.routeId)
            return (
              <>
                <Td className="tabular-nums font-bold text-muted">{r.id}</Td>
                <Td>
                  <span className="block font-extrabold">{r.name}</span>
                  <span className="block text-[11px] text-muted">{lbl('type', r.type, lang)} · {lbl('recursion', r.recursion, lang)}</span>
                </Td>
                <Td className="text-muted">{name(groups, r.groupId)}</Td>
                <Td><Plate plate={vehicles.find((v) => v.id === r.vehicleId)?.plate} /></Td>
                <Td>{name(users, r.driverId)}</Td>
                <Td className="text-muted">{route?.name ?? '—'}</Td>
                <Td className="text-[12px]">
                  <span className="block tabular-nums font-bold" dir="ltr">{r.schedule.startTime} – {r.schedule.endTime}</span>
                  <span className="block tabular-nums text-muted" dir="ltr">
                    {r.schedule.startDate}{r.recursion !== 'once' && r.schedule.endDate ? ` → ${r.schedule.endDate}` : ''}
                  </span>
                </Td>
                <Td className="text-[12px] tabular-nums">
                  {route ? (
                    <>
                      <span className="block font-bold">{nf(route.distanceKm)} km</span>
                      <span className="block text-muted">{nf(route.durationMin)} {lang === 'ar' ? 'دقيقة' : 'min'}</span>
                    </>
                  ) : '—'}
                </Td>
                <Td><Badge tone={r.active ? 'brand' : 'slate'} dot>{r.active ? t('common.active') : t('common.inactive')}</Badge></Td>
                <Td className="text-end">{canWrite && <RowButtons onEdit={() => setEditing({ row: r })} onDelete={() => remove(r)} />}</Td>
              </>
            )
          }}
        />
      </Card>
      <WorkOrderEditor
        open={Boolean(editing)}
        row={editing?.row}
        routes={routes}
        pricing={pricing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null)
          reload()
        }}
      />
      <PricingEditor
        open={pricingOpen}
        pricing={pricing}
        onClose={() => setPricingOpen(false)}
        onSaved={(p) => {
          setPricing(p)
          setPricingOpen(false)
        }}
      />
    </>
  )
}

/* ══ Trips ════════════════════════════════════════════════════════════ */

export function TripsSection({ query, canWrite }) {
  const { t, lang, nf, formatDateTime } = useLang()
  const { vehicles, users } = useFleet()
  const [from, setFrom] = useState(dayBack(7))
  const [to, setTo] = useState(dayBack(-7))
  const [status, setStatus] = useState('all')
  const load = useCallback(() => api.getTrips(from, to), [from, to])
  const { rows, reload, error } = useList(load, 'trips')
  const [busy, setBusy] = useState(null)

  const q = query.trim().toLowerCase()
  const shown = useMemo(
    () =>
      rows.filter(
        (r) =>
          (status === 'all' || r.status === status) &&
          (!q || r.workOrderName.toLowerCase().includes(q) || String(r.workOrderId) === q || (vehicles.find((v) => v.id === r.vehicleId)?.plate ?? '').toLowerCase().includes(q)),
      ),
    [rows, status, q, vehicles],
  )

  /* what the completed trips in view earned */
  const earned = shown.filter((r) => r.status === 'completed').reduce((sum, r) => sum + (r.price || 0), 0)

  const act = async (r, action) => {
    setBusy(r.id)
    try {
      await api.setTrip(r.id, action)
      reload()
    } catch (err) {
      window.alert(apiErrorText(err.message, t))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card className={cn('overflow-hidden', TABLE_CARD)}>
      <CardHeader
        title={lang === 'ar' ? 'الرحلات' : 'Trips'}
        subtitle={`${nf(shown.length)} ${t('rep.rows')}`}
        icon={CalendarClock}
      />
      <div className="flex flex-wrap items-end gap-3 px-5 pb-4">
        <Field label={lang === 'ar' ? 'من' : 'From'}>
          <Input type="date" dir="ltr" value={from} onChange={(e) => setFrom(e.target.value)} className="h-10 w-44 text-[12.5px]" />
        </Field>
        <Field label={lang === 'ar' ? 'إلى' : 'To'}>
          <Input type="date" dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} className="h-10 w-44 text-[12.5px]" />
        </Field>
        <Field label={t('common.status')}>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 w-40 text-[12.5px]">
            <option value="all">{t('common.all')}</option>
            {Object.keys(L.trip).map((s) => <option key={s} value={s}>{lbl('trip', s, lang)}</option>)}
          </Select>
        </Field>
      </div>
      {error && <p className="mx-5 mb-3 text-[12.5px] font-bold text-[#e04b34]">{apiErrorText(error, t)}</p>}
      <Table
        fit
        className={TABLE_SCROLL}
        columns={[
          { key: 'w', label: lang === 'ar' ? 'رقم أمر العمل' : 'Work order serial', width: '10%' },
          { key: 'n', label: lang === 'ar' ? 'اسم أمر العمل' : 'Work order name', width: '16%' },
          { key: 'x', label: lang === 'ar' ? 'رقم التنفيذ' : 'Execution number', width: '9%' },
          { key: 'p', label: lang === 'ar' ? 'رقم اللوحة' : 'Plate', width: '10%' },
          { key: 'd', label: t('common.driver'), width: '13%' },
          { key: 's', label: lang === 'ar' ? 'وقت البداية المخطط' : 'Planned start time', width: '13%' },
          { key: 'c', label: lang === 'ar' ? 'السعر' : 'Price', width: '8%' },
          { key: 't', label: t('common.status'), width: '11%' },
          { key: 'a', label: t('common.actions'), width: '10%', className: 'text-end' },
        ]}
        rows={shown}
        empty={lang === 'ar' ? 'لا توجد رحلات في هذه الفترة' : 'No trips in this range'}
        renderRow={(r) => {
          const driver = users.find((u) => u.id === r.driverId)
          return (
            <>
              <Td className="tabular-nums font-bold text-muted">{r.workOrderId}</Td>
              <Td className="font-extrabold">{r.workOrderName}</Td>
              <Td className="tabular-nums">{nf(r.execution)}</Td>
              <Td><Plate plate={vehicles.find((v) => v.id === r.vehicleId)?.plate} /></Td>
              <Td>{driver ? (lang === 'ar' ? driver.nameAr : driver.nameEn) : '—'}</Td>
              <Td className="tabular-nums text-[12px]" dir="ltr">{r.plannedStart.replace('T', ' ')}</Td>
              <Td className="tabular-nums text-[12px] font-bold">{r.price ? `${nf(r.price)} ${SAR(lang)}` : '—'}</Td>
              <Td>
                <Badge tone={TRIP_TONE[r.status]} dot>{lbl('trip', r.status, lang)}</Badge>
                {r.completedAt && <span className="mt-1 block text-[11px] text-muted">{formatDateTime(r.completedAt)}</span>}
              </Td>
              <Td className="text-end">
                {canWrite && (
                  <span className="inline-flex gap-1">
                    {r.status !== 'completed' && r.status !== 'cancelled' && (
                      <>
                        <button type="button" disabled={busy === r.id} title={lang === 'ar' ? 'إكمال' : 'Complete'} onClick={() => act(r, 'complete')} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-brand-500/12 hover:text-brand-600">
                          <Check size={15} />
                        </button>
                        <button type="button" disabled={busy === r.id} title={lang === 'ar' ? 'إلغاء' : 'Cancel'} onClick={() => act(r, 'cancel')} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-[#f4634e]/12 hover:text-[#e04b34]">
                          <Ban size={15} />
                        </button>
                      </>
                    )}
                    {r.status !== 'scheduled' && (
                      <button type="button" disabled={busy === r.id} title={lang === 'ar' ? 'إعادة إلى مجدولة' : 'Reset to scheduled'} onClick={() => act(r, 'reset')} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-[var(--s-panel-2)]">
                        <Undo2 size={15} />
                      </button>
                    )}
                  </span>
                )}
              </Td>
            </>
          )
        }}
      />
      <div className="flex items-center justify-end gap-2 border-t border-[var(--s-border)] px-5 py-3 text-[13px] font-extrabold">
        <span className="text-muted">{lang === 'ar' ? 'إجمالي الرحلات المكتملة' : 'Completed trips total'}:</span>
        <span className="tabular-nums">{nf(earned)} {SAR(lang)}</span>
      </div>
    </Card>
  )
}
