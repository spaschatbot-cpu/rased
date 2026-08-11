import { useMemo, useState } from 'react'
import { useParams, Navigate, Link } from 'react-router-dom'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ReferenceLine, ReferenceArea,
} from 'recharts'
import {
  Truck, AlertTriangle, Clock, Zap, Fuel,
  Route as RouteIcon, Gauge, ArrowLeft, ArrowRight, Activity, MapPin, KeyRound, BatteryMedium, User,
  FileText
} from 'lucide-react'
import { useLang } from '../../context/LanguageContext'
import { useFleet } from '../../context/FleetContext'
import { weekKeysAr, weekKeysEn, monthKeysAr, monthKeysEn } from '../../data/fleet'
import { useUsage } from '../../lib/useUsage'
import { weekdayOf } from '../../../shared/clock'
import { Card, CardHeader, StatusPill, Segmented, Button, cn } from '../../components/ui'
import FleetMap from '../../components/map/FleetMap'
import { exportToPdf } from '../../utils/exporters'
import { ALERT_ICON, ALERT_TONE } from './Alerts'

const AXIS_TICK = { fill: 'var(--s-text-muted)', fontSize: 11 }

export function ChartTooltip({ active, payload, label, unit }) {
  if (!active || !payload?.length) return null
  return (
    <div className="surface rounded-xl px-3 py-2 text-[12px] shadow-lg border border-[var(--s-border)]">
      {label && <p className="mb-1 font-extrabold">{label}</p>}
      {payload.map((p) => (
        <p key={p.dataKey ?? p.name} className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ background: p.color ?? p.payload?.color ?? '#00a97a' }} />
          <span className="text-muted">{p.name}</span>
          <span className="font-extrabold tabular-nums">
            {p.value} {unit}
          </span>
        </p>
      ))}
    </div>
  )
}

const CELL_TONE = {
  brand: 'bg-brand-500/12 text-brand-600 dark:text-brand-400',
  sky: 'bg-sky-500/12 text-sky-600 dark:text-sky-400',
  amber: 'bg-amber-500/15 text-amber-600 dark:text-amber-500',
  violet: 'bg-violet-500/12 text-violet-600 dark:text-violet-400',
  slate: 'bg-[var(--s-panel-2)] text-[var(--s-text-muted)]',
}

function DetailCell({ icon: Icon, label, value, ltr, tone = 'slate', progress }) {
  const barColor = progress == null ? '' : progress > 50 ? 'bg-brand-500' : progress > 20 ? 'bg-amber-500' : 'bg-rose-500'
  return (
    <div className="group flex flex-col justify-center bg-[var(--s-panel)] p-4 transition-colors duration-200 hover:bg-[var(--s-panel-2)]">
      <span className="flex items-center gap-2">
        <span
          className={cn(
            'grid size-7 shrink-0 place-items-center rounded-lg transition-transform duration-200 group-hover:scale-110',
            CELL_TONE[tone] ?? CELL_TONE.slate,
          )}
        >
          <Icon size={14} strokeWidth={2.5} />
        </span>
        <span className="truncate text-[11.5px] font-bold tracking-wide text-muted">{label}</span>
      </span>
      <p className="mt-2 truncate text-[15px] font-black tabular-nums text-slate-900 dark:text-white">
        <bdi dir={ltr ? 'ltr' : undefined}>{value}</bdi>
      </p>
      {progress != null && (
        <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-[var(--s-border)]">
          <span
            className={cn('block h-full rounded-full transition-[width] duration-500', barColor)}
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </span>
      )}
    </div>
  )
}

const PERIOD_TONE = {
  brand: { plate: 'from-brand-400 to-brand-600 text-[#04120c] shadow-brand-500/25', value: 'text-brand-600 dark:text-brand-400' },
  sky: { plate: 'from-sky-400 to-sky-600 text-white shadow-sky-500/25', value: 'text-sky-600 dark:text-sky-400' },
  violet: { plate: 'from-violet-400 to-violet-600 text-white shadow-violet-500/25', value: 'text-violet-600 dark:text-violet-400' },
}

