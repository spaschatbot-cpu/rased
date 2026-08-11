import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
} from 'recharts'
import {
  FileBarChart, Play, Download, FileText, Route as RouteIcon, Gauge, Clock,
  ParkingCircle, TriangleAlert, Thermometer, Check, X, Truck, ChevronDown,
} from 'lucide-react'
import { useLang } from '../../context/LanguageContext'
import { useFleet } from '../../context/FleetContext'
import { api } from '../../lib/api'
import { Card, CardHeader, EmptyState, Button, Input, Field, Table, Td, Badge, StatTile, Segmented, Checkbox, cn } from '../../components/ui'
import { PageHeader } from '../../layouts/AppLayout'
import { exportToPdf } from '../../utils/exporters'
import { ChartTooltip } from './Dashboard'
import { dayBack } from '../../../shared/clock'

/* أيام سعودية — نفس اليوم الذي بُني عليه المسار على السيرفر */
const todayISO = () => dayBack(0)
const shiftISO = (days) => dayBack(days)

const TYPES = ['general', 'driving', 'speed', 'sfda']

/** قائمة منسدلة لاختيار عدة مركبات */
function VehiclePicker({ vehicles, picked, setPicked }) {
  const { t, lang, nf } = useLang()
  const [open, setOpen] = useState(false)
  const box = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => {
      if (box.current && !box.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const allOn = picked.length === vehicles.length
  const toggle = (id) => setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id])

  const label = allOn
    ? `${t('common.all')} — ${nf(vehicles.length)} ${t('common.vehicles')}`
    : picked.length
      ? `${nf(picked.length)} ${t('common.vehicles')}`
      : lang === 'ar' ? 'لم يتم اختيار مركبات' : 'No vehicles selected'

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex h-11 w-full cursor-pointer items-center gap-2 rounded-xl border bg-[var(--s-panel-2)] px-3.5 text-sm font-bold transition-all',
          'focus:border-brand-400 focus:ring-4 focus:ring-brand-400/12 outline-none',
          open && 'border-brand-400 ring-4 ring-brand-400/12',
          picked.length === 0 && 'text-muted',
        )}
      >
        <Truck size={16} className="shrink-0 text-muted" />
        <span className="min-w-0 flex-1 truncate text-start">{label}</span>
        <ChevronDown size={15} className={cn('shrink-0 text-muted transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute z-40 mt-2 w-full overflow-hidden rounded-xl border border-[var(--s-border-strong)] bg-[var(--s-panel)] shadow-[var(--s-e3)]">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--s-border)] bg-[var(--s-panel-2)] px-3 py-2.5">
            <Checkbox
              checked={allOn}
              onChange={(on) => setPicked(on ? vehicles.map((v) => v.id) : [])}
              label={t('common.all')}
            />
            <span className="text-[11.5px] font-bold text-muted">
              <span className="tabular-nums text-[var(--s-text)]">{nf(picked.length)}</span> / {nf(vehicles.length)}
            </span>
          </div>
          <ul className="max-h-60 overflow-y-auto p-1.5">
            {vehicles.map((v) => {
              const on = picked.includes(v.id)
              return (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => toggle(v.id)}
                    className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-start transition-colors hover:bg-[var(--s-panel-2)]"
                  >
                    <span
                      className={cn(
                        'grid size-[18px] shrink-0 place-items-center rounded-md border transition-colors',
                        on ? 'border-brand-500 bg-brand-500 text-[#04120c]' : 'border-[var(--s-border-strong)]',
                      )}
                    >
                      {on && <Check size={12} strokeWidth={4} />}
                    </span>
                    <bdi dir="ltr" className="text-[12.5px] font-extrabold">{v.plate}</bdi>
                    <span className="ms-auto min-w-0 truncate text-[11.5px] font-bold text-muted">
                      {lang === 'ar' ? v.driverAr : v.driverEn}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

export default function Reports() {
  const { t, lang, isRTL, nf } = useLang()
  const { vehicles } = useFleet()

  const [range, setRange] = useState('today')
  const [from, setFrom] = useState(todayISO())
  const [to, setTo] = useState(todayISO())
  const [type, setType] = useState('general')
  const [picked, setPicked] = useState([])
  const [result, setResult] = useState(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState(null)

  /* the registry arrives after the first render, so the default "everything is
     selected" has to follow it rather than being captured at mount */
  const seeded = useRef(false)
  useEffect(() => {
    if (seeded.current || !vehicles.length) return
    seeded.current = true
    setPicked(vehicles.map((v) => v.id))
  }, [vehicles])

  const applyRange = (r) => {
    setRange(r)
    if (r === 'today') { setFrom(todayISO()); setTo(todayISO()) }
    else if (r === 'week') { setFrom(shiftISO(7)); setTo(todayISO()) }
    else if (r === 'month') { setFrom(shiftISO(30)); setTo(todayISO()) }
  }

  /**
   * Run the report on the server.
   *
   * Every figure comes back computed from the trail those vehicles actually
   * recorded, so a range with no reported positions returns no rows — which is
   * the honest answer, and what `unsupported` explains when it is not obvious.
   */
  const run = async () => {
    setRunning(true)
    setError(null)
    try {
      const data = await api.getReport({ type, from, to, vehicles: picked })
      setResult({
        type: data.type,
        from: data.from,
        to: data.to,
        rows: data.rows,
        vehicles: vehicles.filter((v) => data.vehicles.some((x) => x.id === v.id)),
        unsupported: data.unsupported,
      })
    } catch (err) {
      setError(err.message)
      setResult(null)
    } finally {
      setRunning(false)
    }
  }

  const totals = useMemo(() => {
    if (!result || result.type !== 'general') return null
    const r = result.rows
    return {
      distance: r.reduce((s, x) => s + x.distance, 0),
      engineHours: r.reduce((s, x) => s + x.engineHours, 0),
      maxSpeed: r.reduce((m, x) => Math.max(m, x.maxSpeed), 0),
      stops: r.reduce((s, x) => s + x.stops, 0),
      violations: r.reduce((s, x) => s + x.violations, 0),
    }
  }, [result])

  /* أعمدة التصدير — نفس أعمدة الجدول المعروض بعناوينها ووحداتها */
  const exportColumns = (rt) => {
    const minUnit = lang === 'ar' ? 'دقيقة' : 'min'
    const secUnit = lang === 'ar' ? 'ثانية' : 'sec'
    const vehicleCol = { key: 'plate', type: 'text', label: t('common.vehicle') }

    if (rt === 'driving') {
      return [
        vehicleCol,
        { key: 'start', type: 'text', label: t('rep.startTime') },
        { key: 'end', type: 'text', label: t('rep.endTime') },
        { key: 'durationMin', type: 'int', label: `${t('hist.duration')} (${minUnit})` },
        { key: 'distance', type: 'num', label: `${t('rep.distance')} (${t('common.km')})` },
        { key: 'maxSpeed', type: 'int', label: `${t('rep.maxSpeed')} (${t('common.kmh')})` },
        { key: 'stops', type: 'int', label: t('rep.stopsCount') },
      ]
    }
    if (rt === 'speed') {
      return [
        vehicleCol,
        { key: 'at', type: 'text', label: t('common.time') },
        { key: 'speed', type: 'int', label: `${t('common.speed')} (${t('common.kmh')})` },
        { key: 'limit', type: 'int', label: `${t('alert.threshold')} (${t('common.kmh')})` },
        { key: 'durationSec', type: 'int', label: `${t('hist.duration')} (${secUnit})` },
        { key: 'address', type: 'text', label: t('map.address') },
      ]
    }
    if (rt === 'sfda') {
      return [
        vehicleCol,
        { key: 'at', type: 'text', label: t('common.time') },
        { key: 'temperature', type: 'num', label: `${t('rep.temperature')} (°C)` },
        { key: 'humidity', type: 'int', label: '%RH' },
        { key: 'compliance', type: 'text', label: t('rep.compliance') },
      ]
    }
    return [
      vehicleCol,
      { key: 'distance', type: 'num', label: `${t('rep.totalDistance')} (${t('common.km')})` },
      { key: 'engineHours', type: 'num', label: `${t('rep.engineHours')} (${t('common.hours')})` },
      { key: 'maxSpeed', type: 'int', label: `${t('rep.maxSpeed')} (${t('common.kmh')})` },
      { key: 'avgSpeed', type: 'int', label: `${t('rep.avgSpeed')} (${t('common.kmh')})` },
      { key: 'stops', type: 'int', label: t('rep.stopsCount') },
      { key: 'violations', type: 'int', label: t('rep.violations') },
    ]
  }

  /** صفوف جاهزة للتصدير: العنوان حسب اللغة وحالة المطابقة كنص */
  const exportRows = () =>
    (result?.rows ?? []).map((r) => ({
      ...r,
      address: lang === 'ar' ? r.addressAr : r.addressEn,
      compliance: r.compliant === undefined ? '' : r.compliant ? t('rep.compliant') : t('rep.breach'),
    }))

  const exportMeta = () => {
    const cols = exportColumns(result.type)
    const rows = exportRows()
    const summary =
      totals && result.type === 'general'
        ? [
            { label: t('rep.totalDistance'), value: `${nf(Math.round(totals.distance))} ${t('common.km')}` },
            { label: t('rep.engineHours'), value: `${nf(Math.round(totals.engineHours))} ${t('common.hours')}` },
            { label: t('rep.maxSpeed'), value: `${nf(totals.maxSpeed)} ${t('common.kmh')}` },
            { label: t('rep.violations'), value: nf(totals.violations) },
          ]
        : [
            { label: t('rep.rows'), value: nf(rows.length) },
            { label: t('common.vehicles'), value: nf(result.vehicles.length) },
          ]
    return {
      columns: cols,
      rows,
      summary,
      title: `${t('rep.title')} — ${t(`rep.${result.type}`)}`,
      subtitle: `${result.from} → ${result.to} • ${nf(result.vehicles.length)} ${t('common.vehicles')}`,
    }
  }

  const exportCsv = () => {
    if (!result?.rows.length) return
    const { columns, rows } = exportMeta()
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const csv = [
      columns.map((c) => cell(c.label)).join(','),
      ...rows.map((row) => columns.map((c) => cell(row[c.key])).join(',')),
    ].join('\r\n')

    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `mirsad-${result.type}-${result.from}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportPdf = () => {
    if (!result?.rows.length) return
    const { columns, rows, summary, title, subtitle } = exportMeta()
    exportToPdf({
      title,
      subtitle,
      columns,
      rows,
      summary,
      rtl: isRTL,
      brand: lang === 'ar' ? 'مرصاد' : 'Mirsad',
      brandNote: lang === 'ar' ? 'منصة إدارة الأساطيل' : 'Fleet management platform',
      footerNote: `${t(`rep.${result.type}`)} • ${result.from} → ${result.to}`,
    })
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6">
      <PageHeader
        icon={FileBarChart}
        tone="violet"
        eyebrow={t('cc.title')}
        title={t('rep.title')}
        subtitle={t('rep.subtitle')}
        actions={
          result && (
            <>
              <Button
                onClick={exportCsv}
                className="h-12 min-w-40 text-[14.5px] font-black bg-linear-to-br from-brand-400 to-brand-600 text-[#04120c] shadow-lg shadow-brand-500/30 hover:from-brand-300 hover:to-brand-500"
              >
                <Download size={18} />
                {t('rep.exportCsv')}
              </Button>
              <Button
                onClick={exportPdf}
                className="h-12 min-w-40 text-[14.5px] font-black bg-linear-to-br from-[#f4634e] to-[#d93a22] text-white shadow-lg shadow-[#f4634e]/30 hover:from-[#f87a67] hover:to-[#e04b34]"
              >
                <FileText size={18} />
                PDF
              </Button>
            </>
          )
        }
      />

      {/* filters — overflow مرئي و z أعلى حتى تظهر قائمة المركبات فوق بقية البطاقات */}
      <Card
        className="relative z-30 border-[var(--s-border-strong)] shadow-[var(--s-e3)] ring-1 ring-violet-500/10"
        style={{ overflow: 'visible' }}
      >
        <CardHeader
          title={lang === 'ar' ? 'إعداد التقرير' : 'Build a report'}
          subtitle={t('rep.hint')}
          icon={FileBarChart}
          tone="violet"
        />
        <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6 lg:grid-cols-4">
          <Field label={lang === 'ar' ? 'نوع التقرير' : 'Report type'} className="sm:col-span-2">
            <Segmented
              value={type}
              onChange={setType}
              options={TYPES.map((ty) => ({ value: ty, label: t(`rep.${ty}`) }))}
              className="w-full [&>button]:flex-1"
            />
          </Field>

          <Field label={lang === 'ar' ? 'الفترة الزمنية' : 'Date range'} className="sm:col-span-2">
            <Segmented
              value={range}
              onChange={applyRange}
              options={[
                { value: 'today', label: t('common.today') },
                { value: 'week', label: t('common.thisWeek') },
                { value: 'month', label: t('common.thisMonth') },
                { value: 'custom', label: t('common.custom') },
              ]}
              className="w-full [&>button]:flex-1"
            />
          </Field>

          <Field label={t('common.from')}>
            <Input type="date" value={from} max={to} onChange={(e) => { setFrom(e.target.value); setRange('custom') }} />
          </Field>
          <Field label={t('common.to')}>
            <Input type="date" value={to} min={from} max={todayISO()} onChange={(e) => { setTo(e.target.value); setRange('custom') }} />
          </Field>

          <Field label={t('common.vehicles')} className="sm:col-span-2">
            <VehiclePicker vehicles={vehicles} picked={picked} setPicked={setPicked} />
          </Field>
        </div>

        <div className="flex flex-col items-center border-t border-[var(--s-border)] bg-[var(--s-panel-2)]/60 px-5 py-5">
          <Button
            onClick={run}
            disabled={picked.length === 0 || running}
            className="h-12 min-w-64 justify-center text-[15px] shadow-lg shadow-brand-500/25"
          >
            <Play size={18} />
            {running ? t('common.loading') : t('rep.run')}
          </Button>
          {error && (
            <p className="mt-3 text-[12.5px] font-bold text-[#e04b34] dark:text-[#f4634e]">{error}</p>
          )}
        </div>
      </Card>

      {!result ? (
        <Card className="border-dashed border-[var(--s-border-strong)]">
          <EmptyState
            icon={FileBarChart}
            tone="violet"
            title={lang === 'ar' ? 'لا يوجد تقرير بعد' : 'No report yet'}
            desc={lang === 'ar' ? 'اختر النوع والفترة والمركبات ثم اضغط «تنفيذ التقرير».' : 'Pick a type, a range and vehicles, then run the report.'}
          />
        </Card>
      ) : result.rows.length === 0 ? (
        /* An empty report is a real result now: these vehicles recorded nothing
           in this range. Saying so beats an empty table that reads as a bug. */
        <Card className="border-dashed border-[var(--s-border-strong)]">
          <EmptyState
            icon={FileBarChart}
            tone="violet"
            title={lang === 'ar' ? 'لا توجد بيانات مسجَّلة في هذه الفترة' : 'Nothing recorded in this range'}
            desc={
              result.unsupported
                ? lang === 'ar'
                  ? 'تقرير الهيئة يحتاج جهازًا يرسل درجة الحرارة — لا يوجد جهاز كهذا يبثّ حاليًا.'
                  : result.unsupported
                : lang === 'ar'
                  ? 'التقارير تُبنى من المسارات المسجَّلة فعليًا. ابدأ وردية من تطبيق السائق ثم أعد التشغيل.'
                  : 'Reports are built from recorded trails. Start a shift in the driver app, then run it again.'
            }
          />
        </Card>
      ) : (
        <>
          {totals && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <StatTile icon={RouteIcon} label={t('rep.totalDistance')} value={nf(Math.round(totals.distance))} unit={t('common.km')} tone="brand" />
              <StatTile icon={Clock} label={t('rep.engineHours')} value={nf(Math.round(totals.engineHours))} unit={t('common.hours')} tone="sky" />
              <StatTile icon={Gauge} label={t('rep.maxSpeed')} value={nf(totals.maxSpeed)} unit={t('common.kmh')} tone="amber" />
              <StatTile icon={ParkingCircle} label={t('rep.stopsCount')} value={nf(totals.stops)} tone="slate" />
              <StatTile icon={TriangleAlert} label={t('rep.violations')} value={nf(totals.violations)} tone="red" />
            </div>
          )}

          {result.type === 'general' && result.rows.length > 0 && (
            <Card className="overflow-hidden border-[var(--s-border-strong)] shadow-[var(--s-e2)]">
              <CardHeader
                title={t('rep.totalDistance')}
                subtitle={lang === 'ar' ? 'المسافة لكل مركبة خلال الفترة' : 'Distance per vehicle over the range'}
                icon={RouteIcon}
                tone="brand"
                action={
                  <span className="rounded-xl border border-[var(--s-border)] bg-[var(--s-panel-2)] px-3 py-1.5 text-[12px] font-bold text-muted">
                    {lang === 'ar' ? 'الإجمالي' : 'Total'}
                    <span className="ms-1.5 tabular-nums text-[var(--s-text)]">
                      {nf(Math.round(totals?.distance ?? 0))} {t('common.km')}
                    </span>
                  </span>
                }
              />
              <div className="h-64 p-3 pt-5">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={result.rows}
                    margin={isRTL ? { top: 4, right: -18, left: 12, bottom: 0 } : { top: 4, right: 12, left: -18, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 6" stroke="var(--s-border)" vertical={false} />
                    <XAxis dataKey="plate" tick={{ fill: 'var(--s-text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} reversed={isRTL} />
                    <YAxis tick={{ fill: 'var(--s-text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} width={54} orientation={isRTL ? 'right' : 'left'} />
                    <RTooltip content={<ChartTooltip unit={t('common.km')} />} cursor={{ fill: 'var(--s-panel-2)' }} />
                    <Bar dataKey="distance" fill="#00c391" radius={[6, 6, 0, 0]} maxBarSize={44} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          <Card className="overflow-hidden border-[var(--s-border-strong)] shadow-[var(--s-e2)]">
            <CardHeader
              title={`${t('rep.result')} — ${t(`rep.${result.type}`)}`}
              subtitle={`${result.from} → ${result.to} • ${nf(result.rows.length)} ${t('rep.rows')}`}
              icon={FileBarChart}
              tone="violet"
            />
            <ReportTable type={result.type} rows={result.rows} />
          </Card>
        </>
      )}
    </div>
  )
}

function ReportTable({ type, rows }) {
  const { t, lang, nf } = useLang()

  if (type === 'driving') {
    return (
      <Table
        columns={[
          { key: 'p', label: t('common.vehicle') },
          { key: 's', label: t('rep.startTime') },
          { key: 'e', label: t('rep.endTime') },
          { key: 'd', label: t('hist.duration') },
          { key: 'k', label: t('rep.distance') },
          { key: 'm', label: t('rep.maxSpeed') },
          { key: 'st', label: t('rep.stopsCount') },
        ]}
        rows={rows}
        empty={t('common.noData')}
        renderRow={(r) => (
          <>
            <Td>
              <bdi
                dir="ltr"
                className="inline-flex rounded-md border border-[var(--s-border)] bg-[var(--s-panel-2)] px-2 py-0.5 text-[12px] font-extrabold tracking-wider tabular-nums"
              >
                {r.plate}
              </bdi>
            </Td>
            <Td className="tabular-nums font-bold text-muted">{r.start}</Td>
            <Td className="tabular-nums font-bold text-muted">{r.end}</Td>
            <Td className="tabular-nums font-bold">
              {nf(r.durationMin)}
              <span className="ms-1 text-[11px] font-bold text-muted">{lang === 'ar' ? 'د' : 'min'}</span>
            </Td>
            <Td className="tabular-nums font-black">
              {nf(r.distance)}
              <span className="ms-1 text-[11px] font-bold text-muted">{t('common.km')}</span>
            </Td>
            <Td className="tabular-nums font-bold">
              {nf(r.maxSpeed)}
              <span className="ms-1 text-[11px] font-bold text-muted">{t('common.kmh')}</span>
            </Td>
            <Td className="tabular-nums font-bold text-muted">{nf(r.stops)}</Td>
          </>
        )}
      />
    )
  }

  if (type === 'speed') {
    return (
      <Table
        columns={[
          { key: 'p', label: t('common.vehicle') },
          { key: 't', label: t('common.time') },
          { key: 's', label: t('common.speed') },
          { key: 'l', label: t('alert.threshold') },
          { key: 'd', label: t('hist.duration') },
          { key: 'a', label: t('map.address') },
        ]}
        rows={rows}
        empty={t('common.noData')}
        renderRow={(r) => (
          <>
            <Td>
              <bdi
                dir="ltr"
                className="inline-flex rounded-md border border-[var(--s-border)] bg-[var(--s-panel-2)] px-2 py-0.5 text-[12px] font-extrabold tracking-wider tabular-nums"
              >
                {r.plate}
              </bdi>
            </Td>
            <Td className="tabular-nums font-bold text-muted">{r.at}</Td>
            <Td>
              <Badge tone="red">{nf(r.speed)} {t('common.kmh')}</Badge>
            </Td>
            <Td className="tabular-nums font-bold text-muted">
              {nf(r.limit)}
              <span className="ms-1 text-[11px]">{t('common.kmh')}</span>
            </Td>
            <Td className="tabular-nums font-bold">
              {nf(r.durationSec)}
              <span className="ms-1 text-[11px] font-bold text-muted">{lang === 'ar' ? 'ث' : 's'}</span>
            </Td>
            <Td className="max-w-56 truncate text-[12.5px] font-bold text-muted">
              {lang === 'ar' ? r.addressAr : r.addressEn}
            </Td>
          </>
        )}
      />
    )
  }

  if (type === 'sfda') {
    return (
      <Table
        columns={[
          { key: 'p', label: t('common.vehicle') },
          { key: 't', label: t('common.time') },
          { key: 'c', label: t('rep.temperature') },
          { key: 'h', label: '%RH' },
          { key: 'x', label: t('rep.compliance') },
        ]}
        rows={rows}
        empty={t('common.noData')}
        renderRow={(r) => (
          <>
            <Td>
              <bdi
                dir="ltr"
                className="inline-flex rounded-md border border-[var(--s-border)] bg-[var(--s-panel-2)] px-2 py-0.5 text-[12px] font-extrabold tracking-wider tabular-nums"
              >
                {r.plate}
              </bdi>
            </Td>
            <Td className="tabular-nums font-bold text-muted">{r.at}</Td>
            <Td>
              <span className="inline-flex items-center gap-1.5 font-black tabular-nums">
                <Thermometer size={14} className={r.compliant ? 'text-brand-500' : 'text-[#f4634e]'} />
                {r.temperature}
                <span className="text-[11px] font-bold text-muted">°C</span>
              </span>
            </Td>
            <Td className="tabular-nums font-bold text-muted">{nf(r.humidity)}</Td>
            <Td>
              <Badge tone={r.compliant ? 'brand' : 'red'}>
                {r.compliant ? <Check size={12} /> : <X size={12} />}
                {r.compliant ? t('rep.compliant') : t('rep.breach')}
              </Badge>
            </Td>
          </>
        )}
      />
    )
  }

  return (
    <Table
      columns={[
        { key: 'p', label: t('common.vehicle') },
        { key: 'd', label: t('rep.totalDistance') },
        { key: 'e', label: t('rep.engineHours') },
        { key: 'm', label: t('rep.maxSpeed') },
        { key: 'a', label: t('rep.avgSpeed') },
        { key: 's', label: t('rep.stopsCount') },
        { key: 'v', label: t('rep.violations') },
      ]}
      rows={rows}
      empty={t('common.noData')}
      renderRow={(r) => (
        <>
          <Td>
            <bdi
              dir="ltr"
              className="inline-flex rounded-md border border-[var(--s-border)] bg-[var(--s-panel-2)] px-2 py-0.5 text-[12px] font-extrabold tracking-wider tabular-nums"
            >
              {r.plate}
            </bdi>
          </Td>
          <Td className="tabular-nums font-black">
            {nf(r.distance)}
            <span className="ms-1 text-[11px] font-bold text-muted">{t('common.km')}</span>
          </Td>
          <Td className="tabular-nums font-bold">
            {nf(r.engineHours)}
            <span className="ms-1 text-[11px] font-bold text-muted">{t('common.hours')}</span>
          </Td>
          <Td className="tabular-nums font-bold">
            {nf(r.maxSpeed)}
            <span className="ms-1 text-[11px] font-bold text-muted">{t('common.kmh')}</span>
          </Td>
          <Td className="tabular-nums font-bold text-muted">{nf(r.avgSpeed)}</Td>
          <Td className="tabular-nums font-bold text-muted">{nf(r.stops)}</Td>
          <Td>
            {r.violations > 0 ? <Badge tone="red">{nf(r.violations)}</Badge> : <span className="text-muted">—</span>}
          </Td>
        </>
      )}
    />
  )
}
