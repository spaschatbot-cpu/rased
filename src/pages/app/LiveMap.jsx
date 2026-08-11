import { useMemo, useState } from 'react'
import { useMapEvents, Circle, Rectangle, Polyline, Marker, Popup } from 'react-leaflet'
import {
  Search, Eye, EyeOff, Plus, Trash2, Crosshair, Locate, Shapes, Square, Circle as CircleIcon,
  X, Check, ChevronDown, Gauge, MapPin, Clock, Truck,
} from 'lucide-react'
import { useLang } from '../../context/LanguageContext'
import { useFleet } from '../../context/FleetContext'
import { STATUS_COLOR } from '../../data/fleet'
import FleetMap, { pointIcon } from '../../components/map/FleetMap'
import { Button, Input, Badge, StatusPill, Card, Modal, Field, Select, cn } from '../../components/ui'

const STATUS_KEYS = ['all', 'moving', 'idle', 'stopped', 'offline']

export default function LiveMap() {
  const { t, lang, nf, formatDateTime } = useLang()
  const {
    vehicles, counts, selectedId, setSelectedId, selected,
    geofences, addGeofence, removeGeofence,
  } = useFleet()

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [showGeo, setShowGeo] = useState(true)
  const [follow, setFollow] = useState(false)
  const [fitSignal, setFitSignal] = useState(0)
  const [panelOpen, setPanelOpen] = useState(true)
  const [drawMode, setDrawMode] = useState(null) // 'circle' | 'rectangle' | 'polygon'
  const [draftPoints, setDraftPoints] = useState([])
  const [draftRadius, setDraftRadius] = useState(1500)
  const [saveOpen, setSaveOpen] = useState(false)
  const [geoName, setGeoName] = useState('')
  const [geoColor, setGeoColor] = useState('#00c391')
  const [toast, setToast] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return vehicles.filter((v) => {
      if (filter !== 'all' && v.status !== filter) return false
      if (!q) return true
      return (
        v.plate.toLowerCase().includes(q) ||
        v.driverAr.includes(query) ||
        v.driverEn.toLowerCase().includes(q)
      )
    })
  }, [vehicles, filter, query])

  const flash = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2600)
  }

  const startDraw = (mode) => {
    setDrawMode(mode)
    setDraftPoints([])
    setShowGeo(true)
  }
  const cancelDraw = () => {
    setDrawMode(null)
    setDraftPoints([])
  }

  const canSaveDraft =
    (drawMode === 'circle' && draftPoints.length === 1) ||
    (drawMode === 'rectangle' && draftPoints.length === 2) ||
    (drawMode === 'polygon' && draftPoints.length >= 3)

  const commitGeofence = async (e) => {
    e.preventDefault()
    const base = { nameAr: geoName, nameEn: geoName, color: geoColor, type: drawMode }
    const shape =
      drawMode === 'circle'
        ? { ...base, center: draftPoints[0], radius: Number(draftRadius) }
        : drawMode === 'rectangle'
          ? { ...base, bounds: draftPoints }
          : { ...base, path: draftPoints }

    /* the save has to land before the drawing is thrown away — a rejected zone
       used to close the dialog and vanish, leaving the operator to redraw it
       without ever being told why */
    try {
      await addGeofence(shape)
    } catch (err) {
      flash(`${t('map.geofenceFailed')} — ${err.message}`)
      return
    }
    setSaveOpen(false)
    setGeoName('')
    cancelDraw()
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* ── side panel ─────────────────────────────────────────── */}
      <aside
        className={cn(
          'flex shrink-0 flex-col border-e bg-[var(--s-panel)] transition-[width] duration-300',
          panelOpen ? 'w-[340px]' : 'w-0 overflow-hidden',
        )}
      >
        <div className="space-y-3 border-b p-3">
          <Input
            icon={Search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('map.searchVehicle')}
            className="h-10 text-[13px]"
          />
          <div className="flex flex-wrap gap-1.5">
            {STATUS_KEYS.map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={cn(
                  'inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11.5px] font-bold transition-colors',
                  filter === s
                    ? 'border-brand-500 bg-brand-500/12 text-brand-600 dark:text-brand-300'
                    : 'text-muted hover:border-brand-400/40',
                )}
              >
                {s !== 'all' && (
                  <span className="size-1.5 rounded-full" style={{ background: STATUS_COLOR[s] }} />
                )}
                {s === 'all' ? t('common.all') : t(`status.${s}`)}
                <span className="tabular-nums opacity-70">{nf(counts[s])}</span>
              </button>
            ))}
          </div>
        </div>

        {/* vehicle list */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted">{t('common.noData')}</p>
          ) : (
            <ul className="divide-y">
              {filtered.map((v) => (
                <li key={v.id}>
                  <button
                    onClick={() => setSelectedId(v.id)}
                    className={cn(
                      'flex w-full cursor-pointer items-center gap-3 p-3 text-start transition-colors',
                      v.id === selectedId ? 'bg-brand-500/8' : 'hover:bg-[var(--s-panel-2)]',
                    )}
                  >
                    <span
                      className="grid size-9 shrink-0 place-items-center rounded-xl"
                      style={{ background: `${STATUS_COLOR[v.status]}22`, color: STATUS_COLOR[v.status] }}
                    >
                      <Truck size={17} />
                    </span>
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block truncate text-[13px] font-extrabold" dir="ltr">{v.plate}</span>
                      <span className="block truncate text-[11px] text-muted">
                        {lang === 'ar' ? v.driverAr : v.driverEn}
                      </span>
                    </span>
                    <span className="shrink-0 text-end leading-tight">
                      <span className="block text-[13px] font-extrabold tabular-nums">{nf(v.speed)}</span>
                      <span className="block text-[10px] text-muted">{t('common.kmh')}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* geofence panel */}
        <div className="border-t">
          <div className="flex items-center justify-between gap-2 p-3">
            <span className="flex items-center gap-2 text-[13px] font-extrabold">
              <Shapes size={16} className="text-brand-500" />
              {t('map.geofences')}
              <Badge tone="slate">{nf(geofences.length)}</Badge>
            </span>
            <button
              onClick={() => setShowGeo((v) => !v)}
              title={t('map.showGeofences')}
              className="grid size-8 cursor-pointer place-items-center rounded-lg text-muted transition-colors hover:text-brand-500"
            >
              {showGeo ? <Eye size={15} /> : <EyeOff size={15} />}
            </button>
          </div>

          <div className="max-h-36 overflow-y-auto px-3">
            {geofences.length === 0 ? (
              <p className="pb-3 text-[12px] text-muted">{t('map.noGeofences')}</p>
            ) : (
              <ul className="space-y-1.5 pb-3">
                {geofences.map((g) => (
                  <li key={g.id} className="surface-2 flex items-center gap-2.5 rounded-lg px-2.5 py-2">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: g.color }} />
                    <span className="min-w-0 flex-1 truncate text-[12px] font-bold">
                      {lang === 'ar' ? g.nameAr : g.nameEn}
                    </span>
                    <Badge tone="slate" className="shrink-0">{t(`map.${g.type}`)}</Badge>
                    <button
                      onClick={() => removeGeofence(g.id).catch((err) => flash(err.message))}
                      className="shrink-0 cursor-pointer text-muted transition-colors hover:text-[#f4634e]"
                    >
                      <Trash2 size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t p-3">
            {drawMode ? (
              <div className="space-y-2">
                <p className="text-[11.5px] font-bold text-brand-500">
                  {drawMode === 'circle' && `${t('map.circle')} — ${nf(draftPoints.length)}/1`}
                  {drawMode === 'rectangle' && `${t('map.rectangle')} — ${nf(draftPoints.length)}/2`}
                  {drawMode === 'polygon' && `${t('map.polygon')} — ${nf(draftPoints.length)} ⩾ 3`}
                </p>
                {drawMode === 'circle' && (
                  <Input
                    type="number"
                    min="100"
                    step="100"
                    value={draftRadius}
                    onChange={(e) => setDraftRadius(e.target.value)}
                    className="h-9 text-[13px]"
                    placeholder={t('map.radius')}
                  />
                )}
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1" disabled={!canSaveDraft} onClick={() => setSaveOpen(true)}>
                    <Check size={14} />
                    {t('common.save')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={cancelDraw}>
                    <X size={14} />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                <DrawBtn icon={CircleIcon} label={t('map.circle')} onClick={() => startDraw('circle')} />
                <DrawBtn icon={Square} label={t('map.rectangle')} onClick={() => startDraw('rectangle')} />
                <DrawBtn icon={Shapes} label={t('map.polygon')} onClick={() => startDraw('polygon')} />
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* ── map ────────────────────────────────────────────────── */}
      <div className="relative min-w-0 flex-1">
        <FleetMap
          vehicles={filtered}
          selectedId={selectedId}
          onSelect={setSelectedId}
          geofences={geofences}
          showGeofences={showGeo}
          follow={follow}
          fitSignal={fitSignal}
          resizeDeps={[panelOpen]}
        >
          <DrawLayer mode={drawMode} points={draftPoints} setPoints={setDraftPoints} radius={draftRadius} color={geoColor} />
        </FleetMap>

        {/* floating controls — pinned physically top-right so they never collide
            with Leaflet's own layers control (top-left) in either direction */}
        <div className="absolute top-3 right-3 z-[500] flex items-start gap-3">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setPanelOpen((v) => !v)}
              className="glass grid size-10 cursor-pointer place-items-center rounded-xl transition-colors hover:text-brand-500"
              title={t('map.panel')}
            >
              <ChevronDown size={17} className={cn('transition-transform', panelOpen ? 'rotate-90' : '-rotate-90')} />
            </button>
            <button
              onClick={() => setFitSignal((v) => v + 1)}
              className="glass grid size-10 cursor-pointer place-items-center rounded-xl transition-colors hover:text-brand-500"
              title={t('map.fitAll')}
            >
              <Crosshair size={17} />
            </button>
            <button
              onClick={() => setFollow((v) => !v)}
              className={cn(
                'glass grid size-10 cursor-pointer place-items-center rounded-xl transition-colors',
                follow ? 'text-brand-500' : 'hover:text-brand-500',
              )}
              title={follow ? t('map.unfollow') : t('map.follow')}
            >
              <Locate size={17} />
            </button>
          </div>
        </div>

        {/* draw hint */}
        {drawMode && (
          <div className="glass absolute inset-x-0 bottom-4 z-[500] mx-auto w-fit rounded-xl px-4 py-2.5 text-[12.5px] font-bold">
            {t('map.draw')}: {t(`map.${drawMode}`)} — {t('common.select')}
          </div>
        )}

        {/* selected vehicle card */}
        {selected && (
          <Card className="absolute bottom-4 end-4 z-[500] w-72 overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b p-3">
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-extrabold" dir="ltr">{selected.plate}</span>
                <span className="block truncate text-[11px] text-muted">
                  {lang === 'ar' ? selected.driverAr : selected.driverEn}
                </span>
              </span>
              <StatusPill status={selected.status} label={t(`status.${selected.status}`)} />
            </div>
            <div className="grid grid-cols-2 gap-px bg-[var(--s-border)] text-[12px]">
              <MiniCell icon={Gauge} label={t('common.speed')} value={`${nf(selected.speed)} ${t('common.kmh')}`} />
              {/* مركبة لم تُبلّغ قط لا وقت لها ولا عنوان — والفراغ يُقال لا يُملأ */}
              <MiniCell
                icon={Clock}
                label={t('common.lastUpdate')}
                value={
                  selected.lastUpdate
                    ? formatDateTime(selected.lastUpdate, { hour: '2-digit', minute: '2-digit' })
                    : '—'
                }
              />
              <MiniCell
                icon={MapPin}
                label={t('map.address')}
                value={(lang === 'ar' ? selected.addressAr : selected.addressEn) || t('dash.noPosition')}
                className="col-span-2"
              />
            </div>
          </Card>
        )}

        {toast && (
          <div className="absolute inset-x-0 top-20 z-[600] mx-auto w-fit rounded-xl border border-brand-500/35 bg-brand-500/12 px-4 py-2.5 text-[13px] font-bold text-brand-600 backdrop-blur-md dark:text-brand-300">
            {toast}
          </div>
        )}
      </div>

      {/* save geofence modal */}
      <Modal
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        title={t('map.addGeofence')}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSaveOpen(false)}>{t('common.cancel')}</Button>
            <Button type="submit" form="geo-form">{t('common.save')}</Button>
          </>
        }
      >
        <form id="geo-form" onSubmit={commitGeofence} className="space-y-4">
          <Field label={t('map.geofenceName')}>
            <Input required value={geoName} onChange={(e) => setGeoName(e.target.value)} placeholder={t('map.geofenceName')} />
          </Field>
          {drawMode === 'circle' && (
            <Field label={`${t('map.radius')} (m)`}>
              <Input type="number" min="100" value={draftRadius} onChange={(e) => setDraftRadius(e.target.value)} />
            </Field>
          )}
          <div>
            <p className="mb-2 text-xs font-bold text-muted">{t('common.type')}</p>
            <div className="flex gap-2">
              {['#00c391', '#0ea5e9', '#f5b301', '#f4634e', '#a78bfa'].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setGeoColor(c)}
                  className={cn(
                    'size-9 cursor-pointer rounded-xl border-2 transition-transform',
                    geoColor === c ? 'scale-110 border-[var(--s-text)]' : 'border-transparent',
                  )}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
        </form>
      </Modal>

    </div>
  )
}

/* ── helpers ─────────────────────────────────────────────────────── */

function DrawBtn({ icon: Icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="surface-2 flex cursor-pointer flex-col items-center gap-1 rounded-lg py-2 text-[10.5px] font-bold text-muted transition-colors hover:border-brand-400/50 hover:text-brand-500"
    >
      <Icon size={15} />
      {label}
    </button>
  )
}

function MiniCell({ icon: Icon, label, value, className }) {
  return (
    <div className={cn('bg-[var(--s-panel)] p-2.5', className)}>
      <span className="flex items-center gap-1 text-[10px] font-bold text-muted">
        <Icon size={11} />
        {label}
      </span>
      <p className="mt-0.5 truncate font-extrabold">{value}</p>
    </div>
  )
}

/** Collects clicks on the map while a draw mode is active and previews the shape. */
function DrawLayer({ mode, points, setPoints, radius, color }) {
  useMapEvents({
    click(e) {
      if (!mode) return
      const p = { lat: e.latlng.lat, lng: e.latlng.lng }
      if (mode === 'circle') setPoints([p])
      else if (mode === 'rectangle') setPoints((prev) => (prev.length >= 2 ? [p] : [...prev, p]))
      else setPoints((prev) => [...prev, p])
    },
  })

  if (!mode || points.length === 0) return null
  const style = { color, fillColor: color, fillOpacity: 0.12, weight: 2, dashArray: '5 5' }

  return (
    <>
      {points.map((p, i) => (
        <Marker key={`${p.lat}-${p.lng}-${i}`} position={[p.lat, p.lng]} icon={pointIcon(color, 10)} />
      ))}

      {mode === 'circle' && <Circle center={[points[0].lat, points[0].lng]} radius={Number(radius) || 500} pathOptions={style} />}

      {mode === 'rectangle' && points.length === 2 && (
        <Rectangle
          bounds={[
            [points[0].lat, points[0].lng],
            [points[1].lat, points[1].lng],
          ]}
          pathOptions={style}
        />
      )}

      {mode === 'polygon' && points.length >= 2 && (
        <Polyline positions={points.map((p) => [p.lat, p.lng])} pathOptions={style} />
      )}
    </>
  )
}
