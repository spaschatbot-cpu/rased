import { useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Circle, Rectangle, Polyline, useMap, LayersControl, ZoomControl } from 'react-leaflet'
import L from 'leaflet'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import { STATUS_COLOR } from '../../data/fleet'
import { useLang } from '../../context/LanguageContext'

export const RIYADH_CENTER = [24.7136, 46.6753]

/* Leaflet's default icon URLs break under bundlers — we only use DivIcons, but
   this keeps any accidental default marker from 404-ing.
   
   Pointed at the package, not at unpkg. The CDN spelling worked, but it meant
   the fallback for "something rendered a marker we did not expect" was itself a
   request to a third party — a fallback that needs the internet to be having a
   good day is not much of a fallback. Vite emits these three from our origin. */
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
})

/** Arrow-in-a-dot icon that rotates with the vehicle heading. */
export function vehicleIcon(vehicle, { active = false, showPlate = true } = {}) {
  const color = STATUS_COLOR[vehicle.status] ?? STATUS_COLOR.offline
  const size = active ? 22 : 16
  return L.divIcon({
    className: 'veh-marker',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `
      <div class="dot" style="background:${color};color:${color};width:${size}px;height:${size}px">
        ${vehicle.status === 'moving' ? '<span class="ring"></span>' : ''}
        <svg viewBox="0 0 24 24" width="${size}" height="${size}" style="position:absolute;inset:0;transform:rotate(${vehicle.heading ?? 0}deg)">
          <path d="M12 4 L16 18 L12 15 L8 18 Z" fill="rgba(4,18,12,.82)"/>
        </svg>
        ${showPlate ? `<span class="plate">${vehicle.plate}</span>` : ''}
      </div>`,
  })
}