function PeriodCard({ title, icon: Icon = Activity, tone = 'brand', distance, engineTime, topSpeed }) {
  const { t, lang, nf } = useLang()
  const c = PERIOD_TONE[tone] ?? PERIOD_TONE.brand
  return (
    <Card className="overflow-hidden border-[var(--s-border-strong)] shadow-[var(--s-e2)] transition-transform duration-300 hover:-translate-y-0.5">
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl bg-linear-to-br shadow-lg', c.plate)}>
            <Icon size={19} strokeWidth={2.5} />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-black leading-tight">{title}</h3>
            <span className="mt-0.5 block text-[11px] font-bold text-muted">
              {lang === 'ar' ? 'المسافة المقطوعة' : 'Distance travelled'}
            </span>
          </div>
        </div>

        <p className="flex shrink-0 items-baseline gap-1.5">
          <span className={cn('text-[28px] font-black leading-none tabular-nums tracking-tight', c.value)}>{nf(distance)}</span>
          <span className="text-[12px] font-bold text-muted">{t('common.km')}</span>
        </p>
      </div>

      <div className="grid grid-cols-2 gap-px border-t border-[var(--s-border)] bg-[var(--s-border)]">
        <div className="bg-[var(--s-panel)] px-4 py-3">
          <span className="flex items-center gap-1.5 text-[11px] font-bold text-muted">
            <Clock size={13} />
            {lang === 'ar' ? 'وقت التشغيل' : 'Engine Time'}
          </span>
          <p className="mt-1 truncate text-[14px] font-black tabular-nums">
            {nf(engineTime)} <span className="text-[11px] font-bold text-muted">{t('common.hours')}</span>
          </p>
        </div>
        <div className="bg-[var(--s-panel)] px-4 py-3">
          <span className="flex items-center gap-1.5 text-[11px] font-bold text-muted">
            <Gauge size={13} />
            {lang === 'ar' ? 'أعلى سرعة' : 'Top Speed'}
          </span>
          <p className="mt-1 truncate text-[14px] font-black tabular-nums">
            {nf(topSpeed)} <span className="text-[11px] font-bold text-muted">{t('common.kmh')}</span>
          </p>
        </div>
      </div>
    </Card>
  )
}

