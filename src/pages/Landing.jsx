import { useState } from 'react'
import {
  MapPin, Shield, Route, BellRing, FileBarChart, Fuel,
  Truck, Package, HardHat, CarFront, Check, Plus, Minus, ArrowLeft, ArrowRight,
  Phone, Mail, MapPinned, Activity, Gauge, Satellite,
} from 'lucide-react'
import { useLang } from '../context/LanguageContext'
import { useSite } from '../context/SiteContentContext'
import { api } from '../lib/api'
import { Button, Card, Reveal, SectionHeading, Input, Textarea, Select, Field, cn } from '../components/ui'

/** Section id → component, driven by the super-admin's order and visibility. */
const SECTION_VIEWS = {
  hero: Hero,
  features: Features,
  solutions: Solutions,
  how: HowItWorks,
  pricing: Pricing,
  apps: AppsSection,
  faq: Faq,
  contact: Contact,
  cta: FinalCta,
}

export default function Landing() {
  const { visibleSections } = useSite()
  return (
    <>
      {visibleSections.map((id) => {
        const View = SECTION_VIEWS[id]
        return View ? <View key={id} /> : null
      })}
    </>
  )
}

/* ══════════════════════════════════════════════════════════════════
   HERO
   ══════════════════════════════════════════════════════════════════ */
function Hero() {
  const { t, isRTL } = useLang()
  const Arrow = isRTL ? ArrowLeft : ArrowRight

  return (
    <section className="relative flex min-h-[calc(100svh-5rem)] items-start overflow-hidden">
      <HeroBackdrop />

      <div className="relative mx-auto w-full max-w-5xl px-4 pt-12 pb-28 text-center sm:px-6 lg:pt-16">
        <Reveal>
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/10 px-4 py-2 text-xs font-extrabold text-brand-600 backdrop-blur-sm dark:text-brand-300">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-400 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-brand-500" />
            </span>
            {t('hero.badge')}
          </span>
        </Reveal>

        <Reveal delay={80}>
          {/* one line from `sm` up; only the narrowest screens wrap it */}
          <h1 className="mt-7 text-4xl font-extrabold leading-[1.15] tracking-tight sm:whitespace-nowrap sm:text-5xl lg:text-6xl xl:text-7xl">
            {t('hero.title1')} <span className="brand-gradient-text">{t('hero.title2')}</span>
          </h1>
        </Reveal>

        <Reveal delay={160}>
          <p className="mx-auto mt-7 max-w-2xl text-[16px] leading-relaxed text-muted sm:text-[18px]">
            {t('hero.desc')}
          </p>
        </Reveal>

        <Reveal delay={240}>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Button to="/login" size="lg" className="shadow-xl shadow-brand-500/25">
              {t('hero.cta')}
              <Arrow size={17} />
            </Button>
            <Button href="#features" variant="outline" size="lg" className="backdrop-blur-sm">
              {t('hero.cta2')}
            </Button>
          </div>
        </Reveal>

        {/* live proof — the numbers that make the claim above credible */}
        <Reveal delay={300}>
          <div className="mx-auto mt-12 flex max-w-2xl flex-wrap items-center justify-center gap-3">
            {[
              { icon: Satellite, value: t('stat.satsVal'), label: t('stat.sats') },
              { icon: Gauge, value: t('stat.uptimeVal'), label: t('stat.uptime') },
              { icon: Activity, value: t('stat.refreshVal'), label: t('stat.refresh') },
            ].map((s) => (
              <span
                key={s.label}
                className="glass inline-flex items-center gap-2.5 rounded-2xl px-4 py-2.5 shadow-sm"
              >
                <s.icon size={16} className="shrink-0 text-brand-500" />
                <span className="text-sm font-extrabold tabular-nums">{s.value}</span>
                <span className="text-[11px] font-bold text-muted">{s.label}</span>
              </span>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  )
}

/**
 * Full-bleed animated hero backdrop.
 * Four stacked layers — drifting light, a panning map grid, a telemetry
 * network with vehicles running its routes, and a fade into the next
 * section. Purely decorative: no pointer events, and the global
 * prefers-reduced-motion rule freezes every animation here.
 */
function HeroBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* wash that keeps the whole stage slightly warmer than the page */}
      <div className="absolute inset-0 bg-linear-to-b from-brand-500/6 via-transparent to-transparent" />

      {/* drifting light sources */}
      <div
        className="hero-orb -top-48 start-[8%] size-[46rem] bg-brand-500/20 blur-[140px]"
        style={{ animation: 'orb-a 22s ease-in-out infinite' }}
      />
      <div
        className="hero-orb -top-32 end-[4%] size-[38rem] bg-accent-500/16 blur-[130px]"
        style={{ animation: 'orb-b 28s ease-in-out infinite' }}
      />
      <div
        className="hero-orb bottom-[-14rem] start-[26%] size-[34rem] bg-brand-400/14 blur-[120px]"
        style={{ animation: 'orb-c 34s ease-in-out infinite' }}
      />

      {/* the map: streets, blocks, districts, live routes and vehicles */}
      <TelemetryNetwork />

      {/* let the section below start clean */}
      <div className="absolute inset-x-0 bottom-0 h-40 bg-linear-to-b from-transparent to-[var(--s-bg)]" />
    </div>
  )
}

/* Street layout for the backdrop map — irregular on purpose, since an even
   grid reads as graph paper rather than a city. */
const H_ROADS = [70, 168, 262, 344, 452, 548]
const V_ROADS = [96, 232, 388, 560, 726, 884, 1046, 1214, 1362]
const ARTERIALS = { h: [262, 452], v: [388, 884] }

/** City blocks — one inset rounded rect per grid cell, some left empty. */
function CityBlocks() {
  const blocks = []
  for (let i = 0; i < V_ROADS.length - 1; i += 1) {
    for (let j = 0; j < H_ROADS.length - 1; j += 1) {
      /* deterministic gaps so the skyline isn't a solid mat of rectangles */
      if ((i * 3 + j * 7) % 5 === 0) continue
      const x = V_ROADS[i] + 9
      const y = H_ROADS[j] + 9
      blocks.push(
        <rect
          key={`${i}-${j}`}
          x={x}
          y={y}
          width={V_ROADS[i + 1] - V_ROADS[i] - 18}
          height={H_ROADS[j + 1] - H_ROADS[j] - 18}
          rx="6"
          fill="currentColor"
          fillOpacity={0.05 + ((i + j) % 3) * 0.018}
        />,
      )
    }
  }
  return <g className="text-[var(--s-text-muted)]">{blocks}</g>
}

/**
 * The details that make a drawing read as a map rather than a diagram:
 * dropped pins, a compass rose, a scale bar and coordinate ticks.
 */
