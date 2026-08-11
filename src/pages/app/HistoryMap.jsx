import { useEffect, useMemo, useRef, useState } from 'react'
import { Polyline, Marker, Popup, CircleMarker } from 'react-leaflet'
import {
  History as HistoryIcon, Search, Play, Pause, RotateCcw, Route as RouteIcon,
  Gauge, Clock, MapPin, Flag, ParkingCircle, ChevronsRight,
} from 'lucide-react'
import { useLang } from '../../context/LanguageContext'
import { useFleet } from '../../context/FleetContext'
import { api } from '../../lib/api'
import { measureRun } from '../../../shared/trail-math'
import { dayOf, minutesOf } from '../../../shared/clock'
import FleetMap, { pointIcon, vehicleIcon, FitToPoints } from '../../components/map/FleetMap'
import { Card, CardHeader, Button, Select, Input, Field, Badge, StatTile, Segmented, cn } from '../../components/ui'
import { PageHeader } from '../../layouts/AppLayout'

/* «اليوم» هنا يوم سعودي لا يوم بتوقيت المتصفح — نفس اليوم الذي يخزّن به
   السيرفر المسار، وإلا طلبت الشاشة يومًا وعُرض عليها نصف يوم آخر */
const todayISO = () => dayOf()
const SPEEDS = [1, 2, 4, 8]
const DAY_START = '00:00'
const DAY_END = '23:59'

/** "HH:MM" → دقائق منذ منتصف الليل */
const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm ?? '').split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