export default function VehicleDashboard() {
  const { id } = useParams()
  const { t, lang, isRTL, nf, formatTime, formatDateTime } = useLang()
  const { vehicles, inbox, loading } = useFleet()
  const [tab, setTab] = useState('location')
  const [period, setPeriod] = useState('daily')

  const vehicleId = Number(id)
  const vehicle = vehicles.find((v) => v.id === vehicleId)

  /* the registry is fetched, so it is empty on the first render — every hook
     below has to run anyway, and the redirect waits until we actually know the
     vehicle is missing rather than bouncing off a list that has not arrived */
  const { usage } = useUsage(vehicleId)

  const chartMargin = isRTL ? { top: 4, right: -18, left: 12, bottom: 0 } : { top: 4, right: 12, left: -18, bottom: 0 }
  const yAxisSide = isRTL ? 'right' : 'left'

  const speedProfile = usage.speedProfile

  const weekLabels = lang === 'ar' ? weekKeysAr : weekKeysEn
  const weeklyData = usage.daily.slice(-7).map((d) => ({
    ...d,
    label: weekLabels[weekdayOf(d.date)],
  }))

  const vehicleAlerts = inbox.filter((a) => a.vehicleId === vehicleId)

  /**
   * Today, this week and this month — added up from the days this vehicle
   * actually recorded.
   *
   * These three used to be seeded off the vehicle's id, so a truck that had
   * never reported still claimed a couple of hundred kilometres. Distance and
   * hours add up across days; a top speed is the fastest of them, not a sum.
   */
  const periodTotals = useMemo(() => {
    const sum = (days) => ({
      distance: Math.round(days.reduce((s, d) => s + d.distance, 0)),
      engineTime: Number(days.reduce((s, d) => s + d.engineHours, 0).toFixed(1)),
      topSpeed: days.reduce((m, d) => Math.max(m, d.maxSpeed ?? 0), 0),
    })
    const daily = usage.daily
    return {
      today: sum(daily.slice(-1)),
      week: sum(daily.slice(-7)),
      month: sum(daily.slice(-30)),
    }
  }, [usage.daily])

  /* every hook has run — only now is an empty result a real "no such vehicle" */
  if (!vehicle) {
    return loading ? null : <Navigate to="/app/dashboard" replace />
  }
  const BackIcon = isRTL ? ArrowRight : ArrowLeft

  /* A vehicle only has a position once a device has reported one. Until then
     there is no map pin, no coordinates and no "last update" — and saying so is
     the whole point: a placeholder here reads as a live vehicle parked
     somewhere, which is a different and much worse claim than "no signal". */
  const located = Number.isFinite(vehicle.lat) && Number.isFinite(vehicle.lng)
  const coords = located ? `${vehicle.lat.toFixed(4)}, ${vehicle.lng.toFixed(4)}` : t('dash.noPosition')
  const seenAt = vehicle.lastUpdate ? formatTime(vehicle.lastUpdate) : '—'
  const seenOn = vehicle.lastUpdate ? formatDateTime(vehicle.lastUpdate) : t('dash.noPosition')

  const tabs = [
    { value: 'location', label: lang === 'ar' ? 'الموقع' : 'Location' },
    { value: 'stats', label: lang === 'ar' ? 'الإحصائيات' : 'Statistics' },
  ]

  /* استخدام المركبة — كلها محسوبة من المسارات المسجَّلة على السيرفر */
  const monthLabels = lang === 'ar' ? monthKeysAr : monthKeysEn

  const isDaily = period === 'daily'
  const usageData =
    period === 'daily' ? usage.daily
    : period === 'weekly' ? usage.weekly
    : usage.monthly.map((m) => ({ ...m, label: monthLabels[m.month] }))

  const periods = [
    { value: 'daily', label: lang === 'ar' ? 'يومي' : 'Daily' },
    { value: 'weekly', label: lang === 'ar' ? 'أسبوعي' : 'Weekly' },
    { value: 'monthly', label: lang === 'ar' ? 'شهري' : 'Monthly' },
  ]

  /* the window is however much trail is actually kept, not a round number the
     store cannot back up — the buckets are cut from that same window */
  const rangeNote =
    period === 'daily'
      ? lang === 'ar' ? `آخر ${nf(usage.retentionDays)} يوم` : `Last ${usage.retentionDays} days`
      : period === 'weekly'
        ? lang === 'ar' ? `آخر ${nf(usage.weekly.length)} أسابيع` : `Last ${usage.weekly.length} weeks`
        : lang === 'ar' ? `آخر ${nf(usage.monthly.length)} أشهر` : `Last ${usage.monthly.length} months`

  const usageTitles = {
    distance:
      period === 'daily' ? (lang === 'ar' ? 'المسافة اليومية المقطوعة' : 'Daily Distance Travelled')
      : period === 'weekly' ? (lang === 'ar' ? 'المسافة الأسبوعية المقطوعة' : 'Weekly Distance Travelled')
      : (lang === 'ar' ? 'المسافة الشهرية المقطوعة' : 'Monthly Distance Travelled'),
    hours:
      period === 'daily' ? (lang === 'ar' ? 'ساعات تشغيل المحرك اليومية' : 'Daily Engine Hours')
      : period === 'weekly' ? (lang === 'ar' ? 'ساعات تشغيل المحرك الأسبوعية' : 'Weekly Engine Hours')
      : (lang === 'ar' ? 'ساعات تشغيل المحرك الشهرية' : 'Monthly Engine Hours'),
  }

  const avg = (key) => usageData.reduce((s, d) => s + d[key], 0) / (usageData.length || 1)
  const avgDistance = avg('distance')
  const avgHours = avg('engineHours')
  const avgLabel = lang === 'ar' ? 'المتوسط' : 'Avg'

  /* مخطط السرعة: ساعات اليوم في العرض اليومي، ومتوسط شهري في العرض الشهري */
  const monthlySpeed = usage.monthly.map((m) => ({
    label: monthLabels[m.month],
    avgSpeed: Math.round(m.distance / Math.max(1, m.engineHours)),
  }))
  const speedData = isDaily ? speedProfile : monthlySpeed
  const speedKey = isDaily ? 'hour' : 'label'
  const avgSpeed = speedData.reduce((s, d) => s + d.avgSpeed, 0) / (speedData.length || 1)
  const speedPeak = speedData.reduce((max, d) => (d.avgSpeed > max.avgSpeed ? d : max), speedData[0])
  const tickNum = (v) => nf(v)

  /* ── التصدير: نفس بيانات الفترة المعروضة ─────────────────────────── */
  const periodWord =
    period === 'daily' ? (lang === 'ar' ? 'يومي' : 'daily')
    : period === 'weekly' ? (lang === 'ar' ? 'أسبوعي' : 'weekly')
    : (lang === 'ar' ? 'شهري' : 'monthly')

  const exportPayload = () => ({
    title: `${lang === 'ar' ? 'تقرير استهلاك المركبة' : 'Vehicle Usage Report'} — ${vehicle.plate}`,
    subtitle: `${lang === 'ar' ? 'السائق' : 'Driver'}: ${lang === 'ar' ? vehicle.driverAr : vehicle.driverEn} • ${periodWord} • ${rangeNote}`,
    rtl: isRTL,
    columns: [
      // تاريخ كامل (YYYY-MM-DD) حتى لا يفسّر Excel صيغة «يوم/شهر» كتاريخ خاطئ
      { key: 'date', type: 'text', label: period === 'daily' ? (lang === 'ar' ? 'التاريخ' : 'Date') : period === 'weekly' ? (lang === 'ar' ? 'بداية الأسبوع' : 'Week of') : (lang === 'ar' ? 'الشهر' : 'Month') },
      { key: 'distance', type: 'int', label: `${lang === 'ar' ? 'المسافة' : 'Distance'} (${t('common.km')})` },
      { key: 'engineHours', type: 'num', label: `${lang === 'ar' ? 'ساعات التشغيل' : 'Engine Hours'} (${t('common.hours')})` },
    ],
    rows: usageData.map((d) => ({ date: d.date, distance: d.distance, engineHours: d.engineHours })),
    summary: [
      { label: lang === 'ar' ? 'إجمالي المسافة' : 'Total distance', value: `${nf(usageData.reduce((s, d) => s + d.distance, 0))} ${t('common.km')}` },
      { label: lang === 'ar' ? 'إجمالي ساعات التشغيل' : 'Total engine hours', value: `${nf(Math.round(usageData.reduce((s, d) => s + d.engineHours, 0)))} ${t('common.hours')}` },
      { label: lang === 'ar' ? 'متوسط المسافة' : 'Average distance', value: `${nf(Math.round(avgDistance))} ${t('common.km')}` },
      { label: lang === 'ar' ? 'متوسط ساعات التشغيل' : 'Average engine hours', value: `${nf(Math.round(avgHours * 10) / 10)} ${t('common.hours')}` },
    ],
  })

  const handlePdf = () =>
    exportToPdf({
      ...exportPayload(),
      brand: lang === 'ar' ? 'مرصاد' : 'Mirsad',
      brandNote: lang === 'ar' ? 'منصة إدارة الأساطيل' : 'Fleet management platform',
      footerNote: `${vehicle.plate} • ${lang === 'ar' ? vehicle.driverAr : vehicle.driverEn}`,
    })

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-4 sm:p-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* Vehicle hero header */}
      <Card rail="brand" className="border-[var(--s-border-strong)] shadow-[var(--s-e2)]">
        <div className="relative flex flex-wrap items-center gap-4 bg-linear-to-l from-brand-500/10 via-transparent to-transparent p-4 sm:p-5">
          <Link
            to="/app/dashboard"
            aria-label={lang === 'ar' ? 'رجوع' : 'Back'}
            className="grid size-11 shrink-0 place-items-center rounded-xl border border-[var(--s-border)] bg-[var(--s-panel-2)] text-[var(--s-text-muted)] transition-all hover:border-brand-500/40 hover:bg-brand-500/10 hover:text-brand-600 dark:hover:text-brand-400"
          >
            <BackIcon size={20} />
          </Link>

          <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-linear-to-br from-brand-400 to-brand-600 text-[#04120c] shadow-lg shadow-brand-500/25">
            <Truck size={26} strokeWidth={2.4} />
          </div>

          <div className="min-w-0 flex-1">
            <span className="block text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-muted">
              {lang === 'ar' ? 'ملف المركبة' : 'Vehicle Profile'}
            </span>
            <h1 className="truncate text-[26px] font-black leading-tight tracking-tight sm:text-[30px]">
              <bdi dir="ltr">{vehicle.plate}</bdi>
            </h1>
            <p className="mt-1 flex items-center gap-1.5 truncate text-[13px] font-bold text-muted">
              <User size={14} className="shrink-0" />
              {lang === 'ar' ? vehicle.driverAr : vehicle.driverEn}
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-xl border border-[var(--s-border)] bg-[var(--s-panel-2)] px-3 py-2 text-[12px] font-bold text-muted sm:inline-flex">
              <Gauge size={14} className="text-brand-500" />
              <span className="tabular-nums text-[var(--s-text)]">{nf(vehicle.speed)}</span>
              {t('common.kmh')}
            </span>
            <span className="hidden items-center gap-1.5 rounded-xl border border-[var(--s-border)] bg-[var(--s-panel-2)] px-3 py-2 text-[12px] font-bold text-muted lg:inline-flex">
              <Clock size={14} />
              <span className="tabular-nums text-[var(--s-text)]">{seenAt}</span>
            </span>
            <StatusPill status={vehicle.status} label={t(`status.${vehicle.status}`)} />
          </div>
        </div>
      </Card>

      {/* Tabs: الموقع / الإحصائيات */}
      <div className="flex justify-center">
        <Segmented
          options={tabs}
          value={tab}
          onChange={setTab}
          className="w-full max-w-2xl [&>button]:flex-1 [&>button]:px-8 [&>button]:py-3 [&>button]:text-[15px]"
        />
      </div>

      {tab === 'location' ? (
      <>
      {/* Map and Base Details Split */}
      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <Card className="overflow-hidden flex flex-col border-2 border-[var(--s-border-strong)] shadow-[var(--s-e3)] ring-1 ring-brand-500/10">
          <CardHeader
            title={lang === 'ar' ? 'الموقع المباشر' : 'Live Location'}
            subtitle={lang === 'ar' ? 'تتبّع لحظي للمركبة' : 'Real-time vehicle tracking'}
            icon={MapPin}
            tone="brand"
            action={
              <>
              <Link
                to="/app/map"
                className="inline-flex items-center gap-2 rounded-xl bg-linear-to-br from-brand-400 to-brand-600 px-4 py-2 text-[13px] font-extrabold text-[#04120c] shadow-sm shadow-brand-500/25 transition-all hover:from-brand-300 hover:to-brand-500 hover:shadow-md hover:shadow-brand-400/40"
              >
                <MapPin size={15} />
                {lang === 'ar' ? 'الموقع على الخريطة' : 'Locate on Map'}
              </Link>
              <span className="inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-widest text-brand-600 dark:text-brand-400">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-500 opacity-70" />
                  <span className="relative inline-flex size-2 rounded-full bg-brand-500" />
                </span>
                {lang === 'ar' ? 'مباشر' : 'Live'}
              </span>
              </>
            }
          />

          <div className="relative flex-1 min-h-[340px]">
            <FleetMap
              vehicles={[vehicle]}
              selectedId={vehicle.id}
              center={located ? [vehicle.lat, vehicle.lng] : undefined}
              zoom={14}
              follow
              resizeDeps={[vehicle.id, tab]}
            />

            {/* خريطة بلا مركبة تحتاج أن تقول لماذا — وإلا قُرئت كعطل في الخريطة */}
            {!located && (
              <div className="pointer-events-none absolute inset-0 z-[900] grid place-items-center bg-[var(--s-panel)]/70 backdrop-blur-[2px]">
                <span className="surface rounded-xl border border-[var(--s-border)] px-4 py-2.5 text-[13px] font-extrabold text-muted shadow-[var(--s-e2)]">
                  {t('dash.noPosition')}
                </span>
              </div>
            )}

            {/* شارة عائمة فوق الخريطة: الحالة والسرعة */}
            <div className="pointer-events-none absolute top-3 right-3 z-[900] flex items-center gap-2">
              <span className="surface flex items-center gap-1.5 rounded-xl border border-[var(--s-border)] px-3 py-1.5 text-[12px] font-black shadow-[var(--s-e1)]">
                <Gauge size={14} className="text-brand-500" />
                <span className="tabular-nums">{nf(vehicle.speed)}</span>
                <span className="text-[11px] font-bold text-muted">{t('common.kmh')}</span>
              </span>
              <StatusPill status={vehicle.status} label={t(`status.${vehicle.status}`)} className="shadow-[var(--s-e1)]" />
            </div>
          </div>

          {/* شريط سفلي: الإحداثيات وآخر تحديث */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--s-border)]/60 bg-[var(--s-panel-2)]/60 px-5 py-3">
            <span className="flex items-center gap-2 text-[12px] font-bold text-muted">
              <MapPin size={14} className="shrink-0 text-brand-500" />
              <bdi dir="ltr" className="tabular-nums text-[var(--s-text)]">
                {coords}
              </bdi>
            </span>
            <span className="flex items-center gap-2 text-[12px] font-bold text-muted">
              <Clock size={14} className="shrink-0" />
              {lang === 'ar' ? 'آخر تحديث' : 'Last update'}
              <span className="tabular-nums text-[var(--s-text)]">{seenAt}</span>
            </span>
          </div>
        </Card>
        
        <Card className="overflow-hidden border-[var(--s-border-strong)] shadow-[var(--s-e2)] flex flex-col">
          <CardHeader
            title={lang === 'ar' ? 'بيانات المركبة الأساسية' : 'Vehicle Telemetry'}
            subtitle={lang === 'ar' ? 'قراءات الجهاز اللحظية' : 'Latest device readings'}
            icon={Zap}
            tone="amber"
            action={
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--s-border)] bg-[var(--s-panel-2)] px-3 py-1.5 text-[11px] font-bold text-muted">
                <Clock size={13} />
                <span className="tabular-nums text-[var(--s-text)]">{seenAt}</span>
              </span>
            }
          />
          <div className="grid flex-1 grid-cols-2 gap-px bg-[var(--s-border)]">
            <DetailCell icon={Clock} tone="slate" label={lang === 'ar' ? 'آخر تحديث' : 'Last Update'} value={seenOn} />
            <DetailCell icon={Gauge} tone="brand" label={lang === 'ar' ? 'السرعة' : 'Speed'} value={`${nf(vehicle.speed)} ${t('common.kmh')}`} />
            <DetailCell icon={MapPin} tone="sky" label={lang === 'ar' ? 'الموقع' : 'Location'} value={coords} ltr={located} />
            <DetailCell icon={BatteryMedium} tone="violet" label={lang === 'ar' ? 'البطارية' : 'Battery'} value={vehicle.battery == null ? '—' : `${vehicle.battery}%`} />
            {/* لا جهاز في هذا الأسطول يقيس الوقود ولا فولت الطاقة. الخانتان
                تبقيان لأن المكان محجوز لهما حين يُركَّب الجهاز، ويقولان «لا
                قراءة» بدل رقم يبدو قراءةً */}
            <DetailCell icon={Zap} tone="amber" label={lang === 'ar' ? 'الطاقة' : 'Power'} value="—" />
            <DetailCell icon={Fuel} tone="amber" label={lang === 'ar' ? 'الوقود' : 'Fuel'} value="—" />
            <DetailCell icon={RouteIcon} tone="sky" label={lang === 'ar' ? 'إجمالى المسافة' : 'Total Travelled'} value={`${nf(Math.round(vehicle.odometer))} ${t('common.km')}`} />
            <DetailCell icon={Clock} tone="brand" label={lang === 'ar' ? 'إجمالى وقت التشغيل' : 'Total Engine Hours'} value={`${nf(Math.round(vehicle.engineHours))} ${t('common.hours')}`} />
          </div>
          <p className="border-t border-[var(--s-border)] px-5 py-2.5 text-[11px] font-semibold text-muted">
            {t('veh.noSensor')}
          </p>
        </Card>
      </div>
      </>
      ) : (
      <>
      {/* ملخّص الفترات */}
      <div className="grid gap-6 md:grid-cols-3">
        <PeriodCard tone="brand" icon={Activity} title={lang === 'ar' ? 'اليوم' : 'Today'} {...periodTotals.today} />
        <PeriodCard tone="sky" icon={RouteIcon} title={lang === 'ar' ? 'هذا الأسبوع' : 'This Week'} {...periodTotals.week} />
        <PeriodCard tone="violet" icon={Gauge} title={lang === 'ar' ? 'هذا الشهر' : 'This Month'} {...periodTotals.month} />
      </div>

      {/* المسافة وساعات التشغيل — يومي / شهري */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[15px] font-black">
          {lang === 'ar' ? 'استهلاك المركبة' : 'Vehicle Usage'}
          <span className="ms-2 text-[12px] font-bold text-muted">{rangeNote}</span>
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented options={periods} value={period} onChange={setPeriod} size="sm" />
          <span className="h-6 w-px bg-[var(--s-border)]" />
          <Button variant="secondary" size="sm" onClick={handlePdf} title={`${lang === 'ar' ? 'تصدير PDF' : 'Export PDF'} — ${periodWord}`}>
            <FileText size={15} />
            PDF
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* المسافة المقطوعة */}
        <Card className="overflow-hidden border-[var(--s-border-strong)] shadow-[var(--s-e2)]">
          <CardHeader
            title={usageTitles.distance}
            subtitle={rangeNote}
            icon={RouteIcon}
            tone="sky"
            action={
              <span className="rounded-xl border border-[var(--s-border)] bg-[var(--s-panel-2)] px-3 py-1.5 text-[12px] font-bold text-muted">
                {lang === 'ar' ? 'الإجمالي' : 'Total'}
                <span className="ms-1.5 tabular-nums text-[var(--s-text)]">
                  {nf(usageData.reduce((sum, d) => sum + d.distance, 0))} {t('common.km')}
                </span>
              </span>
            }
          />
          <div className="h-72 p-3 pt-5">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={usageData} margin={chartMargin}>
                <defs>
                  <linearGradient id="usageDistGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.42} />
                    <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 4" stroke="var(--s-border)" opacity={0.4} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={AXIS_TICK}
                  axisLine={false}
                  tickLine={false}
                  reversed={isRTL}
                  dy={10}
                  minTickGap={isDaily ? 24 : 4}
                  interval="preserveStartEnd"
                />
                <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={54} orientation={yAxisSide} tickFormatter={tickNum} />
                <RTooltip content={<ChartTooltip unit={t('common.km')} />} cursor={{ stroke: 'var(--s-border-strong)', strokeWidth: 1, strokeDasharray: '4 4' }} />
                <ReferenceLine
                  y={avgDistance}
                  stroke="#0ea5e9"
                  strokeDasharray="5 5"
                  strokeOpacity={0.55}
                  label={{ value: `${avgLabel} ${nf(Math.round(avgDistance))}`, position: 'insideTopRight', fill: 'var(--s-text-muted)', fontSize: 10.5, fontWeight: 700 }}
                />
                <Area
                  type="monotone"
                  dataKey="distance"
                  name={lang === 'ar' ? 'المسافة' : 'Distance'}
                  stroke="#0ea5e9"
                  strokeWidth={2.75}
                  strokeLinecap="round"
                  fill="url(#usageDistGrad)"
                  dot={false}
                  activeDot={{ r: 5.5, strokeWidth: 2, stroke: 'var(--s-panel)', fill: '#0ea5e9' }}
                  animationDuration={700}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* ساعات تشغيل المحرك */}
        <Card className="overflow-hidden border-[var(--s-border-strong)] shadow-[var(--s-e2)]">
          <CardHeader
            title={usageTitles.hours}
            subtitle={rangeNote}
            icon={Clock}
            tone="brand"
            action={
              <span className="rounded-xl border border-[var(--s-border)] bg-[var(--s-panel-2)] px-3 py-1.5 text-[12px] font-bold text-muted">
                {lang === 'ar' ? 'الإجمالي' : 'Total'}
                <span className="ms-1.5 tabular-nums text-[var(--s-text)]">
                  {nf(Math.round(usageData.reduce((sum, d) => sum + d.engineHours, 0)))} {t('common.hours')}
                </span>
              </span>
            }
          />
          <div className="h-72 p-3 pt-5">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={usageData} margin={chartMargin}>
                <defs>
                  <linearGradient id="usageHoursGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00a97a" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="#00a97a" stopOpacity={0.15} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 4" stroke="var(--s-border)" opacity={0.3} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={AXIS_TICK}
                  axisLine={false}
                  tickLine={false}
                  reversed={isRTL}
                  dy={10}
                  minTickGap={isDaily ? 24 : 4}
                  interval="preserveStartEnd"
                />
                <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={45} orientation={yAxisSide} tickFormatter={tickNum} allowDecimals={false} />
                <RTooltip content={<ChartTooltip unit={t('common.hours')} />} cursor={{ fill: 'var(--s-panel-2)', opacity: 0.5 }} />
                <ReferenceLine
                  y={avgHours}
                  stroke="#00a97a"
                  strokeDasharray="5 5"
                  strokeOpacity={0.6}
                  label={{ value: `${avgLabel} ${nf(Math.round(avgHours * 10) / 10)}`, position: 'insideTopRight', fill: 'var(--s-text-muted)', fontSize: 10.5, fontWeight: 700 }}
                />
                <Bar
                  dataKey="engineHours"
                  name={lang === 'ar' ? 'ساعات التشغيل' : 'Engine Hours'}
                  fill="url(#usageHoursGrad)"
                  radius={[5, 5, 0, 0]}
                  maxBarSize={isDaily ? 12 : 30}
                  animationDuration={700}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>


      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Distance Area Chart — أيام الأسبوع، يظهر في العرض الأسبوعي فقط */}
        {period === 'weekly' && (
        <Card className="overflow-hidden border-[var(--s-border-strong)] shadow-[var(--s-e2)] lg:col-span-2">
          <CardHeader
            title={lang === 'ar' ? 'المسافة المقطوعة أسبوعياً' : 'Weekly Distance'}
            subtitle={lang === 'ar' ? 'آخر 7 أيام' : 'Last 7 days'}
            icon={RouteIcon}
            tone="sky"
          />
          <div className="h-72 p-3 pt-5">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={weeklyData} margin={chartMargin}>
                <defs>
                  <linearGradient id="vehDistGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 4" stroke="var(--s-border)" opacity={0.4} vertical={false} />
                <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} reversed={isRTL} dy={10} />
                <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={54} orientation={yAxisSide} tickFormatter={tickNum} />
                <RTooltip content={<ChartTooltip unit={t('common.km')} />} cursor={{ stroke: 'var(--s-border-strong)', strokeWidth: 1, strokeDasharray: '4 4' }} />
                <Area
                  type="monotone"
                  dataKey="distance"
                  name={lang === 'ar' ? 'المسافة' : 'Distance'}
                  stroke="#0ea5e9"
                  strokeWidth={2.5}
                  fill="url(#vehDistGrad)"
                  dot={{ r: 3, strokeWidth: 2, stroke: 'var(--s-panel)', fill: '#0ea5e9' }}
                  activeDot={{ r: 5.5, strokeWidth: 2, stroke: 'var(--s-panel)', fill: '#0ea5e9' }}
                  animationDuration={700}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        )}

        {/* Speed — ساعات اليوم في اليومي، ومتوسط شهري في الشهري (مخفي في الأسبوعي) */}
        {period !== 'weekly' && (
        <Card className="overflow-hidden border-[var(--s-border-strong)] shadow-[var(--s-e2)] lg:col-span-2">
          <CardHeader
            title={
              isDaily
                ? lang === 'ar' ? 'متوسط السرعة (اليوم)' : 'Average Speed (Today)'
                : lang === 'ar' ? 'متوسط السرعة الشهري' : 'Monthly Average Speed'
            }
            subtitle={isDaily ? (lang === 'ar' ? 'على مدار 24 ساعة' : 'Across 24 hours') : rangeNote}
            icon={Gauge}
            tone="brand"
            action={
              <div className="flex items-center gap-2">
                <span className="rounded-xl border border-[var(--s-border)] bg-[var(--s-panel-2)] px-3 py-1.5 text-[12px] font-bold text-muted">
                  {lang === 'ar' ? 'الذروة' : 'Peak'}
                  <span className="ms-1.5 tabular-nums text-[var(--s-text)]">
                    {nf(speedPeak.avgSpeed)} {t('common.kmh')}
                  </span>
                  <span className="ms-1.5 tabular-nums text-[var(--s-text-muted)]" dir="ltr">
                    {isDaily ? speedPeak.hour : speedPeak.label}
                  </span>
                </span>
                <span className="rounded-xl border border-[var(--s-border)] bg-[var(--s-panel-2)] px-3 py-1.5 text-[12px] font-bold text-muted">
                  {avgLabel}
                  <span className="ms-1.5 tabular-nums text-[var(--s-text)]">
                    {nf(Math.round(avgSpeed))} {t('common.kmh')}
                  </span>
                </span>
              </div>
            }
          />
          <div className="h-72 p-3 pt-5">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={speedData} margin={chartMargin}>
                <defs>
                  <linearGradient id="vehSpeedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00a97a" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#00a97a" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 4" stroke="var(--s-border)" opacity={0.3} vertical={false} />
                {/* ساعات الليل — نشاط منخفض */}
                {isDaily && <ReferenceArea x1="00:00" x2="05:00" fill="var(--s-text-muted)" fillOpacity={0.05} />}
                {isDaily && <ReferenceArea x1="22:00" x2="23:00" fill="var(--s-text-muted)" fillOpacity={0.05} />}
                <XAxis dataKey={speedKey} tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={isDaily ? 20 : 4} interval="preserveStartEnd" reversed={isRTL} dy={10} />
                <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={45} orientation={yAxisSide} tickFormatter={tickNum} />
                <RTooltip content={<ChartTooltip unit={t('common.kmh')} />} cursor={{ stroke: 'var(--s-border-strong)', strokeWidth: 1, strokeDasharray: '4 4' }} />
                <ReferenceLine
                  y={avgSpeed}
                  stroke="#00a97a"
                  strokeDasharray="5 5"
                  strokeOpacity={0.6}
                  label={{ value: avgLabel, position: 'insideTopRight', fill: 'var(--s-text-muted)', fontSize: 10.5, fontWeight: 700 }}
                />
                <Area
                  type="monotone"
                  dataKey="avgSpeed"
                  name={lang === 'ar' ? 'السرعة' : 'Speed'}
                  stroke="#00a97a"
                  strokeWidth={2.5}
                  fill="url(#vehSpeedGrad)"
                  dot={isDaily ? false : { r: 3, strokeWidth: 2, stroke: 'var(--s-panel)', fill: '#00a97a' }}
                  activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--s-panel)', fill: '#00a97a' }}
                  animationDuration={700}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        )}
      </div>
      </>
      )}

    </div>
  )
}