function MapFurniture() {
  const pins = [
    [232, 168], [726, 452], [1214, 262], [96, 344], [1046, 548],
  ]

  return (
    <g>
      {/* dropped pins */}
      {pins.map(([x, y], i) => (
        <g key={`${x}-${y}`} transform={`translate(${x} ${y})`}>
          <ellipse cx="0" cy="3" rx="7" ry="2.5" fill="#0b1524" fillOpacity="0.12" />
          <path
            d="M0 -30a10.5 10.5 0 0 0-10.5 10.5C-10.5 -12 0 0 0 0s10.5-12 10.5-19.5A10.5 10.5 0 0 0 0 -30Z"
            fill={i % 3 === 1 ? '#38bdf8' : '#00c391'}
            fillOpacity="0.85"
          />
          <circle cx="0" cy="-19.5" r="3.8" fill="var(--s-panel)" />
        </g>
      ))}

      {/* compass rose */}
      <g transform="translate(1330 116)" className="text-[var(--s-text-muted)]">
        <circle r="26" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.5" />
        <circle r="19" fill="none" stroke="currentColor" strokeOpacity="0.14" strokeWidth="1" />
        <path d="M0 -20 L6 0 L0 20 L-6 0 Z" fill="#00c391" fillOpacity="0.5" />
        <path d="M0 -20 L6 0 L-6 0 Z" fill="#00c391" fillOpacity="0.9" />
        <text
          x="0"
          y="-30"
          textAnchor="middle"
          fill="currentColor"
          fillOpacity="0.5"
          fontSize="11"
          fontWeight="800"
        >
          N
        </text>
      </g>

      {/* scale bar */}
      <g transform="translate(72 578)" className="text-[var(--s-text-muted)]">
        <path d="M0 0 v8 M0 8 h120 M120 0 v8 M60 3 v5" stroke="currentColor" strokeOpacity="0.35" strokeWidth="2" fill="none" />
        <text x="60" y="-4" textAnchor="middle" fill="currentColor" fillOpacity="0.45" fontSize="11" fontWeight="700">
          5 km
        </text>
      </g>

      {/* coordinate ticks along the frame */}
      <g className="text-[var(--s-text-muted)]" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2">
        {[160, 320, 480, 640, 800, 960, 1120, 1280].map((x) => (
          <line key={`tx${x}`} x1={x} y1="0" x2={x} y2="9" />
        ))}
        {[120, 240, 360, 480].map((y) => (
          <line key={`ty${y}`} x1="0" y1={y} x2="9" y2={y} />
        ))}
      </g>
    </g>
  )
}

/** The full backdrop map: streets, blocks, districts, live routes, vehicles. */
function TelemetryNetwork() {
  /* kept in sync with the `d` strings below — nodes sit on the routes */
  const nodes = [
    [120, 470], [300, 380], [470, 300], [660, 250], [880, 330],
    [1060, 210], [1240, 300], [220, 200], [1340, 470],
  ]

  return (
    <svg
      viewBox="0 0 1440 620"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 size-full opacity-90"
      style={{ maskImage: 'radial-gradient(ellipse 52% 54% at 50% 34%, transparent 8%, #000 78%)' }}
    >
      <defs>
        <linearGradient id="heroRoute" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#00c391" stopOpacity="0" />
          <stop offset="45%" stopColor="#00c391" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.7" />
        </linearGradient>
        <linearGradient id="heroRoute2" x1="1" y1="0" x2="0" y2="0">
          <stop offset="0%" stopColor="#38bdf8" stopOpacity="0" />
          <stop offset="50%" stopColor="#38bdf8" stopOpacity="0.65" />
          <stop offset="100%" stopColor="#00c391" stopOpacity="0.55" />
        </linearGradient>
        {/* radar wedge that sweeps the dispatch hub */}
        <linearGradient id="heroSweep" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#00c391" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#00c391" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* ── the map itself ─────────────────────────────────────── */}
      <CityBlocks />

      {/* districts — the green belt and the water body give the map a place */}
      <g className="text-[var(--s-text-muted)]">
        <path
          d="M232 344 h156 v108 h-156 z"
          fill="#00c391"
          fillOpacity="0.07"
          stroke="#00c391"
          strokeOpacity="0.18"
        />
        <path
          d="M1046 70 h168 v92 h-168 z"
          fill="#00c391"
          fillOpacity="0.06"
          stroke="#00c391"
          strokeOpacity="0.16"
        />
        <path
          d="M560 548 q 90 -34 166 -6 t 158 6 v 72 h-324 z"
          fill="#38bdf8"
          fillOpacity="0.09"
          stroke="#38bdf8"
          strokeOpacity="0.18"
        />
      </g>

      {/* street grid — arterials thicker than the side streets */}
      <g className="text-[var(--s-text-muted)]" strokeLinecap="round">
        {H_ROADS.map((y) => (
          <line
            key={`h${y}`}
            x1="-20"
            y1={y}
            x2="1460"
            y2={y}
            stroke="currentColor"
            strokeOpacity={ARTERIALS.h.includes(y) ? 0.3 : 0.16}
            strokeWidth={ARTERIALS.h.includes(y) ? 6 : 2}
          />
        ))}
        {V_ROADS.map((x) => (
          <line
            key={`v${x}`}
            x1={x}
            y1="-20"
            x2={x}
            y2="640"
            stroke="currentColor"
            strokeOpacity={ARTERIALS.v.includes(x) ? 0.3 : 0.16}
            strokeWidth={ARTERIALS.v.includes(x) ? 6 : 2}
          />
        ))}
        {/* the ring road that cuts the grid on the diagonal */}
        <path
          d="M-20 610 L 420 300 L 900 372 L 1460 96"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.24"
          strokeWidth="5"
        />
      </g>

      <MapFurniture />

      {/* roundabouts where the arterials cross */}
      {ARTERIALS.v.flatMap((x) =>
        ARTERIALS.h.map((y) => (
          <g key={`r${x}-${y}`} className="text-[var(--s-text-muted)]">
            <circle cx={x} cy={y} r="17" fill="none" stroke="currentColor" strokeOpacity="0.28" strokeWidth="5" />
            <circle cx={x} cy={y} r="6" fill="currentColor" fillOpacity="0.12" />
          </g>
        )),
      )}

      {/* dispatch hub with a slow radar sweep */}
      <g>
        <circle cx="388" cy="262" r="120" fill="none" stroke="#00c391" strokeOpacity="0.12" strokeWidth="1" />
        <circle cx="388" cy="262" r="72" fill="none" stroke="#00c391" strokeOpacity="0.14" strokeWidth="1" />
        <path d="M388 262 L 388 142 A 120 120 0 0 1 490 200 Z" fill="url(#heroSweep)">
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 388 262"
            to="360 388 262"
            dur="7s"
            repeatCount="indefinite"
          />
        </path>
      </g>

      {/* ── live layer ─────────────────────────────────────────── */}
      {/* route A — the long haul across the stage */}
      <path
        id="heroPathA"
        d="M-60 470 Q 180 500 300 380 T 660 250 Q 860 210 880 330 T 1240 300 Q 1400 280 1500 380"
        fill="none"
        stroke="url(#heroRoute)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M-60 470 Q 180 500 300 380 T 660 250 Q 860 210 880 330 T 1240 300 Q 1400 280 1500 380"
        fill="none"
        stroke="#00c391"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="14 250"
        style={{ animation: 'dash-flow 3.2s linear infinite' }}
      />

      {/* route B — a shorter northern run */}
      <path
        id="heroPathB"
        d="M-40 180 Q 160 120 380 190 T 780 120 Q 1010 70 1180 190 T 1500 150"
        fill="none"
        stroke="url(#heroRoute2)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M-40 180 Q 160 120 380 190 T 780 120 Q 1010 70 1180 190 T 1500 150"
        fill="none"
        stroke="#38bdf8"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="10 240"
        style={{ animation: 'dash-flow 4.6s linear infinite', animationDelay: '-1.5s' }}
      />

      {/* geofences */}
      <circle cx="660" cy="250" r="74" fill="#00c391" fillOpacity="0.05" stroke="#00c391" strokeOpacity="0.28" strokeWidth="1.5" strokeDasharray="6 8">
        <animateTransform attributeName="transform" type="rotate" from="0 660 250" to="360 660 250" dur="40s" repeatCount="indefinite" />
      </circle>
      <circle cx="1060" cy="210" r="52" fill="#38bdf8" fillOpacity="0.05" stroke="#38bdf8" strokeOpacity="0.26" strokeWidth="1.5" strokeDasharray="5 7">
        <animateTransform attributeName="transform" type="rotate" from="360 1060 210" to="0 1060 210" dur="32s" repeatCount="indefinite" />
      </circle>

      {/* waypoint beacons — each breathes on its own offset */}
      {nodes.map(([cx, cy], i) => (
        <g key={`${cx}-${cy}`}>
          <circle cx={cx} cy={cy} r="14" fill="#00c391" fillOpacity="0.1">
            <animate
              attributeName="fill-opacity"
              values="0.14;0.02;0.14"
              dur={`${3.6 + (i % 4) * 0.7}s`}
              repeatCount="indefinite"
            />
          </circle>
          <circle cx={cx} cy={cy} r="3.5" fill="#00c391" fillOpacity="0.75" />
        </g>
      ))}

      {/* vehicles running the routes */}
      {[
        { path: 'heroPathA', dur: '17s', begin: '0s', color: '#00c391' },
        { path: 'heroPathA', dur: '17s', begin: '-8.5s', color: '#00c391' },
        { path: 'heroPathB', dur: '21s', begin: '-4s', color: '#38bdf8' },
      ].map((v, i) => (
        <g key={i}>
          <circle r="12" fill={v.color} fillOpacity="0.16">
            <animateMotion dur={v.dur} begin={v.begin} repeatCount="indefinite">
              <mpath href={`#${v.path}`} />
            </animateMotion>
          </circle>
          <circle r="5" fill={v.color}>
            <animateMotion dur={v.dur} begin={v.begin} repeatCount="indefinite">
              <mpath href={`#${v.path}`} />
            </animateMotion>
          </circle>
        </g>
      ))}
    </svg>
  )
}