export default function HistoryMap() {
  const { t, lang, nf, formatTime, formatDateTime } = useLang()
  const { vehicles } = useFleet()

  const [vehicleId, setVehicleId] = useState(null)
  const [date, setDate] = useState(todayISO())
  const [from, setFrom] = useState(DAY_START)
  const [to, setTo] = useState(DAY_END)
  /* `vehicleId: null` means "the registry has not arrived yet" — the rest of
     the screen still has a date and a window to render its header from */
  const [query, setQuery] = useState({ vehicleId: null, date: todayISO(), from: DAY_START, to: DAY_END, n: 0 })
  const [cursor, setCursor] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [rate, setRate] = useState(2)
  const [tab, setTab] = useState('trips')
  const rafRef = useRef(null)

  /* the recorded trail — no track until the registry has loaded and a search
     has run, so the screen never claims a journey it has not fetched */
  const EMPTY = { points: [], trips: [], stops: [], stats: {} }
  const [history, setHistory] = useState(EMPTY)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  /* pick the first vehicle once the registry arrives, and search it straight
     away so the screen opens on something rather than on a blank map */
  useEffect(() => {
    if (vehicleId != null || !vehicles.length) return
    const first = vehicles[0].id
    setVehicleId(first)
    setQuery((q) => ({ ...q, vehicleId: first }))
  }, [vehicles, vehicleId])

  useEffect(() => {
    if (!query.vehicleId) return undefined
    const ctrl = new AbortController()
    setLoading(true)
    setError(null)

    api
      .getHistory(query.vehicleId, query.date, ctrl.signal)
      .then((day) => setHistory({ points: day.points, trips: day.trips, stops: day.stops, stats: day.stats }))
      .catch((err) => {
        if (err.name === 'AbortError') return
        setHistory(EMPTY)
        setError(err.message)
      })
      .finally(() => setLoading(false))

    return () => ctrl.abort()
    /* eslint-disable-next-line react-hooks/exhaustive-deps -- EMPTY is a constant */
  }, [query])

  const vehicle = useMemo(
    () => vehicles.find((v) => v.id === query.vehicleId),
    [vehicles, query.vehicleId],
  )

  /* نافذة الوقت المختارة: نقاط ورحلات ووقفات وإحصاءات مقصورة على المدى */
  const view = useMemo(() => {
    const pts = history.points
    const fromM = toMinutes(query.from)
    const toM = toMinutes(query.to)
    /* الساعة المختارة ساعة سعودية، فتُقارن بساعة النقطة على نفس التوقيت */
    const inRange = (p) => {
      const m = minutesOf(p.at)
      return m >= fromM && m <= toM
    }

    const start = pts.findIndex(inRange)
    if (start < 0) {
      return { start: 0, points: [], trips: [], stops: [], stats: { totalDistance: 0, maxSpeed: 0 } }
    }
    let end = start
    for (let i = pts.length - 1; i >= start; i--) {
      if (inRange(pts[i])) {
        end = i
        break
      }
    }

    const points = pts.slice(start, end + 1)

    /* القص على حدود النافذة مع الاحتفاظ بالفهارس المطلقة.
       الرحلة المقصوصة تُعاد قياستها لا تُنسخ: نصف رحلة كانت تحتفظ بمسافتها
       كاملة، فتضييق النافذة كان يزيد إجمالي اليوم بدل أن ينقصه. والقياس يجري
       بنفس الحساب الذي يستخدمه السيرفر — من ملف واحد يشتركان فيه. */
    const clip = (segs) =>
      segs
        .filter((s) => s.to >= start && s.from <= end)
        .map((s) => measureRun(pts, Math.max(s.from, start), Math.min(s.to, end), s.moving))

    const trips = clip(history.trips)

    return {
      start,
      end,
      points,
      trips,
      stops: clip(history.stops),
      stats: {
        /* summed from the clipped segments so the figure matches the trips
           listed beside it, rather than being re-derived from a fixed interval
           the recorded points do not actually use */
        totalDistance: Number(trips.reduce((s, seg) => s + seg.distance, 0).toFixed(1)),
        maxSpeed: points.reduce((m, p) => Math.max(m, p.speed), 0),
      },
    }
  }, [history, query.from, query.to])

  const positions = useMemo(() => view.points.map((p) => [p.lat, p.lng]), [view])
  const travelled = useMemo(() => positions.slice(0, cursor + 1), [positions, cursor])
  const current = view.points[Math.min(cursor, view.points.length - 1)]

  /* playback loop */
  useEffect(() => {
    if (!playing) return undefined
    const id = setInterval(() => {
      setCursor((c) => {
        if (c >= view.points.length - 1) {
          setPlaying(false)
          return c
        }
        return c + 1
      })
    }, 220 / rate)
    rafRef.current = id
    return () => clearInterval(id)
  }, [playing, rate, view.points.length])

  const runSearch = () => {
    setQuery({ vehicleId: Number(vehicleId), date, from, to, n: query.n + 1 })
    setCursor(0)
    setPlaying(false)
  }

  const resetTimes = () => {
    setFrom(DAY_START)
    setTo(DAY_END)
  }

  const marker = current
    ? { ...(vehicle ?? {}), plate: vehicle?.plate ?? '', heading: current.heading, status: current.speed > 3 ? 'moving' : 'stopped' }
    : null

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col">
      {/* toolbar */}
      <div className="shrink-0 border-b bg-[var(--s-panel)] p-3 shadow-[var(--s-e1)] sm:p-4">
        <PageHeader
          icon={HistoryIcon}
          tone="amber"
          title={t('hist.title')}
          subtitle={t('hist.subtitle')}
          className="mb-4"
          actions={
            vehicle && (
              <span className="inline-flex items-center gap-2 rounded-xl border border-[var(--s-border)] bg-[var(--s-panel-2)] px-3 py-2 text-[12px] font-bold text-muted">
                <Flag size={14} className="text-amber-500" />
                <bdi dir="ltr" className="font-extrabold text-[var(--s-text)]">{vehicle.plate}</bdi>
                <span className="text-[var(--s-border-strong)]">|</span>
                <span className="tabular-nums">{formatDateTime(query.date, { dateStyle: 'medium' })}</span>
              </span>
            )
          }
        />
        <div className="rounded-2xl border border-[var(--s-border)] bg-[var(--s-panel-2)]/60 p-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_auto]">
            <Field label={t('hist.device')}>
              <Select value={vehicleId ?? ''} onChange={(e) => setVehicleId(Number(e.target.value))}>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.plate} — {lang === 'ar' ? v.driverAr : v.driverEn}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label={t('common.date')}>
              <Input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
            </Field>

            <Field label={lang === 'ar' ? 'من الساعة' : 'From'}>
              <Input type="time" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
            </Field>

            <Field label={lang === 'ar' ? 'إلى الساعة' : 'To'}>
              <Input type="time" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
            </Field>

            <div className="flex items-end gap-2">
              <Button onClick={runSearch} className="w-full sm:w-auto">
                <Search size={16} />
                {t('common.search')}
              </Button>
              <Button
                variant="secondary"
                onClick={resetTimes}
                title={lang === 'ar' ? 'اليوم كامل' : 'Full day'}
                className="shrink-0"
              >
                <RotateCcw size={16} />
              </Button>
            </div>
          </div>

          <p className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] font-bold text-muted">
            <span className="inline-flex items-center gap-1.5">
              <Clock size={13} />
              {lang === 'ar' ? 'النافذة المعروضة' : 'Window'}:
              <span className="tabular-nums text-[var(--s-text)]" dir="ltr">{query.from} – {query.to}</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MapPin size={13} />
              {nf(view.points.length)} {t('hist.points')}
            </span>
          </p>
        </div>
      </div>

      {/* الخريطة يسارًا واللوحة يمينًا في الحالتين (العربية تعكس ترتيب الـ flex) */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row lg:rtl:flex-row-reverse">
        {/* map + timeline */}
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div className="min-h-[64vh] flex-1 lg:min-h-[70vh]">
            <FleetMap
              vehicles={[]}
              center={positions[0] ?? undefined}
              zoom={12}
              resizeDeps={[query.n, tab]}
            >
              <FitToPoints points={positions} signal={query.n} />

              {positions.length > 1 && (
                <>
                  <Polyline positions={positions} pathOptions={{ color: '#8898ac', weight: 3, opacity: 0.45 }} />
                  <Polyline positions={travelled} pathOptions={{ color: '#00c391', weight: 5, opacity: 0.95 }} />
                </>
              )}

              {positions[0] && (
                <Marker position={positions[0]} icon={pointIcon('#0ea5e9', 14)}>
                  <Popup>{t('hist.start')} — {formatTime(view.points[0].at)}</Popup>
                </Marker>
              )}
              {positions.at(-1) && (
                <Marker position={positions.at(-1)} icon={pointIcon('#f4634e', 14)}>
                  <Popup>{t('hist.end')} — {formatTime(view.points.at(-1).at)}</Popup>
                </Marker>
              )}

              {view.stops.map((s, i) => (
                <CircleMarker
                  key={`stop-${i}`}
                  center={[history.points[s.from].lat, history.points[s.from].lng]}
                  radius={6}
                  pathOptions={{ color: '#f5b301', fillColor: '#f5b301', fillOpacity: 0.7, weight: 2 }}
                >
                  <Popup>
                    {t('hist.stop')} {i + 1} — {formatTime(s.startAt)} → {formatTime(s.endAt)}
                  </Popup>
                </CircleMarker>
              ))}

              {marker && current && (
                <Marker position={[current.lat, current.lng]} icon={vehicleIcon(marker, { active: true })} zIndexOffset={1200} />
              )}
            </FleetMap>
          </div>

          {/* timeline bar */}
          <div className="shrink-0 border-t bg-[var(--s-panel)] p-3">
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm" onClick={() => setPlaying((p) => !p)} disabled={view.points.length === 0}>
                {playing ? <Pause size={15} /> : <Play size={15} />}
                {playing ? t('hist.pause') : t('hist.play')}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setCursor(0)
                  setPlaying(false)
                }}
              >
                <RotateCcw size={15} />
                {t('hist.restart')}
              </Button>

              <Segmented
                size="sm"
                value={rate}
                onChange={setRate}
                options={SPEEDS.map((s) => ({ value: s, label: `${s}×` }))}
              />

              <span className="ms-auto flex items-center gap-3 text-[12.5px] font-bold">
                <span className="inline-flex items-center gap-1.5 text-muted">
                  <Clock size={13} />
                  {current ? formatTime(current.at) : '—'}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Gauge size={13} className="text-brand-500" />
                  <span className="tabular-nums">{nf(current?.speed ?? 0)}</span>
                  <span className="text-muted">{t('common.kmh')}</span>
                </span>
              </span>
            </div>

            <input
              type="range"
              min={0}
              max={Math.max(0, view.points.length - 1)}
              value={Math.min(cursor, Math.max(0, view.points.length - 1))}
              onChange={(e) => setCursor(Number(e.target.value))}
              className="mt-3 w-full accent-brand-500"
              aria-label={t('hist.timeline')}
            />
            <div className="mt-1 flex justify-between text-[10.5px] font-bold text-muted">
              <span className="tabular-nums">{view.points[0] ? formatTime(view.points[0].at) : '—'}</span>
              <span className="tabular-nums">
                {nf(Math.min(cursor + 1, view.points.length))} / {nf(view.points.length)} {t('hist.points')}
              </span>
              <span className="tabular-nums">{view.points.at(-1) ? formatTime(view.points.at(-1).at) : '—'}</span>
            </div>
          </div>
        </div>

        {/* side stats */}
        <aside className="w-full shrink-0 space-y-4 overflow-y-auto border-t bg-[var(--s-bg)] p-3 lg:w-[340px] lg:border-l lg:border-t-0">
          <div className="grid grid-cols-2 gap-3">
            <StatTile icon={RouteIcon} label={t('hist.trips')} value={nf(view.trips.length)} tone="brand" />
            <StatTile icon={ParkingCircle} label={t('hist.stops')} value={nf(view.stops.length)} tone="amber" />
            <StatTile icon={MapPin} label={t('rep.totalDistance')} value={nf(view.stats.totalDistance)} unit={t('common.km')} tone="sky" />
            <StatTile icon={Gauge} label={t('hist.maxSpeed')} value={nf(view.stats.maxSpeed)} unit={t('common.kmh')} tone="red" />
          </div>

          <Card className="overflow-hidden border-[var(--s-border-strong)] shadow-[var(--s-e2)]">
            <CardHeader
              title={vehicle?.plate ?? '—'}
              subtitle={`${formatDateTime(query.date, { dateStyle: 'full' })} • ${query.from} – ${query.to}`}
              icon={Flag}
              tone="amber"
              dense
              action={
                <Segmented
                  size="sm"
                  value={tab}
                  onChange={setTab}
                  options={[
                    { value: 'trips', label: t('hist.trips') },
                    { value: 'stops', label: t('hist.stops') },
                  ]}
                />
              }
            />
            <ul className="max-h-[45vh] divide-y overflow-y-auto lg:max-h-none">
              {(tab === 'trips' ? view.trips : view.stops).map((seg, i) => (
                <li key={i}>
                  <button
                    onClick={() => {
                      setCursor(Math.max(0, seg.from - view.start))
                      setPlaying(false)
                    }}
                    className="flex w-full cursor-pointer items-center gap-3 p-3 text-start transition-colors hover:bg-[var(--s-panel-2)]"
                  >
                    <span
                      className={cn(
                        'grid size-8 shrink-0 place-items-center rounded-lg text-[12px] font-extrabold',
                        tab === 'trips' ? 'bg-brand-500/12 text-brand-500' : 'bg-[#f5b301]/14 text-[#c58f00] dark:text-[#f5b301]',
                      )}
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block text-[12.5px] font-extrabold">
                        {formatTime(seg.startAt)}
                        <ChevronsRight size={12} className="mx-1 inline rtl:rotate-180" />
                        {formatTime(seg.endAt)}
                      </span>
                      <span className="block text-[11px] text-muted">
                        {tab === 'trips'
                          ? `${nf(Number(seg.distance.toFixed(1)))} ${t('common.km')} • ${nf(seg.maxSpeed)} ${t('common.kmh')}`
                          : `${nf(seg.durationMin)} ${lang === 'ar' ? 'دقيقة' : 'min'}`}
                      </span>
                    </span>
                    <Badge tone={tab === 'trips' ? 'brand' : 'amber'}>
                      {tab === 'trips' ? t('hist.trip') : t('hist.stop')}
                    </Badge>
                  </button>
                </li>
              ))}
              {(tab === 'trips' ? view.trips : view.stops).length === 0 && (
                <li className="p-8 text-center text-sm text-muted">
                  {loading ? t('common.loading') : error || (history.points.length ? t('common.noData') : t('hist.noTrail'))}
                </li>
              )}
            </ul>
          </Card>
        </aside>
      </div>
    </div>
  )
}
