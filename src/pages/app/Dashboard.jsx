import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Legend,
} from 'recharts'
import { Gauge, Truck, Activity, Clock, Search, Award, Octagon, WifiOff } from 'lucide-react'
import { useLang } from '../../context/LanguageContext'
import { useFleet } from '../../context/FleetContext'
import { STATUS_COLOR } from '../../data/fleet'
import { useUsage } from '../../lib/useUsage'
import { api } from '../../lib/api'
import { dayBack } from '../../../shared/clock'
import { Card, CardHeader, StatTile, StatusPill, Table, Td, Input, Badge, cn } from '../../components/ui'
import { PageHeader } from '../../layouts/AppLayout'

/** How many days of driving a ranking is built from. */
const SCORE_DAYS = 7

/** The fewest kilometres a vehicle must have driven to be ranked at all. */
const SCORE_MIN_KM = 5

/**
 * A driver's score, from what their vehicle actually did.
 *
 * Speeding episodes per 100 km, turned into a mark out of 100: a clean 100 km
 * is 100, each speeding run inside it costs ten. It is a blunt measure and
 * deliberately so — every part of it is a number the fleet can point at in the
 * speed report and argue with. The score it replaced was `72 + random × 27`,
 * seeded off the vehicle's id, which nobody could argue with because it never
 * meant anything.
 */
const scoreOf = (row) => Math.max(0, Math.round(100 - (row.violations / (row.distance / 100)) * 10))

/** The last seven days of driving, one row per vehicle. Empty until it lands. */
function useDrivingScores() {
  const [rows, setRows] = useState(null)

  useEffect(() => {
    const ctrl = new AbortController()

    api
      .getReport({ type: 'general', from: dayBack(SCORE_DAYS - 1), to: dayBack(0) }, ctrl.signal)
      .then((data) => setRows(data.rows ?? []))
      .catch((err) => {
        if (err.name !== 'AbortError') setRows([])
      })

    return () => ctrl.abort()
  }, [])

  return rows
}