export function pointIcon(color = '#00c391', size = 12) {
  return L.divIcon({
    className: 'veh-marker',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div class="dot" style="background:${color};width:${size}px;height:${size}px"></div>`,
  })
}

/** Keeps the viewport pinned to a target position (used for "follow vehicle"). */
export function FollowTarget({ position, zoom, enabled }) {
  const map = useMap()
  useEffect(() => {
    if (!enabled || !position) return
    map.setView(position, zoom ?? map.getZoom(), { animate: true })
  }, [map, enabled, position, zoom])
  return null
}

/** Fits the map to all supplied points whenever `signal` changes. */
export function FitToPoints({ points, signal, padding = 60 }) {
  const map = useMap()
  useEffect(() => {
    if (!points?.length) return
    const bounds = L.latLngBounds(points)
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [padding, padding], maxZoom: 15 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signal])
  return null
}

/** Forces Leaflet to recompute size after layout changes (sidebar collapse etc.). */
export function InvalidateOnResize({ deps = [] }) {
  const map = useMap()
  useEffect(() => {
    const id = setTimeout(() => map.invalidateSize(), 260)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useEffect(() => {
    const onResize = () => map.invalidateSize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [map])
  return null
}

/** Base tile layers — streets + satellite, both key-free. */
export function BaseLayers() {
  const { t } = useLang()
  return (
    // top-left keeps it clear of the page's own floating controls, which sit top-right
    <LayersControl position="topleft">
      <LayersControl.BaseLayer checked name={t('map.streets')}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
      </LayersControl.BaseLayer>
      <LayersControl.BaseLayer name={t('map.satellite')}>
        <TileLayer
          attribution="&copy; Esri, Maxar, Earthstar Geographics"
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          maxZoom={19}
        />
      </LayersControl.BaseLayer>
    </LayersControl>
  )
}

/** Renders geofences of any supported shape. */
export function GeofenceLayer({ geofences, visible = true }) {
  const { lang } = useLang()
  if (!visible) return null

  return (
    <>
      {geofences.map((g) => {
        const label = lang === 'ar' ? g.nameAr : g.nameEn
        const style = { color: g.color, fillColor: g.color, fillOpacity: 0.1, weight: 2, dashArray: '6 6' }

        if (g.type === 'circle') {
          return (
            <Circle key={g.id} center={[g.center.lat, g.center.lng]} radius={g.radius} pathOptions={style}>
              <Popup>{label}</Popup>
            </Circle>
          )
        }
        if (g.type === 'rectangle') {
          return (
            <Rectangle
              key={g.id}
              bounds={[
                [g.bounds[0].lat, g.bounds[0].lng],
                [g.bounds[1].lat, g.bounds[1].lng],
              ]}
              pathOptions={style}
            >
              <Popup>{label}</Popup>
            </Rectangle>
          )
        }
        if (g.type === 'polygon' && g.path?.length) {
          return (
            <Polyline key={g.id} positions={[...g.path.map((p) => [p.lat, p.lng]), [g.path[0].lat, g.path[0].lng]]} pathOptions={style}>
              <Popup>{label}</Popup>
            </Polyline>
          )
        }
        return null
      })}
    </>
  )
}

/**
 * Live fleet map. Consumers own the surrounding layout; this fills its parent.
 */
export default function FleetMap({
  vehicles = [],
  selectedId,
  onSelect,
  geofences = [],
  showGeofences = true,
  follow = false,
  center = RIYADH_CENTER,
  zoom = 11,
  fitSignal,
  resizeDeps = [],
  /* preview mode: no layer switcher, no zoom buttons, no panning */
  controls = true,
  interactive = true,
  children,
}) {
  const { t, lang, formatTime, nf } = useLang()

  /* A vehicle the platform has never heard from has no position, and a map
     cannot draw "somewhere". It is not dropped from the fleet — it is simply
     not on the map, which the lists and counters say plainly. */
  const located = useMemo(
    () => vehicles.filter((v) => Number.isFinite(v.lat) && Number.isFinite(v.lng)),
    [vehicles],
  )

  const selected = useMemo(() => located.find((v) => v.id === selectedId), [located, selectedId])
  const points = useMemo(() => located.map((v) => [v.lat, v.lng]), [located])

  return (
    <MapContainer
      center={center ?? RIYADH_CENTER}
      zoom={zoom}
      className="size-full"
      zoomControl={false}
      dragging={interactive}
      scrollWheelZoom={interactive}
      doubleClickZoom={interactive}
      touchZoom={interactive}
      keyboard={interactive}
    >
      {controls && <ZoomControl position="bottomright" />}
      {controls && <BaseLayers />}
      {!controls && (
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
      )}
      <InvalidateOnResize deps={resizeDeps} />
      {fitSignal != null && <FitToPoints points={points} signal={fitSignal} />}
      {selected && <FollowTarget position={[selected.lat, selected.lng]} zoom={14} enabled={follow} />}

      <GeofenceLayer geofences={geofences} visible={showGeofences} />

      {located.map((v) => (
        <Marker
          key={v.id}
          position={[v.lat, v.lng]}
          icon={vehicleIcon(v, { active: v.id === selectedId })}
          eventHandlers={{ click: () => onSelect?.(v.id) }}
          zIndexOffset={v.id === selectedId ? 1000 : 0}
        >
          <Popup>
            <div className="min-w-44 space-y-1.5">
              <p className="text-[13px] font-extrabold" dir="ltr">{v.plate}</p>
              <p className="text-[11px] opacity-70">{lang === 'ar' ? v.modelAr : v.modelEn}</p>
              <hr className="opacity-20" />
              <p className="text-[11px]">
                <b>{t('common.status')}:</b> {t(`status.${v.status}`)}
              </p>
              <p className="text-[11px]">
                <b>{t('common.speed')}:</b> {nf(v.speed)} {t('common.kmh')}
              </p>
              <p className="text-[11px]">
                <b>{t('common.driver')}:</b> {lang === 'ar' ? v.driverAr : v.driverEn}
              </p>
              <p className="text-[11px]">
                <b>{t('map.address')}:</b> {(lang === 'ar' ? v.addressAr : v.addressEn) || '—'}
              </p>
              {v.lastUpdate && <p className="text-[11px] opacity-70">{formatTime(v.lastUpdate)}</p>}
            </div>
          </Popup>
        </Marker>
      ))}

      {children}
    </MapContainer>
  )
}
