import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Gauge, Map as MapIcon, History, FileBarChart, Bell, Settings2, Clock,
  ArrowLeft, ArrowRight,
} from 'lucide-react'
import { useLang } from '../../context/LanguageContext'
import { useFleet } from '../../context/FleetContext'
import { useAuth } from '../../context/AuthContext'
import { TONE_HEX, cn } from '../../components/ui'

/* Ordered for Arabic reading: 1–3 run down the right side, 4–6 down the left.
   `count` is a live figure off the fleet state — only where it means something. */
const MODULES = [
  { to: '/app/dashboard', icon: Gauge, k: 'dashboard', hex: '#2dd4bf', tone: 'brand', row: 0, side: 'start', count: (m) => m.counts.all }, // Soft Teal
  { to: '/app/map', icon: MapIcon, k: 'map', hex: '#60a5fa', tone: 'sky', row: 1, side: 'start', count: (m) => m.counts.moving }, // Calm Blue
  { to: '/app/history', icon: History, k: 'history', hex: '#fbbf24', tone: 'amber', row: 2, side: 'start' }, // Gentle Amber
  { to: '/app/reports', icon: FileBarChart, k: 'reports', hex: '#a78bfa', tone: 'violet', row: 0, side: 'end' }, // Soft Violet
  { to: '/app/alerts', icon: Bell, k: 'alerts', hex: '#f87171', tone: 'red', row: 1, side: 'end', count: (m) => m.unreadCount }, // Muted Red
  { to: '/app/management', icon: Settings2, k: 'manage', hex: '#94a3b8', tone: 'slate', row: 2, side: 'end', count: (m) => m.users.length }, // Slate
]

/* deep end of each pill's gradient — mixed toward ink, not black, so the
   colours stay in the brand family instead of going muddy */
const deepen = (hex) => `color-mix(in srgb, ${hex} 62%, #101a24)`

const STATUSES = ['moving', 'idle', 'stopped', 'offline']
const STATUS_COLOR = { moving: '#00c391', idle: '#f5b301', stopped: '#f4634e', offline: '#8898ac' }

/* the middle row reaches furthest out; the outer rows pull back, which is what
   gives the radial fan its shape */
const ROW_INSET = [46, 0, 46]