/**
 * Abstract road network with a marker parked on the main path.
 * Still used by the phone mockup in the apps section.
 */
function MapCanvas({ tick }) {
  const stops = [
    { x: 40, y: 150 }, { x: 110, y: 120 }, { x: 175, y: 128 }, { x: 240, y: 92 },
    { x: 305, y: 100 }, { x: 360, y: 60 },
  ]
  const p = stops[tick % stops.length]

  return (
    <svg viewBox="0 0 400 220" className="size-full" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="routeGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#00c391" stopOpacity="0.15" />
          <stop offset="50%" stopColor="#00c391" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.9" />
        </linearGradient>
        <pattern id="mapGrid" width="34" height="34" patternUnits="userSpaceOnUse">
          <path d="M34 0H0v34" fill="none" stroke="currentColor" strokeOpacity="0.16" strokeWidth="1" />
        </pattern>
      </defs>

      <rect width="400" height="220" fill="url(#mapGrid)" className="text-[var(--s-text-muted)]" />

      {/* secondary roads */}
      <path d="M0 178 H400" stroke="currentColor" strokeOpacity=".18" strokeWidth="7" className="text-[var(--s-text-muted)]" strokeLinecap="round" />
      <path d="M92 0 V220" stroke="currentColor" strokeOpacity=".14" strokeWidth="6" className="text-[var(--s-text-muted)]" strokeLinecap="round" />
      <path d="M286 0 V220" stroke="currentColor" strokeOpacity=".14" strokeWidth="6" className="text-[var(--s-text-muted)]" strokeLinecap="round" />

      {/* geofence */}
      <circle cx="305" cy="100" r="46" fill="#0ea5e9" fillOpacity=".08" stroke="#0ea5e9" strokeOpacity=".45" strokeWidth="1.5" strokeDasharray="5 5" />

      {/* main route */}
      <path
        d="M40 150 Q 75 108 110 120 T 175 128 Q 210 70 240 92 T 305 100 Q 340 104 360 60"
        fill="none"
        stroke="url(#routeGrad)"
        strokeWidth="4"
        strokeLinecap="round"
      />

      {/* waypoints */}
      {stops.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r="3" fill="#00c391" fillOpacity={i <= tick % stops.length ? 0.95 : 0.28} />
      ))}

      {/* live marker */}
      <g style={{ transform: `translate(${p.x}px, ${p.y}px)` }}>
        <circle r="14" fill="#00c391" fillOpacity=".18">
          <animate attributeName="r" values="9;20;9" dur="2.4s" repeatCount="indefinite" />
          <animate attributeName="fill-opacity" values=".3;0;.3" dur="2.4s" repeatCount="indefinite" />
        </circle>
        <circle r="7" fill="#00c391" stroke="var(--s-panel)" strokeWidth="2.5" />
      </g>
    </svg>
  )
}

/* ══════════════════════════════════════════════════════════════════
   FEATURES
   ══════════════════════════════════════════════════════════════════ */
/** Flat-top hexagon clip path — shared by the card shell and its gradient edge. */
const HEX_CLIP = 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)'

function HexFeature({ icon: Icon, k, tone, t }) {
  return (
    <div
      className="group relative h-[182px] w-[330px] shrink-0 transition-transform duration-400 hover:z-20 hover:scale-[1.035] sm:h-[206px] sm:w-[400px]"
      style={{ filter: 'drop-shadow(0 12px 24px rgb(0 0 0 / 0.06))' }}
    >
      {/* colored edge */}
      <div
        className={cn('absolute inset-0 bg-linear-to-br opacity-90 transition-opacity duration-400 group-hover:opacity-100', tone.edge)}
        style={{ clipPath: HEX_CLIP }}
      />
      {/* body */}
      <div
        className="absolute inset-[1.5px] flex flex-col items-center justify-center bg-[var(--s-panel)] px-12 text-center sm:px-16"
        style={{ clipPath: HEX_CLIP }}
      >
        {/* tinted wash that blooms on hover */}
        <div className={cn('absolute inset-0 bg-linear-to-b opacity-80 transition-opacity duration-400 group-hover:opacity-100', tone.wash)} />

        <div className={cn('relative mb-2.5 flex h-11 w-11 items-center justify-center rounded-xl ring-1 transition-transform duration-400 group-hover:scale-110', tone.chip)}>
          <Icon size={20} className={tone.icon} strokeWidth={2} />
        </div>
        <h3 className="relative mb-1.5 text-[15px] font-extrabold leading-snug">{t(`feat.${k}.t`)}</h3>
        <p className="relative line-clamp-3 text-[12px] leading-relaxed text-muted">{t(`feat.${k}.d`)}</p>
      </div>
    </div>
  )
}