export default function Dashboard() {
  const { t, lang, isRTL, nf, formatDateTime } = useLang()
  const { vehicles, counts, selectedId, setSelectedId } = useFleet()
  const [query, setQuery] = useState('')

  // Recharts lays out LTR by default — flip the axes so charts read right-to-left in Arabic.
  const chartMargin = isRTL ? { top: 4, right: -18, left: 12, bottom: 0 } : { top: 4, right: 12, left: -18, bottom: 0 }
  const yAxisSide = isRTL ? 'right' : 'left'

  /* both charts are totalled from the fleet's recorded trails */
  const { usage } = useUsage(null)
  const speedProfile = usage.speedProfile
  const scoreRows = useDrivingScores()

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return vehicles
    return vehicles.filter(
      (v) =>
        v.plate.toLowerCase().includes(q) ||
        v.driverAr.includes(query) ||
        v.driverEn.toLowerCase().includes(q) ||
        v.modelEn.toLowerCase().includes(q),
    )
  }, [vehicles, query])

  const statusPie = ['moving', 'idle', 'stopped', 'offline'].map((s) => ({
    key: s,
    name: t(`status.${s}`),
    value: counts[s],
    color: STATUS_COLOR[s],
  }))

  /* Only vehicles that actually drove far enough for the ratio to mean
     something are ranked. A vehicle that recorded nothing this week is not a
     perfect driver and not a bad one — it is absent from the list, and the card
     says how many were left out rather than padding itself. */
  const vehicleById = useMemo(() => new Map(vehicles.map((v) => [v.id, v])), [vehicles])
  const topDrivers = useMemo(() => {
    if (!scoreRows) return null
    return scoreRows
      .filter((r) => r.distance >= SCORE_MIN_KM)
      .map((r) => ({ ...r, vehicle: vehicleById.get(r.vehicleId), score: scoreOf(r) }))
      .filter((r) => r.vehicle)
      .sort((a, b) => b.score - a.score || b.distance - a.distance)
      .slice(0, 5)
  }, [scoreRows, vehicleById])

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-4 sm:p-6">
      <PageHeader
        icon={Gauge}
        title={t('dash.title')}
        subtitle={t('dash.subtitle')}
        actions={
          <span className="surface-2 inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold text-muted">
            <Clock size={13} />
            {formatDateTime(new Date())}
          </span>
        }
      />

      {/* KPI row - Fleet Statuses */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile icon={Truck} label={t('dash.kpi.all')} value={nf(counts.all)} tone="sky" />
        <StatTile icon={Activity} label={t('dash.kpi.moving')} value={nf(counts.moving)} tone="brand" />
        <StatTile icon={Clock} label={t('dash.kpi.idle')} value={nf(counts.idle)} tone="amber" />
        <StatTile icon={Octagon} label={t('dash.kpi.stopped')} value={nf(counts.stopped)} tone="red" />
        <StatTile icon={WifiOff} label={t('dash.kpi.offline')} value={nf(counts.offline)} tone="slate" />
      </div>

      {/* charts & alerts */}
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-[1.3fr_1fr_1fr]">
        <Card className="lg:col-span-2 xl:col-span-1">
          {/* المدى يُقال صراحةً: هذا متوسط كل ساعة عبر الأيام المسجّلة، لا
              متوسط اليوم الحالي — والعنوان وحده كان يُقرأ على أنه اليوم */}
          <CardHeader
            title={t('dash.speedProfile')}
            subtitle={usage.days ? t('dash.speedProfile.range').replace('{n}', nf(usage.days)) : ''}
            icon={Gauge}
          />
          <div className="h-72 p-3 pt-5">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={speedProfile} margin={chartMargin}>
                <defs>
                  <linearGradient id="speedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0ea5e9" stopOpacity={1} />
                    <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.15} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 4" stroke="var(--s-border)" opacity={0.4} vertical={false} />
                <XAxis dataKey="hour" tick={AXIS_TICK} axisLine={false} tickLine={false} interval={2} reversed={isRTL} dy={10} />
                <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={54} orientation={yAxisSide} />
                <RTooltip content={<ChartTooltip unit={t('common.kmh')} />} cursor={{ fill: 'var(--s-panel-2)', opacity: 0.5 }} />
                <Bar dataKey="avgSpeed" fill="url(#speedGrad)" radius={[6, 6, 0, 0]} maxBarSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title={t('dash.statusShare')} icon={Truck} tone="sky" />
          <div className="relative h-72 p-3 pt-5">
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-8">
              <span className="text-4xl font-extrabold text-[var(--s-text)]">{vehicles.length}</span>
              <span className="text-[11px] font-bold text-muted">{lang === 'ar' ? 'إجمالي المركبات' : 'Total Vehicles'}</span>
            </div>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <defs>
                  <filter id="pieShadow" x="-10%" y="-10%" width="120%" height="120%">
                    <feDropShadow dx="0" dy="6" stdDeviation="6" floodOpacity="0.15" />
                  </filter>
                </defs>
                <Pie
                  data={statusPie}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="72%"
                  outerRadius="88%"
                  paddingAngle={6}
                  cornerRadius={12}
                  stroke="none"
                  filter="url(#pieShadow)"
                >
                  {statusPie.map((s) => (
                    <Cell key={s.key} fill={s.color} style={{ outline: 'none' }} />
                  ))}
                </Pie>
                <RTooltip content={<ChartTooltip />} cursor={{fill: 'transparent'}} />
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  iconType="circle"
                  formatter={(value) => <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--s-text)' }}>{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader
            title={t('dash.topDrivers')}
            subtitle={t('dash.topDrivers.basis')}
            icon={Award}
            tone="amber"
          />
          <div className="h-72 overflow-y-auto">
            {topDrivers === null && (
              <p className="px-4 py-10 text-center text-[12.5px] font-semibold text-muted">
                {t('common.loading')}
              </p>
            )}

            {topDrivers?.length === 0 && (
              <div className="px-5 py-10 text-center">
                <Award size={26} className="mx-auto text-muted" />
                <p className="mt-3 text-[13px] font-extrabold">{t('dash.topDrivers.none')}</p>
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">
                  {t('dash.topDrivers.noneHint')}
                </p>
              </div>
            )}

            {topDrivers?.length > 0 && (
              <ul className="divide-y divide-[var(--s-border)]">
                {topDrivers.map((row, i) => (
                  <li key={row.vehicleId} className="flex items-center gap-3 px-4 py-3">
                    <span
                      className={cn(
                        'grid size-8 shrink-0 place-items-center rounded-lg text-[12px] font-extrabold',
                        i === 0 ? 'bg-brand-500 text-[#04120c]' : 'bg-[var(--s-panel-2)] text-muted',
                      )}
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block truncate text-[13px] font-extrabold">
                        {lang === 'ar' ? row.vehicle.driverAr : row.vehicle.driverEn}
                      </span>
                      {/* ما بُني عليه الترتيب، لا الرقم وحده */}
                      <span className="block truncate text-[11px] text-muted">
                        <bdi dir="ltr">{row.plate}</bdi> · {nf(row.distance)} {t('common.km')} ·{' '}
                        {nf(row.violations)} {t('dash.topDrivers.violations')}
                      </span>
                    </span>
                    <Badge tone={row.score >= 90 ? 'brand' : row.score >= 75 ? 'sky' : 'amber'}>
                      {nf(row.score)}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>

      {/* vehicles table */}
      <div className="grid gap-4">
        <Card className="overflow-hidden">
          <CardHeader
            title={t('dash.vehiclesList')}
            icon={Truck}
            action={
              <div className="w-48 sm:w-60">
                <Input
                  icon={Search}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('map.searchVehicle')}
                  className="h-9 text-[13px]"
                />
              </div>
            }
          />
          <Table
            columns={[
              { key: 'v', label: t('common.vehicle') },
              { key: 's', label: t('common.status') },
              { key: 'u', label: t('common.lastUpdate') },
              { key: 'sp', label: t('common.speed') },
              { key: 'a', label: lang === 'ar' ? 'إجراءات' : 'Actions', className: 'text-center' },
            ]}
            rows={filtered}
            empty={t('common.noData')}
            activeId={selectedId}
            onRowClick={(row) => setSelectedId(row.id)}
            renderRow={(v) => (
              <>
                <Td>
                  <span className="block text-[13.5px] font-extrabold leading-tight">
                    {lang === 'ar' ? v.driverAr : v.driverEn}
                  </span>
                  <span className="mt-1 block">
                    <bdi
                      dir="ltr"
                      className="inline-flex rounded-md border border-[var(--s-border)] bg-[var(--s-panel-2)] px-1.5 py-px text-[11px] font-bold tracking-wider tabular-nums text-[var(--s-text-muted)]"
                    >
                      {v.plate}
                    </bdi>
                  </span>
                </Td>
                <Td>
                  <StatusPill status={v.status} label={t(`status.${v.status}`)} />
                </Td>
                <Td className="text-[12.5px] font-bold tabular-nums text-[var(--s-text-muted)]">
                  {/* لا وقت مُختلَق لمركبة لم تتحدث قط */}
                  {v.lastUpdate ? formatDateTime(v.lastUpdate) : '—'}
                </Td>
                <Td>
                  <span
                    className={cn(
                      'text-[14px] font-black tabular-nums',
                      v.speed > 0 ? 'text-[var(--s-text)]' : 'text-[var(--s-text-muted)]',
                    )}
                  >
                    {nf(v.speed)}
                  </span>
                  <span className="ms-1 text-[11px] font-bold text-[var(--s-text-muted)]">{t('common.kmh')}</span>
                </Td>
                <Td className="text-center">
                  <Link
                    to={`/app/vehicle/${v.id}`}
                    className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-linear-to-br from-brand-400 to-brand-600 px-4 text-[12px] font-extrabold text-[#04120c] shadow-sm shadow-brand-500/25 transition-all hover:from-brand-300 hover:to-brand-500 hover:shadow-md hover:shadow-brand-400/40"
                  >
                    {lang === 'ar' ? 'عرض التفاصيل' : 'View Details'}
                  </Link>
                </Td>
              </>
            )}
          />
        </Card>

      </div>
    </div>
  )
}

const AXIS_TICK = { fill: 'var(--s-text-muted)', fontSize: 11 }

export function ChartTooltip({ active, payload, label, unit }) {
  if (!active || !payload?.length) return null
  return (
    <div className="surface rounded-xl px-3 py-2 text-[12px]">
      {label && <p className="mb-1 font-extrabold">{label}</p>}
      {payload.map((p) => (
        <p key={p.dataKey ?? p.name} className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ background: p.color ?? p.payload?.color }} />
          <span className="text-muted">{p.name}</span>
          <span className="font-extrabold tabular-nums">
            {p.value} {unit}
          </span>
        </p>
      ))}
    </div>
  )
}