export default function ControlCenter() {
  const { t, nf, formatDateTime, isRTL } = useLang()
  const { counts, users, unreadCount, live } = useFleet()
  const { can } = useAuth()
  const metrics = { counts, users, unreadCount }

  /* لوحة الإطلاق تعرض ما مُنح هذا الحساب وحده. بطاقة تفتح على «غير مسموح» تعِد
     بما لا تستطيع الوفاء به، والصفحة نفسها محروسة في المسار على أي حال */
  const allowed = MODULES.filter((m) => can(m.k))

  const rows = [0, 1, 2].map((r) => ({
    end: allowed.find((m) => m.row === r && m.side === 'end'),
    start: allowed.find((m) => m.row === r && m.side === 'start'),
  }))

  /* الأشعّة تُرسم للبطاقات الموجودة فقط — خيط ينتهي إلى فراغ يقرأ كعطل.
     الترتيب في LINKS فيزيائي: أول ثلاثة يمينًا وآخر ثلاثة يسارًا، وجهة
     «البداية» تنقلب مع لغة الواجهة */
  const startBase = isRTL ? 0 : 3
  const endBase = isRTL ? 3 : 0
  const linked = new Set()
  rows.forEach((row, r) => {
    if (row.start) linked.add(startBase + r)
    if (row.end) linked.add(endBase + r)
  })

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-64px)] lg:h-[calc(100dvh-64px)] max-w-[1400px] flex-col px-4 sm:px-6 lg:overflow-hidden">
      {/* ── status line — one quiet row, no cards ───────────────── */}
      <div className="relative flex shrink-0 flex-col items-center justify-center pt-8 sm:pt-12 pb-4 z-10">
        <div className="relative">
          {/* Subtle glow behind the text */}
          <div className="absolute -inset-4 blur-[30px] opacity-25 bg-brand-500 rounded-full" aria-hidden="true" />
          <h1 className="relative text-[26px] font-black tracking-tight sm:text-[36px] text-center bg-clip-text text-transparent bg-gradient-to-b from-[var(--s-text)] to-brand-500 drop-shadow-md">
            {t('cc.tagline')}
          </h1>
        </div>
      </div>

      {/* ── radial launcher (lg and up) ─────────────────────────── */}
      <div className="relative hidden flex-1 flex-col justify-center lg:flex">
        {/* REPLACED: halo behind the vehicle is now a high-tech radar tracker */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 -z-0 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center" aria-hidden="true">
          {/* Radar Cone */}
          <div className="absolute size-[500px] rounded-full radar-cone opacity-40"></div>
          
          {/* Concentric distance rings */}
          <div className="absolute size-[280px] rounded-full border border-brand-500/30 border-dashed glow-brand opacity-50 animate-[spin_40s_linear_infinite]"></div>
          <div className="absolute size-[380px] rounded-full border border-brand-500/20"></div>
          <div className="absolute size-[480px] rounded-full border border-brand-500/10 border-dashed animate-[spin_60s_linear_infinite_reverse]"></div>
          <div className="absolute size-[540px] rounded-full border-t border-b border-brand-500/30 opacity-40 animate-[spin_20s_linear_infinite]"></div>

          {/* Glowing orbit dots */}
          <div className="absolute size-[380px] rounded-full animate-[spin_10s_linear_infinite]">
            <div className="absolute top-[-3px] left-1/2 size-[6px] rounded-full bg-brand-400 shadow-[0_0_10px_var(--color-brand-400)]" />
          </div>
          <div className="absolute size-[480px] rounded-full animate-[spin_15s_linear_infinite_reverse]">
            <div className="absolute bottom-[-3px] left-1/2 size-[6px] rounded-full bg-sky-400 shadow-[0_0_10px_var(--color-sky-400)]" />
          </div>
          
          {/* Crosshairs matching the grid */}
          <div className="absolute h-[700px] w-px bg-gradient-to-b from-transparent via-brand-500/30 to-transparent"></div>
          <div className="absolute w-[1000px] h-px bg-gradient-to-r from-transparent via-brand-500/30 to-transparent"></div>
          
          {/* Angle Indicators */}
          <span className="absolute top-[30px] text-[10px] font-mono text-brand-500/50 font-bold tracking-widest">000°</span>
          <span className="absolute bottom-[30px] text-[10px] font-mono text-brand-500/50 font-bold tracking-widest">180°</span>
          <span className="absolute right-[30px] text-[10px] font-mono text-brand-500/50 font-bold tracking-widest">090°</span>
          <span className="absolute left-[30px] text-[10px] font-mono text-brand-500/50 font-bold tracking-widest">270°</span>

          {/* Target Reticle (Box around the car) */}
          <div className="absolute size-[290px] border border-brand-500/20 rounded-3xl opacity-80 animate-pulse">
            <div className="absolute -top-[2px] -left-[2px] size-6 border-t-2 border-l-2 border-brand-500 rounded-tl-3xl" />
            <div className="absolute -top-[2px] -right-[2px] size-6 border-t-2 border-r-2 border-brand-500 rounded-tr-3xl" />
            <div className="absolute -bottom-[2px] -left-[2px] size-6 border-b-2 border-l-2 border-brand-500 rounded-bl-3xl" />
            <div className="absolute -bottom-[2px] -right-[2px] size-6 border-b-2 border-r-2 border-brand-500 rounded-br-3xl" />
          </div>

          {/* Floating Data Panel (Right) */}
          <div className="absolute top-[8%] start-[65%] bg-[var(--s-panel)]/80 backdrop-blur-xl border border-brand-500/40 px-4 py-3 rounded-2xl shadow-[0_20px_40px_-10px_var(--color-brand-500)] min-w-44 glass">
            <div className="flex items-center gap-2 mb-2">
              <span className="relative flex size-2.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#f5b301] opacity-75" />
                <span className="relative inline-flex size-2.5 rounded-full bg-[#f5b301]" />
              </span>
              <span className="text-[11px] font-extrabold text-[#f5b301] uppercase tracking-widest">{t('status.idle')}</span>
            </div>
            <div className="text-sm font-extrabold text-[var(--s-text)] mb-1" dir="ltr">RSD-1024</div>
            <div className="text-[11px] font-mono text-brand-500/80 tracking-tight leading-relaxed">
              {t('cc.hud.lat')}: 24.7136° N<br />{t('cc.hud.lng')}: 46.6753° E
            </div>
            {/* Animated line extending from panel to car */}
            <div className="absolute top-1/2 end-[100%] w-24 h-[1px] bg-gradient-to-r from-transparent to-brand-500/70 -translate-y-1/2" />
          </div>

          {/* Floating Data Panel (Left) */}
          <div className="absolute bottom-[12%] end-[68%] bg-[var(--s-panel)]/70 backdrop-blur-md border border-sky-500/30 px-3 py-2 rounded-xl shadow-[0_10px_30px_-10px_var(--color-sky-500)] min-w-32 glass">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-[10px] font-mono font-bold">
                <span className="text-muted">{t('cc.hud.sys')}</span>
                <span className="text-sky-400">{t('cc.hud.online')}</span>
              </div>
              <div className="flex items-center justify-between text-[10px] font-mono font-bold">
                <span className="text-muted">{t('cc.hud.gps')}</span>
                <span className="text-brand-400">{t('cc.hud.locked')}</span>
              </div>
            </div>
            {/* Animated line extending from panel to car */}
            <div className="absolute top-1/2 start-[100%] w-16 h-[1px] bg-gradient-to-l from-transparent to-sky-500/50 -translate-y-1/2" />
          </div>
        </div>

        {/* the GPS uplinks that tie every module back to the vehicle */}
        <SignalLinks live={live} linked={linked} />

        <div className="relative space-y-4">
          {rows.map((row, r) => (
            <div key={r} className="grid items-center gap-4" style={{ gridTemplateColumns: '1fr 290px 1fr' }}>
              {/* start-side pill (columns read start → end, so this is column 1) */}
              <div className="flex justify-end" style={{ paddingInlineStart: ROW_INSET[r] }}>
                {row.start && <Pill module={row.start} metrics={metrics} nf={nf} t={t} />}
              </div>

              {/* centre column — the vehicle occupies the middle row */}
              <div className="grid place-items-center">
                {r === 1 && (
                  <FleetVehicle width={250} />
                )}
              </div>

              {/* end-side pill */}
              <div className="flex justify-start" style={{ paddingInlineEnd: ROW_INSET[r] }}>
                {row.end && <Pill module={row.end} metrics={metrics} nf={nf} t={t} />}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── stacked (below lg) ──────────────────────────────────── */}
      <div className="space-y-3 lg:hidden">
        <div className="flex justify-center">
          <FleetVehicle width={200} />
        </div>
        {allowed.map((m) => (
          <Pill key={m.to} module={m} metrics={metrics} nf={nf} t={t} stacked />
        ))}
      </div>
    </div>
  )
}

/* ── uplink geometry ──────────────────────────────────────────────
   The centre column is a fixed 290px with a 16px grid gap, so each numbered
   node sits at a known offset from the vehicle: 145 + 16 + 24 = 185px out,
   and one row step (68px bar + 16px gap = 84px) up or down. */
const LINK_X = 185
const LINK_Y = 84
const CAR_RX = 122 // where a link leaves the vehicle's silhouette
const CAR_RY = 62
const NODE_CLEAR = 31 // stop short of the numbered node

const LINKS = [
  [LINK_X, -LINK_Y], [LINK_X, 0], [LINK_X, LINK_Y],
  [-LINK_X, -LINK_Y], [-LINK_X, 0], [-LINK_X, LINK_Y],
].map(([dx, dy]) => {
  const len = Math.hypot(dx, dy)
  const ux = dx / len
  const uy = dy / len
  /* where the ray crosses the ellipse around the vehicle */
  const tStart = 1 / Math.hypot(ux / CAR_RX, uy / CAR_RY)
  return {
    x1: +(ux * tStart).toFixed(1),
    y1: +(uy * tStart).toFixed(1),
    x2: +(dx - ux * NODE_CLEAR).toFixed(1),
    y2: +(dy - uy * NODE_CLEAR).toFixed(1),
    angle: +((Math.atan2(dy, dx) * 180) / Math.PI).toFixed(1),
  }
})

/** High-tech uplinks running from the vehicle out to each module node. */
function SignalLinks({ live, linked }) {
  return (
    <svg
      className="pointer-events-none absolute left-1/2 top-1/2 z-0 -translate-x-1/2 -translate-y-1/2 overflow-visible"
      width="440"
      height="230"
      viewBox="-220 -115 440 230"
      aria-hidden="true"
    >
      <defs>
        <filter id="link-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {LINKS.map((l, i) => {
        if (!linked.has(i)) return null
        const gradientId = `grad-${i}`;
        const pathData = `M ${l.x1} ${l.y1} L ${l.x2} ${l.y2}`;
        return (
          <g key={gradientId}>
            <defs>
              <linearGradient id={gradientId} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="var(--color-brand-500)" stopOpacity="0" />
                <stop offset="70%" stopColor="var(--color-brand-400)" stopOpacity="0.4" />
                <stop offset="100%" stopColor="var(--color-brand-400)" stopOpacity="0.9" />
              </linearGradient>
            </defs>

            {/* Base gradient track */}
            <path
              d={pathData}
              stroke={`url(#${gradientId})`}
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
            />
            
            {/* Animated dashed overlay for data flow */}
            <path
              d={pathData}
              stroke="var(--color-brand-200)"
              strokeWidth="1.5"
              strokeDasharray="3 12"
              className={live ? 'uplink' : undefined}
              opacity="0.7"
              fill="none"
            />

            {/* Glowing Data Packet that fires continuously */}
            <circle r="2.5" fill="#fff" filter="url(#link-glow)">
              {live && (
                <animateMotion 
                  dur={`${1.8 + (i * 0.15)}s`}
                  repeatCount="indefinite"
                  path={pathData}
                />
              )}
            </circle>

            {/* High-tech arrowhead */}
            <g transform={`translate(${l.x2} ${l.y2}) rotate(${l.angle})`}>
              <path
                d="M -1 0 L -12 -4 L -9 0 L -12 4 Z"
                fill="var(--color-brand-400)"
                filter="url(#link-glow)"
              />
              <circle cx="-1" cy="0" r="1.5" fill="#fff" />
            </g>
          </g>
        );
      })}
    </svg>
  )
}