function Features() {
  const { t } = useLang()
  const items = [
    {
      icon: MapPin, k: 'live',
      tone: {
        edge: 'from-brand-500 via-brand-400 to-emerald-300',
        wash: 'from-brand-500/8 to-transparent',
        chip: 'bg-brand-500/12 ring-brand-500/25',
        icon: 'text-brand-600 dark:text-brand-400',
      },
    },
    {
      icon: Shield, k: 'geo',
      tone: {
        edge: 'from-sky-500 via-sky-400 to-cyan-300',
        wash: 'from-sky-500/8 to-transparent',
        chip: 'bg-sky-500/12 ring-sky-500/25',
        icon: 'text-sky-600 dark:text-sky-400',
      },
    },
    {
      icon: Route, k: 'replay',
      tone: {
        edge: 'from-violet-500 via-violet-400 to-fuchsia-300',
        wash: 'from-violet-500/8 to-transparent',
        chip: 'bg-violet-500/12 ring-violet-500/25',
        icon: 'text-violet-600 dark:text-violet-400',
      },
    },
    {
      icon: BellRing, k: 'alerts',
      tone: {
        edge: 'from-amber-500 via-amber-400 to-orange-300',
        wash: 'from-amber-500/8 to-transparent',
        chip: 'bg-amber-500/12 ring-amber-500/25',
        icon: 'text-amber-600 dark:text-amber-400',
      },
    },
    {
      icon: Fuel, k: 'fuel',
      tone: {
        edge: 'from-teal-500 via-teal-400 to-emerald-300',
        wash: 'from-teal-500/8 to-transparent',
        chip: 'bg-teal-500/12 ring-teal-500/25',
        icon: 'text-teal-600 dark:text-teal-400',
      },
    },
    {
      icon: FileBarChart, k: 'reports',
      tone: {
        edge: 'from-indigo-500 via-indigo-400 to-blue-300',
        wash: 'from-indigo-500/8 to-transparent',
        chip: 'bg-indigo-500/12 ring-indigo-500/25',
        icon: 'text-indigo-600 dark:text-indigo-400',
      },
    },
  ]
  const columns = [items.slice(0, 2), items.slice(2, 4), items.slice(4, 6)]

  return (
    <section id="features" className="relative scroll-mt-20 overflow-hidden py-24">
      <FeatureMesh />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal>
          <SectionHeading eyebrow={t('features.eyebrow')} title={t('features.title')} desc={t('features.desc')} />
        </Reveal>

        {/* honeycomb — lg and up */}
        <div className="mt-16 hidden justify-center lg:flex">
          {columns.map((col, ci) => (
            <div key={ci} className={cn('flex flex-col gap-2', ci > 0 && '-ms-[100px]', ci % 2 === 1 && 'mt-[107px]')}>
              {col.map((it, i) => (
                <Reveal key={it.k} delay={(ci * 2 + i) * 70}>
                  <HexFeature icon={it.icon} k={it.k} tone={it.tone} t={t} />
                </Reveal>
              ))}
            </div>
          ))}
        </div>

        {/* stacked hexes — below lg */}
        <div className="mt-14 flex flex-wrap justify-center gap-6 lg:hidden">
          {items.map((it, i) => (
            <Reveal key={it.k} delay={(i % 2) * 70}>
              <HexFeature icon={it.icon} k={it.k} tone={it.tone} t={t} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/**
 * Backdrop for the features section: the shared section grid plus two
 * low-opacity brand glows. No animation.
 */
function FeatureMesh() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <SectionGrid glow={false} />

      {/* soft brand glows */}
      <div className="absolute -top-24 start-[8%] h-[420px] w-[420px] rounded-full bg-brand-500/10 blur-[110px]" />
      <div className="absolute -bottom-32 end-[6%] h-[380px] w-[380px] rounded-full bg-sky-500/10 blur-[110px]" />
    </div>
  )
}

/**
 * Shared quiet backdrop for the content sections: a fine grid that fades out
 * towards the edges, with optional brand glows. Keeps every section on the
 * page background while still giving it some texture.
 */
function SectionGrid({ glow = true }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <div
        className="absolute inset-0 opacity-[0.5]"
        style={{
          backgroundImage:
            'linear-gradient(to right, var(--s-border) 1px, transparent 1px), linear-gradient(to bottom, var(--s-border) 1px, transparent 1px)',
          backgroundSize: '72px 72px',
          maskImage: 'radial-gradient(80% 70% at 50% 40%, black, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(80% 70% at 50% 40%, black, transparent 100%)',
        }}
      />
      {glow && (
        <>
          <div className="absolute -top-32 start-1/4 h-[380px] w-[380px] rounded-full bg-brand-500/8 blur-[120px]" />
          <div className="absolute -bottom-40 end-1/4 h-[360px] w-[360px] rounded-full bg-sky-500/8 blur-[120px]" />
        </>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
   SOLUTIONS
   ══════════════════════════════════════════════════════════════════ */
function Solutions() {
  const { t, isRTL } = useLang()
  const Arrow = isRTL ? ArrowLeft : ArrowRight
  const items = [
    {
      icon: Truck, k: 'logistics',
      accent: 'from-brand-500 to-emerald-400',
      chip: 'bg-brand-500/12 text-brand-500 ring-brand-500/25',
      glow: 'bg-brand-500/10',
    },
    {
      icon: Package, k: 'delivery',
      accent: 'from-sky-500 to-cyan-400',
      chip: 'bg-sky-500/12 text-sky-500 ring-sky-500/25',
      glow: 'bg-sky-500/10',
    },
    {
      icon: HardHat, k: 'construction',
      accent: 'from-amber-500 to-orange-400',
      chip: 'bg-amber-500/12 text-amber-500 ring-amber-500/25',
      glow: 'bg-amber-500/10',
    },
    {
      icon: CarFront, k: 'rental',
      accent: 'from-violet-500 to-fuchsia-400',
      chip: 'bg-violet-500/12 text-violet-500 ring-violet-500/25',
      glow: 'bg-violet-500/10',
    },
  ]

  return (
    <section id="solutions" className="relative scroll-mt-20 overflow-hidden py-24">
      <SectionGrid />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal>
          <SectionHeading eyebrow={t('sol.eyebrow')} title={t('sol.title')} desc={t('sol.desc')} />
        </Reveal>

        <div className="mt-14 grid gap-6 md:grid-cols-2">
          {items.map((it, i) => (
            <Reveal key={it.k} delay={(i % 2) * 90} className="h-full">
              <article className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-[var(--s-border)] bg-[var(--s-panel)] px-7 py-6 shadow-[var(--s-e1)] transition-all duration-400 hover:-translate-y-1 hover:border-[var(--s-border-strong)] hover:shadow-[var(--s-e2)]">
                {/* accent rail along the top, drawn in on hover */}
                <span
                  className={cn(
                    'absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 bg-linear-to-r transition-transform duration-500 ease-out group-hover:scale-x-100 rtl:origin-right',
                    it.accent,
                  )}
                />
                {/* corner glow */}
                <span
                  className={cn(
                    'pointer-events-none absolute -top-16 -end-16 size-40 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100',
                    it.glow,
                  )}
                />

                {/* icon and title share the top line */}
                <div className="relative flex items-center gap-4">
                  <span className={cn('grid size-12 shrink-0 place-items-center rounded-xl ring-1 transition-transform duration-400 group-hover:scale-105', it.chip)}>
                    <it.icon size={23} strokeWidth={1.9} />
                  </span>
                  <h3 className="text-[18px] font-extrabold leading-snug">{t(`sol.${it.k}.t`)}</h3>
                  <span className="ms-auto select-none font-mono text-[22px] font-black leading-none text-[var(--s-text-muted)] opacity-15 transition-opacity duration-400 group-hover:opacity-30">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                </div>

                <p className="relative mt-4 mb-5 text-[13.5px] leading-relaxed text-muted">{t(`sol.${it.k}.d`)}</p>

                {/* footer rule with a directional affordance */}
                <div className="relative mt-auto flex items-center gap-3 border-t border-[var(--s-border)] pt-3.5">
                  <span className={cn('h-1 w-10 rounded-full bg-linear-to-r transition-all duration-500 group-hover:w-16', it.accent)} />
                  <Arrow
                    size={16}
                    aria-hidden="true"
                    className="ms-auto text-muted transition-all duration-400 group-hover:translate-x-0.5 group-hover:text-[var(--s-text)] rtl:group-hover:-translate-x-0.5"
                  />
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ══════════════════════════════════════════════════════════════════
   HOW IT WORKS
   ══════════════════════════════════════════════════════════════════ */
function HowItWorks() {
  const { t } = useLang()
  const steps = [
    { k: 's1', icon: Satellite },
    { k: 's2', icon: Check },
    { k: 's3', icon: Activity },
  ]

  return (
    <section id="how" className="relative scroll-mt-20 overflow-hidden py-24">
      <SectionGrid glow={false} />

      {/* soft glow behind the timeline */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/2 h-[520px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-500/6 blur-[130px]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal>
          <SectionHeading eyebrow={t('how.eyebrow')} title={t('how.title')} />
        </Reveal>

        {/* vertical timeline: a spine down the middle with the steps alternating
            sides on desktop, and a single column with the spine at the start edge
            on smaller screens */}
        <div className="relative mx-auto mt-16 max-w-4xl">
          {/* spine + its end caps */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 start-[31px] w-px bg-linear-to-b from-transparent via-brand-500/40 to-transparent md:start-1/2"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-0 start-[31px] size-1.5 -translate-x-1/2 rounded-full bg-brand-500/45 rtl:translate-x-1/2 md:start-1/2"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-0 start-[31px] size-1.5 -translate-x-1/2 rounded-full bg-brand-500/45 rtl:translate-x-1/2 md:start-1/2"
          />

          <div className="space-y-6 md:space-y-8">
            {steps.map((st, i) => (
              <Reveal key={st.k} delay={i * 110}>
                <div className="relative ps-24 md:grid md:grid-cols-2 md:items-center md:gap-24 md:ps-0">
                  {/* node on the spine */}
                  <span className="absolute start-[31px] top-7 z-10 grid size-14 -translate-x-1/2 place-items-center rounded-2xl border border-brand-500/30 bg-[var(--s-panel-2)] text-brand-500 shadow-[0_0_0_8px_var(--s-bg),var(--s-e1)] rtl:translate-x-1/2 md:start-1/2 md:top-1/2 md:-translate-y-1/2">
                    <span className="absolute inset-0 rounded-2xl bg-linear-to-br from-brand-500/12 to-transparent" />
                    <st.icon size={22} strokeWidth={1.9} className="relative" />
                  </span>

                  {/* hairline joining the node to its card (desktop only) */}
                  <span
                    aria-hidden="true"
                    className={cn(
                      'pointer-events-none absolute top-1/2 hidden h-px w-10 bg-linear-to-r from-brand-500/40 to-transparent md:block',
                      i % 2 === 0 ? 'end-1/2 me-7' : 'start-1/2 ms-7',
                    )}
                  />

                  <article
                    className={cn(
                      'group relative overflow-hidden rounded-2xl border border-[var(--s-border)] bg-[var(--s-panel)] p-7 shadow-[var(--s-e1)] transition-all duration-400 hover:-translate-y-0.5 hover:border-brand-500/35 hover:shadow-[var(--s-e2)]',
                      i % 2 === 0 ? 'md:col-start-1' : 'md:col-start-2',
                    )}
                  >
                    {/* accent edge facing the spine */}
                    <span
                      className={cn(
                        'absolute inset-y-0 w-[3px] bg-linear-to-b from-brand-500 to-accent-500 transition-opacity duration-400',
                        i % 2 === 0 ? 'start-0 md:start-auto md:end-0' : 'start-0',
                      )}
                    />
                    {/* faint sheen that follows the accent edge */}
                    <span
                      className={cn(
                        'pointer-events-none absolute inset-y-0 w-32 bg-linear-to-r from-brand-500/8 to-transparent opacity-90 transition-opacity duration-500 group-hover:opacity-100',
                        i % 2 === 0 ? 'start-0 md:start-auto md:end-0 md:rotate-180' : 'start-0',
                      )}
                    />

                    <h3 className="relative text-[17px] font-extrabold leading-snug">{t(`how.${st.k}.t`)}</h3>
                    <span className="relative mt-3 block h-px w-20 bg-linear-to-r from-brand-500/60 to-transparent transition-all duration-500 group-hover:w-28" />
                    <p className="relative mt-3 text-[13.5px] leading-relaxed text-muted">{t(`how.${st.k}.d`)}</p>
                  </article>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

/* ══════════════════════════════════════════════════════════════════
   PRICING
   ══════════════════════════════════════════════════════════════════ */
function Pricing() {
  const { t, nf } = useLang()

  /* The amount is a copy slot like any other, so the super-admin can reprice
     without a deploy. A number gets locale grouping; anything else (or a
     cleared field) prints as typed, which also gives us the "contact us" row. */
  const amount = (key) => {
    if (!key) return null
    const raw = t(key).trim()
    if (!raw) return null
    const n = Number(raw.replace(/,/g, ''))
    return Number.isFinite(n) ? nf(n) : raw
  }

  const plans = [
    {
      k: 'basic', price: amount('price.basicVal'), popular: false,
      features: ['price.f.live', 'price.f.history', 'price.f.alerts', 'price.f.reports', 'price.f.support'],
    },
    {
      k: 'pro', price: amount('price.proVal'), popular: true,
      features: ['price.f.live', 'price.f.history1y', 'price.f.alertsAdv', 'price.f.geo', 'price.f.reports', 'price.f.api', 'price.f.supportPro'],
    },
    {
      k: 'ent', price: null, popular: false,
      features: ['price.f.live', 'price.f.history1y', 'price.f.alertsAdv', 'price.f.geo', 'price.f.api', 'price.f.manager', 'price.f.sla'],
    },
  ]

  return (
    <section id="pricing" className="relative scroll-mt-20 overflow-hidden py-24">
      <SectionGrid />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal>
          <SectionHeading eyebrow={t('price.eyebrow')} title={t('price.title')} desc={t('price.desc')} />
        </Reveal>

        {/* one framed table; the recommended plan is a raised panel inside it */}
        <div className="mt-14 rounded-[2rem] border border-[var(--s-border)] bg-[var(--s-panel)]/50 p-3 backdrop-blur-sm sm:p-4">
          <div className="grid gap-3 lg:grid-cols-3">
            {plans.map((p, i) => (
              <Reveal key={p.k} delay={i * 90} className="h-full">
                <article
                  className={cn(
                    'group relative flex h-full flex-col overflow-hidden rounded-[1.5rem] p-7 transition-colors duration-400',
                    p.popular
                      ? 'bg-[var(--s-panel-2)] ring-1 ring-brand-500/40'
                      : 'ring-1 ring-transparent hover:bg-[var(--s-panel-2)]/60 hover:ring-[var(--s-border)]',
                  )}
                >
                  {p.popular && (
                    <>
                      <span className="absolute inset-x-0 top-0 h-[3px] bg-linear-to-r from-brand-500 via-accent-500 to-brand-400" />
                      <span className="pointer-events-none absolute -top-24 start-1/2 size-64 -translate-x-1/2 rounded-full bg-brand-500/10 blur-[80px] rtl:translate-x-1/2" />
                    </>
                  )}

                  {/* plan name + recommendation badge share the top line */}
                  <div className="relative flex items-center justify-between gap-3">
                    <h3 className="text-[17px] font-extrabold">{t(`price.${p.k}`)}</h3>
                    {p.popular && (
                      <span className="rounded-full bg-brand-500/15 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-brand-500 ring-1 ring-brand-500/30">
                        {t('price.popular')}
                      </span>
                    )}
                  </div>
                  <p className="relative mt-1.5 text-[13px] leading-relaxed text-muted">{t(`price.${p.k}D`)}</p>

                  {/* price block — fixed height so the three rows line up */}
                  <div className="relative mt-7 min-h-[86px]">
                    {p.price ? (
                      <>
                        <div className="flex items-end gap-2">
                          <span className="mb-2 text-[13px] font-extrabold text-brand-500">{t('price.currency')}</span>
                          <span className="text-[52px] font-extrabold leading-none tabular-nums tracking-tight">
                            {p.price}
                          </span>
                        </div>
                        <p className="mt-2.5 text-xs text-muted">{t('price.month')}</p>
                      </>
                    ) : (
                      <div className="flex h-full flex-col justify-end">
                        <span className="text-[32px] font-extrabold leading-tight tracking-tight">
                          {t('price.custom')}
                        </span>
                      </div>
                    )}
                  </div>

                  <ul className="relative mt-7 flex-1 space-y-3 border-t border-[var(--s-border)] pt-6">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-[13.5px]">
                        <span
                          className={cn(
                            'mt-0.5 grid size-4.5 shrink-0 place-items-center rounded-full',
                            p.popular ? 'bg-brand-500 text-[#04120c]' : 'bg-brand-500/15 text-brand-500',
                          )}
                        >
                          <Check size={11} strokeWidth={3.5} />
                        </span>
                        <span className="text-muted">{t(f)}</span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    to="/login"
                    variant={p.popular ? 'primary' : 'outline'}
                    className={cn('relative mt-8 w-full', p.popular && 'shadow-lg shadow-brand-500/25')}
                  >
                    {p.price ? t('price.cta') : t('price.ctaEnt')}
                  </Button>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

/* ══════════════════════════════════════════════════════════════════
   APPS
   ══════════════════════════════════════════════════════════════════ */
function AppsSection() {
  const { t, isRTL } = useLang()
  const Arrow = isRTL ? ArrowLeft : ArrowRight
  const highlights = [
    { icon: MapPin, k: 'feat.live.t' },
    { icon: BellRing, k: 'feat.alerts.t' },
    { icon: Route, k: 'feat.replay.t' },
  ]

  return (
    <section id="apps" className="relative scroll-mt-20 overflow-hidden py-24">
      <SectionGrid glow={false} />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <div className="relative overflow-hidden rounded-[2.25rem] border border-brand-500/20 bg-[var(--s-panel)] p-7 shadow-[var(--s-e2)] sm:p-10">
          {/* quiet texture inside the panel: a fine grid fading towards the edges */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-60"
            style={{
              backgroundImage:
                'linear-gradient(to right, var(--s-border) 1px, transparent 1px), linear-gradient(to bottom, var(--s-border) 1px, transparent 1px)',
              backgroundSize: '44px 44px',
              maskImage: 'radial-gradient(90% 80% at 50% 40%, black, transparent 100%)',
              WebkitMaskImage: 'radial-gradient(90% 80% at 50% 40%, black, transparent 100%)',
            }}
          />

          {/* light that gives the panel depth */}
          <div className="pointer-events-none absolute inset-0 bg-linear-to-br from-brand-500/6 via-transparent to-accent-500/6" />
          <div className="pointer-events-none absolute -end-24 -top-24 size-96 rounded-full bg-brand-500/14 blur-[100px]" />
          <div className="pointer-events-none absolute -bottom-24 -start-24 size-80 rounded-full bg-accent-500/12 blur-[90px]" />
          <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-brand-400/50 to-transparent" />

          <div className="relative grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
            <Reveal>
              <span className="inline-flex items-center gap-2 rounded-full border border-brand-500/25 bg-brand-500/10 px-3.5 py-1.5 text-[11px] font-extrabold uppercase tracking-widest text-brand-600 dark:text-brand-300">
                {t('apps.eyebrow')}
              </span>
              <h2 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-[34px]">{t('apps.title')}</h2>
              <p className="mt-3 max-w-md text-[15px] leading-relaxed text-muted">{t('apps.desc')}</p>

              {/* what the app actually gives you, in three beats */}
              <ul className="mt-7 max-w-md divide-y divide-[var(--s-border)] border-y border-[var(--s-border)]">
                {highlights.map((h) => (
                  <li key={h.k} className="group flex items-center gap-3.5 py-3.5">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-500/12 text-brand-500 ring-1 ring-brand-500/20 transition-transform duration-300 group-hover:scale-105">
                      <h.icon size={16} strokeWidth={2} />
                    </span>
                    <span className="text-[13.5px] font-bold">{t(h.k)}</span>
                    <Check size={15} className="ms-auto text-brand-500/60" strokeWidth={3} />
                  </li>
                ))}
              </ul>

              <Button to="/login" className="mt-7 shadow-lg shadow-brand-500/25">
                {t('hero.cta')}
                <Arrow size={16} />
              </Button>
            </Reveal>

            <Reveal delay={140} className="flex justify-center">
              <div className="relative">
                {/* pedestal glow so the device sits on light rather than floating */}
                <span className="pointer-events-none absolute -bottom-8 start-1/2 h-24 w-64 -translate-x-1/2 rounded-[50%] bg-brand-500/20 blur-[50px] rtl:translate-x-1/2" />

                <div className="relative rotate-[-3deg] transition-transform duration-500 hover:rotate-0">
                  <PhoneMock />
                </div>

                {/* floating alert toast */}
                <div className="absolute -top-4 -start-10 hidden w-56 rounded-2xl border border-[var(--s-border)] bg-[var(--s-panel-2)] p-3 shadow-[var(--s-e2)] backdrop-blur-sm sm:block">
                  <div className="flex items-center gap-2.5">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-500/15 text-brand-500">
                      <BellRing size={15} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-extrabold">{t('feat.alerts.t')}</p>
                      <p className="truncate text-[10.5px] text-muted">{t('stat.refreshVal')} · {t('stat.refresh')}</p>
                    </div>
                  </div>
                </div>

                {/* floating uptime chip */}
                <div className="absolute -bottom-3 -end-8 hidden items-center gap-2 rounded-2xl border border-[var(--s-border)] bg-[var(--s-panel-2)] px-3.5 py-2.5 shadow-[var(--s-e2)] sm:flex">
                  <Gauge size={15} className="text-brand-500" />
                  <span className="text-[13px] font-extrabold tabular-nums">{t('stat.uptimeVal')}</span>
                  <span className="text-[10.5px] font-bold text-muted">{t('stat.uptime')}</span>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  )
}

function PhoneMock() {
  const { t } = useLang()
  const rows = [
    { plate: t('apps.mockPlate1'), s: 'moving', v: t('apps.mockSpeed1') },
    { plate: t('apps.mockPlate2'), s: 'moving', v: t('apps.mockSpeed2') },
    { plate: t('apps.mockPlate3'), s: 'idle', v: t('apps.mockSpeed3') },
  ]
  const colors = { moving: '#00c391', idle: '#f5b301', stopped: '#f4634e' }

  return (
    <div className="relative w-[236px] rounded-[2.4rem] border-[9px] border-[var(--s-panel-2)] bg-[var(--s-panel)] shadow-2xl ring-1 ring-[var(--s-border-strong)]">
      {/* hardware: side buttons and the speaker pill */}
      <span className="absolute -start-[11px] top-20 h-10 w-[3px] rounded-s bg-[var(--s-panel-2)]" />
      <span className="absolute -start-[11px] top-34 h-16 w-[3px] rounded-s bg-[var(--s-panel-2)]" />
      <span className="absolute -end-[11px] top-28 h-12 w-[3px] rounded-e bg-[var(--s-panel-2)]" />
      <span className="absolute start-1/2 top-2 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-[var(--s-panel-2)] rtl:translate-x-1/2" />

      <div className="h-[392px] overflow-hidden rounded-[1.8rem] bg-[var(--s-bg-alt)]">
        {/* status bar */}
        <div className="flex items-center justify-between px-4 pt-2.5 pb-1.5" dir="ltr">
          <span className="text-[9.5px] font-extrabold tabular-nums">{t('apps.mockTime')}</span>
          <span className="flex items-center gap-[3px]">
            <span className="h-1 w-1 rounded-full bg-[var(--s-text-muted)]" />
            <span className="h-1.5 w-1 rounded-sm bg-[var(--s-text-muted)]" />
            <span className="h-2 w-1 rounded-sm bg-[var(--s-text-muted)]" />
            <span className="ms-1 h-2 w-4 rounded-[3px] border border-[var(--s-text-muted)] p-[1px]">
              <span className="block h-full w-2/3 rounded-[1px] bg-brand-500" />
            </span>
          </span>
        </div>

        {/* app bar */}
        <div className="flex items-center justify-between border-b border-[var(--s-border)] px-3.5 pb-2">
          <span className="flex items-center gap-1.5">
            <span className="grid size-5 place-items-center rounded-md bg-brand-500 text-[#04120c]">
              <MapPin size={11} strokeWidth={3} />
            </span>
            <span className="text-[11px] font-extrabold">{t('brand.name')}</span>
          </span>
          <span className="flex items-center gap-1 rounded-full bg-brand-500/12 px-2 py-0.5">
            <span className="size-1.5 rounded-full bg-brand-500" />
            <span className="text-[9px] font-extrabold text-brand-500">{t('footer.operational')}</span>
          </span>
        </div>

        <div className="h-24 border-b bg-[var(--s-bg)]">
          <MapCanvas tick={2} />
        </div>
        <div className="p-3">
          <p className="mb-2 px-1 text-[11px] font-extrabold text-muted">{t('apps.mockList')}</p>
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.plate} className="surface-2 flex items-center justify-between rounded-xl px-3 py-2">
                <span className="flex items-center gap-2">
                  <span className="size-2 rounded-full" style={{ background: colors[r.s] }} />
                  <span className="text-[11px] font-extrabold" dir="ltr">{r.plate}</span>
                </span>
                <span className="text-[11px] font-extrabold tabular-nums">{r.v}</span>
              </div>
            ))}
          </div>
          <div className="surface-2 mt-2.5 rounded-xl p-2.5">
            <p className="text-[10px] font-bold text-muted">{t('apps.mockKpi')}</p>
            <p className="mt-1 text-lg font-extrabold tabular-nums text-brand-500">{t('apps.mockKpiVal')}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
   FAQ
   ══════════════════════════════════════════════════════════════════ */
function Faq() {
  const { t, isRTL } = useLang()
  const [open, setOpen] = useState(0)
  const items = [1, 2, 3, 4, 5, 6]
  const Arrow = isRTL ? ArrowLeft : ArrowRight

  return (
    <section id="faq" className="relative scroll-mt-20 overflow-hidden py-24">
      <SectionGrid />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          {/* aside: the section intro stays with you while you read the answers */}
          <Reveal>
            <div className="lg:sticky lg:top-28">
              <span className="inline-flex items-center gap-2 rounded-full border border-brand-500/25 bg-brand-500/10 px-3.5 py-1.5 text-[11px] font-extrabold uppercase tracking-widest text-brand-600 dark:text-brand-300">
                {t('faq.eyebrow')}
              </span>
              <h2 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">{t('faq.title')}</h2>
              <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-muted">{t('contact.desc')}</p>

              <a
                href="#contact"
                className="group mt-8 flex max-w-sm items-center gap-4 rounded-2xl border border-[var(--s-border)] bg-[var(--s-panel)] p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-brand-500/35 hover:shadow-[var(--s-e2)]"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-500/12 text-brand-500 ring-1 ring-brand-500/20">
                  <Mail size={18} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[14px] font-extrabold">{t('contact.title')}</span>
                  <span className="block text-[12px] text-muted">{t('nav.contact')}</span>
                </span>
                <Arrow
                  size={16}
                  className="ms-auto shrink-0 text-muted transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-brand-500 rtl:group-hover:-translate-x-0.5"
                />
              </a>
            </div>
          </Reveal>

          {/* one panel, divided rows — reads as a document rather than six cards */}
          <Reveal delay={110}>
            <div className="overflow-hidden rounded-[1.5rem] border border-[var(--s-border)] bg-[var(--s-panel)] shadow-[var(--s-e1)]">
              {items.map((n, i) => {
                const isOpen = open === i
                return (
                  <div
                    key={n}
                    className={cn(
                      'relative border-b border-[var(--s-border)] last:border-b-0 transition-colors duration-300',
                      isOpen && 'bg-[var(--s-panel-2)]',
                    )}
                  >
                    {/* accent bar marks the open question */}
                    <span
                      className={cn(
                        'absolute inset-y-0 start-0 w-[3px] bg-linear-to-b from-brand-500 to-accent-500 transition-opacity duration-300',
                        isOpen ? 'opacity-100' : 'opacity-0',
                      )}
                    />

                    <button
                      onClick={() => setOpen(isOpen ? -1 : i)}
                      aria-expanded={isOpen}
                      className="flex w-full cursor-pointer items-center justify-between gap-4 px-6 py-5 text-start transition-colors hover:bg-[var(--s-panel-2)]/60"
                    >
                      <span className={cn('text-[15px] font-extrabold transition-colors', isOpen && 'text-brand-500')}>
                        {t(`faq.q${n}`)}
                      </span>
                      <span
                        className={cn(
                          'grid size-7 shrink-0 place-items-center rounded-full transition-all duration-300',
                          isOpen
                            ? 'rotate-180 bg-brand-500 text-[#04120c]'
                            : 'bg-[var(--s-panel-2)] text-muted ring-1 ring-[var(--s-border)]',
                        )}
                      >
                        {isOpen ? <Minus size={14} strokeWidth={3} /> : <Plus size={14} strokeWidth={3} />}
                      </span>
                    </button>

                    <div
                      className={cn(
                        'grid transition-[grid-template-rows] duration-300 ease-out',
                        isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
                      )}
                    >
                      <div className="overflow-hidden">
                        <p className="px-6 pb-5 text-[13.5px] leading-relaxed text-muted">{t(`faq.a${n}`)}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

/* ══════════════════════════════════════════════════════════════════
   CONTACT
   ══════════════════════════════════════════════════════════════════ */
function Contact() {
  const { t } = useLang()
  /* 'idle' | 'sending' | 'sent' | 'error' */
  const [state, setState] = useState('idle')

  const onSubmit = async (e) => {
    e.preventDefault()
    const form = e.currentTarget
    const payload = Object.fromEntries(new FormData(form))

    setState('sending')
    try {
      await api.sendMessage(payload)
      form.reset()
      setState('sent')
      setTimeout(() => setState('idle'), 5000)
    } catch {
      /* the message is kept in the fields so nothing typed is lost */
      setState('error')
    }
  }

  return (
    <section id="contact" className="relative scroll-mt-20 overflow-hidden py-20">
      <SectionGrid glow={false} />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr]">
          <Reveal>
            <div className="relative overflow-hidden rounded-[1.5rem] border border-[var(--s-border)] bg-[var(--s-panel)] p-6 shadow-[var(--s-e1)] sm:p-7">
              <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-brand-400/50 to-transparent" />

              <form onSubmit={onSubmit} className="grid gap-3.5 sm:grid-cols-2">
                <Field label={t('contact.name')}>
                  <Input required name="name" placeholder={t('contact.name')} className="h-10" />
                </Field>
                <Field label={t('contact.company')}>
                  <Input required name="company" placeholder={t('contact.company')} className="h-10" />
                </Field>
                <Field label={t('contact.phone')}>
                  <Input required name="phone" type="tel" dir="ltr" placeholder={t('contact.phoneHint')} className="h-10" />
                </Field>
                <Field label={t('contact.email')}>
                  <Input required name="email" type="email" dir="ltr" placeholder={t('contact.emailHint')} className="h-10" />
                </Field>
                <Field label={t('contact.fleet')} className="sm:col-span-2">
                  <Select name="fleet" defaultValue={t('contact.fleet1')} className="h-10">
                    {['contact.fleet1', 'contact.fleet2', 'contact.fleet3', 'contact.fleet4'].map((k) => (
                      <option key={k} value={t(k)}>
                        {t(k)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t('contact.message')} className="sm:col-span-2">
                  <Textarea name="message" rows={3} placeholder={t('contact.message')} className="min-h-20" />
                </Field>

                <div className="sm:col-span-2">
                  <Button type="submit" className="w-full" disabled={state === 'sending'}>
                    {t(state === 'sending' ? 'contact.sending' : 'contact.send')}
                  </Button>
                  {state === 'sent' && (
                    <p className="mt-3 rounded-xl border border-brand-500/30 bg-brand-500/10 px-4 py-2.5 text-center text-[13px] font-bold text-brand-600 dark:text-brand-300">
                      {t('contact.sent')}
                    </p>
                  )}
                  {state === 'error' && (
                    <p className="mt-3 rounded-xl border border-[#f4634e]/35 bg-[#f4634e]/10 px-4 py-2.5 text-center text-[13px] font-bold text-[#d1452c] dark:text-[#f4634e]">
                      {t('contact.err')}
                    </p>
                  )}
                </div>
              </form>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-500/25 bg-brand-500/10 px-3.5 py-1.5 text-[11px] font-extrabold uppercase tracking-widest text-brand-600 dark:text-brand-300">
              {t('contact.eyebrow')}
            </span>
            <h2 className="mt-4 text-[30px] font-extrabold leading-tight tracking-tight">{t('contact.title')}</h2>
            <p className="mt-2.5 max-w-sm text-[14px] leading-relaxed text-muted">{t('contact.desc')}</p>

            {/* one bordered list instead of three floating cards */}
            <div className="mt-7 overflow-hidden rounded-2xl border border-[var(--s-border)] bg-[var(--s-panel)]">
              <ContactRow icon={Phone} label={t('contact.phoneLabel')} value={t('contact.phoneVal')} ltr />
              <ContactRow icon={Mail} label={t('contact.emailLabel')} value={t('contact.emailVal')} ltr />
              <ContactRow icon={MapPinned} label={t('contact.addrLabel')} value={t('contact.addr')} />
            </div>

            <p className="mt-4 flex items-center gap-2 text-[12px] font-bold text-muted">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-400 opacity-70" />
                <span className="relative inline-flex size-2 rounded-full bg-brand-500" />
              </span>
              {t('footer.operational')}
            </p>
          </Reveal>

        </div>
      </div>
    </section>
  )
}

function ContactRow({ icon: Icon, label, value, ltr }) {
  return (
    <div className="flex items-center gap-3.5 border-b border-[var(--s-border)] p-4 transition-colors last:border-b-0 hover:bg-[var(--s-panel-2)]/60">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-500/12 text-brand-500 ring-1 ring-brand-500/20">
        <Icon size={17} />
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block text-[10.5px] font-bold uppercase tracking-wider text-muted">{label}</span>
        <span className="mt-0.5 block truncate text-[14px] font-extrabold" dir={ltr ? 'ltr' : undefined}>
          {value}
        </span>
      </span>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
   FINAL CTA
   ══════════════════════════════════════════════════════════════════ */
function FinalCta() {
  const { t, isRTL } = useLang()
  const Arrow = isRTL ? ArrowLeft : ArrowRight

  return (
    <section className="relative overflow-hidden pb-24">
      <SectionGrid glow={false} />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal>
          <Card className="relative overflow-hidden rounded-4xl border-brand-500/25 p-10 text-center sm:p-16">
            <div className="pointer-events-none absolute inset-0 bg-linear-to-br from-brand-500/12 via-transparent to-accent-500/12" />
            <div className="pointer-events-none absolute -top-32 start-1/2 size-[30rem] -translate-x-1/2 rounded-full bg-brand-500/16 blur-[110px] rtl:translate-x-1/2" />

            <div className="relative">
              <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{t('cta.title')}</h2>
              <p className="mx-auto mt-4 max-w-lg text-[15px] leading-relaxed text-muted">{t('cta.desc')}</p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Button href="#contact" size="lg">
                  {t('cta.btn')}
                  <Arrow size={17} />
                </Button>
                <Button to="/login" variant="outline" size="lg">
                  {t('hero.cta')}
                </Button>
              </div>
            </div>
          </Card>
        </Reveal>
      </div>
    </section>
  )
}