/** High-tech, theme-adaptive module card with side stroke. */
function Pill({ module: m, metrics, nf, t }) {
  const { isRTL } = useLang()
  const Arrow = isRTL ? ArrowLeft : ArrowRight
  const color = m.hex 
  const value = m.count?.(metrics)

  return (
    <Link
      to={m.to}
      title={t(`cc.${m.k}.d`)}
      className="group flex w-full items-center transition-all duration-500 hover:scale-[1.02] hover:-translate-y-1 focus-visible:outline-none flex-row"
    >
      {/* Icon Node (Always on the Right in RTL) */}
      <span
        className="z-[2] relative grid size-[52px] shrink-0 place-items-center rounded-full bg-[var(--s-panel)]/80 backdrop-blur-md transition-all duration-500 group-hover:shadow-[0_0_30px_-5px_var(--vc)]"
        style={{ border: `2px solid ${color}`, '--vc': color, boxShadow: `0 0 0 4px var(--s-bg)` }}
      >
        <span className="absolute inset-0 rounded-full border border-dashed opacity-50 animate-[spin_10s_linear_infinite]" style={{ borderColor: color }} />
        <span className="absolute inset-1 rounded-full opacity-10 animate-ping" style={{ backgroundColor: color }} />
        <m.icon size={20} strokeWidth={2.5} style={{ color }} />
      </span>

      {/* The Bar */}
      <span
        className="relative flex h-[76px] min-w-0 flex-1 items-center overflow-hidden flex-row backdrop-blur-xl transition-all duration-500 group-hover:shadow-lg bg-[var(--s-panel)]/65"
        style={{
          borderRadius: 16,
          marginInlineStart: -26,
          marginInlineEnd: 0,
          paddingInlineStart: 42,
          paddingInlineEnd: 20,
          border: '1px solid var(--s-border)',
          borderInlineEnd: `5px solid ${color}`, // Colored side stroke
          boxShadow: `0 15px 35px -10px ${color}30, 0 5px 15px rgba(0,0,0,0.08)`,
          '--vc': color
        }}
      >
        {/* Animated sheen sweeping across */}
        <span
          className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-[var(--vc)] to-transparent opacity-0 transition-transform duration-700 ease-in-out group-hover:translate-x-full group-hover:opacity-10"
          aria-hidden="true"
        />

        {/* Diagonal scanlines */}
        <span 
          className="pointer-events-none absolute inset-0 opacity-[0.03] mix-blend-overlay"
          style={{ backgroundImage: 'repeating-linear-gradient(45deg, var(--s-text) 0, var(--s-text) 1px, transparent 1px, transparent 4px)' }} 
        />

        {/* Text */}
        <span className="relative min-w-0 flex-1">
          <span className="block truncate text-[16px] font-black tracking-wide text-[var(--s-text)]">
            {t(`cc.${m.k}.t`)}
          </span>
          <span className="mt-0.5 block truncate text-[11.5px] font-bold tracking-wider text-[var(--s-text-muted)] uppercase">
            {t(`cc.${m.k}.d`)}
          </span>
        </span>

        {/* Action area */}
        <span className="relative flex shrink-0 items-center gap-2 ps-3">
          {value != null && (
            <span className="grid h-7 min-w-[28px] place-items-center rounded-lg bg-[var(--s-panel-2)] border border-[var(--s-border)] px-2 text-[12px] font-black tabular-nums text-[var(--s-text)] shadow-inner">
              {nf(value)}
            </span>
          )}
          <span 
            className="inline-flex h-9 items-center gap-1.5 rounded-xl text-white px-3.5 text-[12px] font-extrabold transition-all duration-300 hover:brightness-110 hover:shadow-[0_0_15px_var(--vc)]" 
            style={{ backgroundColor: color, '--vc': color }}
          >
            <span>{t('cc.goView')}</span>
            <Arrow size={14} />
          </span>
        </span>
      </span>
    </Link>
  )
}

/**
 * Centrepiece vehicle. Uses the photo at `public/vehicle.jpg` when it is
 * present and falls back to the drawn vehicle if it is missing, so the page
 * never breaks on a fresh checkout.
 */
/* Prefers a background-free PNG cutout; falls back to the original photo, then
   to the drawn vehicle. Drop `public/vehicle.png` in and it is used on sight. */
const VEHICLE_SOURCES = ['/vehicle.png', '/vehicle.jpg']

function FleetVehicle({ width = 250 }) {
  const [srcIndex, setSrcIndex] = useState(0)
  const src = VEHICLE_SOURCES[srcIndex]

  if (!src) return <FleetVehicleArt style={{ width }} />

  const next = () => setSrcIndex((i) => i + 1)

  /* a real cutout needs no window or mask — just the shadow under it */
  if (src.endsWith('.png')) {
    return (
      <img
        src={src}
        alt=""
        aria-hidden="true"
        onError={next}
        draggable="false"
        className="block max-w-full select-none object-contain"
        style={{ width, filter: 'drop-shadow(0 22px 26px rgb(11 21 36 / 0.32))' }}
      />
    )
  }

  /* photo fallback: crop tight to the bodywork and dissolve the rim */
  const height = Math.round(width * 0.72)
  const imgWidth = Math.round(width * 1.62)

  return (
    <span
      className="relative block overflow-hidden"
      style={{
        width,
        height,
        maskImage: 'radial-gradient(ellipse 68% 74% at 50% 52%, #000 58%, transparent 97%)',
        WebkitMaskImage: 'radial-gradient(ellipse 68% 74% at 50% 52%, #000 58%, transparent 97%)',
      }}
    >
      <img
        src={src}
        alt=""
        aria-hidden="true"
        onError={next}
        draggable="false"
        className="absolute left-1/2 top-1/2 max-w-none select-none"
        style={{
          width: imgWidth,
          transform: `translate(-50%, calc(-50% + ${Math.round(width * 0.03)}px))`,
          filter: 'contrast(1.06) saturate(1.08)',
        }}
      />
    </span>
  )
}

/** Drawn fallback for the centrepiece. */
function FleetVehicleArt({ style }) {
  return (
    <svg viewBox="0 0 128 64" style={style} aria-hidden="true">
      <defs>
        <linearGradient id="vehBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="52%" stopColor="#e7eef6" />
          <stop offset="100%" stopColor="#c2cfdd" />
        </linearGradient>
        <linearGradient id="vehGlass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0b2233" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#0b2233" stopOpacity="0.55" />
        </linearGradient>
      </defs>

      {/* ground shadow */}
      <ellipse cx="64" cy="55.5" rx="47" ry="3.6" fill="#0b1524" opacity="0.16" />

      {/* body */}
      <path
        d="M9 45c-2.6 0-4.5-1.9-4.5-4.4v-6.2c0-2.9 2-5.2 4.9-5.8l19.4-3.9 13.6-9.6c2.1-1.5 4.2-2.1 6.7-2.1h27.4c3 0 5.4 1 7.5 3.1l10.3 10 15.2 2.7c3.4.6 5.5 2.9 5.5 6v5.8c0 2.5-1.9 4.4-4.5 4.4z"
        fill="url(#vehBody)"
      />
      {/* upper highlight */}
      <path
        d="M29.8 24.7 43.4 15c2.1-1.5 4.2-2.1 6.7-2.1h27.4c3 0 5.4 1 7.5 3.1l2.4 2.3z"
        fill="#fff"
        opacity="0.55"
      />

      {/* glazing */}
      <path d="M48.5 17.5h13.8v9.6H36.2z" fill="url(#vehGlass)" />
      <path d="M67 17.5h10.4c2 0 3.4.5 4.8 1.9l6 7.7H67z" fill="url(#vehGlass)" />

      {/* body crease */}
      <path d="M12 36.5h104" stroke="#0b1524" strokeOpacity="0.14" strokeWidth="1.4" strokeLinecap="round" />

      {/* lamps */}
      <rect x="112.5" y="31.5" width="8" height="5.4" rx="2.4" fill="#00c391" opacity="0.9" />
      <rect x="5.5" y="32.5" width="5.4" height="4.4" rx="2.2" fill="#f4634e" opacity="0.85" />

      {/* wheels */}
      {[38, 96].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy="45" r="11" fill="#0b1524" />
          <circle cx={cx} cy="45" r="10" fill="#1b2b3b" />
          <circle cx={cx} cy="45" r="4.6" fill="#d4e3f0" />
          <circle cx={cx} cy="45" r="1.8" fill="#8fa6bb" />
        </g>
      ))}
    </svg>
  )
}
