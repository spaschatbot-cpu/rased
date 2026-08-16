import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import {
  User,
  Lock,
  Eye,
  EyeOff,
  ShieldCheck,
  ArrowLeft,
  ArrowRight,
  AlertCircle,
  Satellite,
  Route as RouteIcon,
  BellRing,
  Smartphone,
} from 'lucide-react'
import { useLang } from '../context/LanguageContext'
import { useAuth, DEMO_CREDENTIALS } from '../context/AuthContext'
import { Button, Input, Field, Checkbox } from '../components/ui'
import { ThemeToggle, LangToggle } from '../components/common/Toggles'

/* ── stage media ───────────────────────────────────────────────────
   Aerial traffic footage — reads like a live tracking map behind the
   form. Swap these two constants for local assets in /public when
   real footage is ready. */
const VIDEO_SRC = 'https://videos.pexels.com/video-files/3121459/3121459-hd_1280_720_24fps.mp4'
const VIDEO_POSTER = 'https://images.pexels.com/videos/3121459/free-video-3121459.jpg?auto=compress&w=1600'

/* map pins scattered over the footage (viewBox units) */
const PINS = [
  { x: 210, y: 250, c: '#00c391', d: '0s' },
  { x: 1180, y: 205, c: '#38bdf8', d: '0.9s' },
  { x: 330, y: 690, c: '#f5b301', d: '1.6s' },
  { x: 1120, y: 700, c: '#00c391', d: '2.2s' },
]

/* tightens the <Field> caption on short viewports (targets Field's label span) */
const COMPACT_LABEL = 'short:[&>span:first-child]:mb-1 short:[&>span:first-child]:text-[11px]'

export default function Login() {
  const { t, isRTL } = useLang()
  const { login, isAuthed, isAdmin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [username, setUsername] = useState(DEMO_CREDENTIALS.username)
  const [password, setPassword] = useState(DEMO_CREDENTIALS.password)
  const [showPass, setShowPass] = useState(false)
  const [remember, setRemember] = useState(true)
  const [busy, setBusy] = useState(false)
  /* null when fine, otherwise 'credentials' | 'network' | 'driverApp' */
  const [error, setError] = useState(null)

  const Arrow = isRTL ? ArrowLeft : ArrowRight
  const Back = isRTL ? ArrowRight : ArrowLeft
  const from = location.state?.from ?? '/app'

  if (isAuthed) return <Navigate to={isAdmin ? '/admin' : from} replace />

  const onSubmit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await login(username, password)
    setBusy(false)
    if (res.ok) navigate(res.role === 'superadmin' ? '/admin' : from, { replace: true })
    else setError(res.error)
  }

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-[#030a11] text-white">
      {/* ── full-page video stage ───────────────────────────────── */}
      <div className="pointer-events-none absolute inset-0">
        <video
          className="stage-video"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          poster={VIDEO_POSTER}
          aria-hidden="true"
        >
          <source src={VIDEO_SRC} type="video/mp4" />
        </video>

        <div className="stage-veil absolute inset-0" />
        <div className="stage-scan absolute inset-0 opacity-50" />
        <div className="grid-lines absolute inset-0 opacity-30" />

        {/* tracking overlay: routes, moving units */}
        <svg
          className="absolute inset-0 size-full opacity-90"
          viewBox="0 0 1440 900"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="rg1" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#00c391" stopOpacity="0" />
              <stop offset="45%" stopColor="#00c391" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.15" />
            </linearGradient>
            <linearGradient id="rg2" x1="1" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0" />
              <stop offset="55%" stopColor="#38bdf8" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#00c391" stopOpacity="0.1" />
            </linearGradient>
          </defs>

          <path
            id="lg-route-1"
            d="M-40 250 C 220 250, 250 470, 470 470 S 760 210, 990 210 1240 430, 1500 430"
            className="route-trace"
            stroke="url(#rg1)"
            strokeWidth="2.5"
          />
          <path
            d="M-40 250 C 220 250, 250 470, 470 470 S 760 210, 990 210 1240 430, 1500 430"
            className="route-line"
            stroke="#00c391"
            strokeOpacity="0.45"
            strokeWidth="1.5"
          />

          <path
            id="lg-route-2"
            d="M1500 690 C 1230 690, 1160 830, 900 830 S 520 640, 250 640 -20 780, -40 780"
            className="route-trace"
            stroke="url(#rg2)"
            strokeWidth="2.5"
            style={{ animationDelay: '1.4s' }}
          />

          {/* units travelling the routes */}
          <g>
            <circle r="5.5" fill="#00c391">
              <animateMotion dur="11s" repeatCount="indefinite" rotate="auto">
                <mpath href="#lg-route-1" />
              </animateMotion>
            </circle>
            <circle r="13" fill="#00c391" fillOpacity="0.18">
              <animateMotion dur="11s" repeatCount="indefinite">
                <mpath href="#lg-route-1" />
              </animateMotion>
            </circle>
          </g>
          <g>
            <circle r="5" fill="#38bdf8">
              <animateMotion dur="14s" begin="2s" repeatCount="indefinite" rotate="auto">
                <mpath href="#lg-route-2" />
              </animateMotion>
            </circle>
            <circle r="12" fill="#38bdf8" fillOpacity="0.18">
              <animateMotion dur="14s" begin="2s" repeatCount="indefinite">
                <mpath href="#lg-route-2" />
              </animateMotion>
            </circle>
          </g>
        </svg>

        {/* geofence pings */}
        {PINS.map((p) => (
          <span
            key={`${p.x}-${p.y}`}
            className="absolute hidden md:block"
            style={{ left: `${(p.x / 1440) * 100}%`, top: `${(p.y / 900) * 100}%` }}
          >
            <span
              className="pin-ping absolute -inset-2.5 rounded-full"
              style={{ border: `1.5px solid ${p.c}`, animationDelay: p.d }}
            />
            <span
              className="block size-2 rounded-full"
              style={{ background: p.c, boxShadow: `0 0 12px 3px ${p.c}66` }}
            />
          </span>
        ))}

        {/* radar sweep */}
        <div className="absolute -bottom-40 -start-40 hidden size-[32rem] lg:block">
          <div className="radar-ring absolute inset-0 rounded-full" />
          <div className="radar-ring absolute inset-[18%] rounded-full" />
          <div className="radar-ring absolute inset-[36%] rounded-full" />
          <div className="radar-cone absolute inset-0 rounded-full" />
        </div>
      </div>

      {/* ── header ──────────────────────────────────────────────── */}
      <header className="relative z-20 flex shrink-0 items-center justify-between gap-3 px-4 py-3 sm:px-9 sm:py-4 short:py-2.5">
        <Link
          to="/"
          className="inline-flex h-10 items-center gap-2 rounded-2xl border border-white/12 bg-white/6 px-3.5 text-[12px] font-extrabold whitespace-nowrap text-white/75 backdrop-blur-xl transition-all duration-200 hover:border-brand-400/45 hover:bg-white/12 hover:text-brand-300 active:scale-95 sm:px-4 sm:text-[12.5px] short:h-9"
        >
          <Back size={16} />
          {t('login.backHome')}
        </Link>

        <div className="flex items-center gap-1.5 rounded-2xl border border-white/12 bg-[rgb(8_18_28/0.5)] p-1.5 shadow-[0_18px_40px_-22px_rgb(0_0_0/0.9)] backdrop-blur-xl">
          <span className="ms-1.5 hidden items-center gap-2 pe-1 text-[11.5px] font-extrabold text-white/70 sm:inline-flex">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-400 opacity-75" />
              <span className="relative inline-flex size-1.5 rounded-full bg-brand-400" />
            </span>
            {t('login.liveNow')}
          </span>
          <span className="hidden h-6 w-px bg-white/12 sm:block" />
          <LangToggle variant="glass" segmented className="h-9 border-transparent bg-transparent short:h-8" />
          <span className="h-6 w-px bg-white/12" />
          <ThemeToggle variant="ghost" className="h-9 w-9 rounded-lg short:h-8 short:w-8" />
        </div>
      </header>

      {/* ── floating telemetry chips ────────────────────────────── */}
      <div className="pointer-events-none absolute inset-0 z-0 hidden xl:block">
        <span className="hud-chip absolute start-[7%] top-[32%] flex items-center gap-2.5 rounded-2xl px-4 py-3 text-[12px] font-extrabold">
          <Satellite size={15} className="text-brand-400" />
          <span>
            <span className="block" dir="ltr">
              128
            </span>
            <span className="block text-[10.5px] font-bold text-white/55">{t('login.onlineNow')}</span>
          </span>
        </span>

        <span
          className="hud-chip absolute end-[7%] top-[26%] flex items-center gap-2.5 rounded-2xl px-4 py-3 text-[12px] font-extrabold"
          style={{ animationDelay: '1.2s' }}
        >
          <RouteIcon size={15} className="text-accent-400" />
          <span>
            <span className="block" dir="ltr">
              10s
            </span>
            <span className="block text-[10.5px] font-bold text-white/55">{t('login.stat.refresh')}</span>
          </span>
        </span>

        <span
          className="hud-chip absolute end-[9%] bottom-[22%] flex items-center gap-2.5 rounded-2xl px-4 py-3 text-[12px] font-extrabold"
          style={{ animationDelay: '2.4s' }}
        >
          <BellRing size={15} className="text-[#f5b301]" />
          <span>
            <span className="block">{t('feat.alerts.t')}</span>
            <span className="block text-[10.5px] font-bold text-white/55">{t('hero.badge')}</span>
          </span>
        </span>
      </div>

      {/* ── centred form ────────────────────────────────────────── */}
      <main className="relative z-10 flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-4 py-3 sm:px-8">
        <div className="w-full max-w-[26.5rem] py-1">
          {/* reset the stage's white text — the card follows the theme */}
          <div className="auth-card rise px-5 py-6 text-[var(--s-text)] sm:px-8 short:px-5 short:py-4">
            <div className="text-center">
              <span className="mx-auto grid size-11 place-items-center rounded-2xl bg-brand-500/12 text-brand-500 ring-1 ring-brand-500/25 short:size-9 short:rounded-xl">
                <ShieldCheck size={20} className="short:size-[17px]" />
              </span>
              <h1 className="mt-3.5 text-[26px] font-extrabold leading-tight tracking-tight short:mt-2.5 short:text-[21px]">
                {t('login.welcome')}
              </h1>
              <p className="mx-auto mt-2 max-w-xs text-[12.5px] leading-relaxed text-muted short:mt-1.5 short:text-[11.5px] short:leading-snug">
                {t('login.desc')}
              </p>
            </div>

            <form onSubmit={onSubmit} className="mt-6 space-y-3.5 short:mt-4 short:space-y-2.5">
              <Field label={t('login.user')} className={COMPACT_LABEL}>
                <Input
                  icon={User}
                  required
                  dir="ltr"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={t('login.user')}
                  className="short:h-10"
                />
              </Field>

              <Field label={t('login.pass')} className={COMPACT_LABEL}>
                <div className="relative">
                  <Lock size={16} className="pointer-events-none absolute top-1/2 start-3.5 -translate-y-1/2 text-muted" />
                  <input
                    required
                    dir="ltr"
                    autoComplete="current-password"
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="h-11 w-full rounded-xl border bg-[var(--s-panel-2)] ps-10 pe-11 text-sm outline-none transition-all placeholder:text-[var(--s-text-muted)] focus:border-brand-400 focus:ring-4 focus:ring-brand-400/12 short:h-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    aria-label={showPass ? 'hide' : 'show'}
                    className="absolute top-1/2 end-3 -translate-y-1/2 cursor-pointer text-muted transition-colors hover:text-brand-500"
                  >
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </Field>

              <div className="pt-0.5">
                <Checkbox checked={remember} onChange={setRemember} label={t('login.remember')} />
              </div>

              {/* a driver typed real credentials into the wrong app — that is
                  guidance, not a failure, so it does not wear the error red */}
              {error === 'driverApp' ? (
                <p className="flex items-start gap-2 rounded-xl border border-brand-500/35 bg-brand-500/10 px-4 py-3 text-[13px] font-bold text-brand-700 dark:text-brand-300">
                  <Smartphone size={16} className="mt-px shrink-0" />
                  {t('login.driverApp')}
                </p>
              ) : (
                error && (
                  <p className="flex items-center gap-2 rounded-xl border border-[#f4634e]/35 bg-[#f4634e]/10 px-4 py-3 text-[13px] font-bold text-[#d1452c] dark:text-[#f4634e]">
                    <AlertCircle size={16} className="shrink-0" />
                    {t(error === 'network' ? 'login.offline' : 'login.error')}
                  </p>
                )
              )}

              <Button type="submit" size="lg" className="w-full short:h-11 short:text-[15px]" disabled={busy}>
                {busy ? (
                  <>
                    <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    {t('login.submitting')}
                  </>
                ) : (
                  <>
                    {t('login.submit')}
                    <Arrow size={17} />
                  </>
                )}
              </Button>
            </form>

            <p className="mt-5 flex items-center justify-center gap-1.5 border-t border-[var(--s-border)] pt-3.5 text-[12px] font-bold text-muted short:mt-3.5 short:pt-2.5 short:text-[11.5px]">
              <ShieldCheck size={14} className="text-brand-500" />
              {t('login.secure')}
            </p>
          </div>
        </div>
      </main>

      {/* ── footer ──────────────────────────────────────────────── */}
      <footer className="relative z-10 shrink-0 border-t border-white/8 px-4 py-2.5 text-[11px] text-white/35 sm:px-9 sm:py-3 short:py-2 short:text-[10px]">
        <div className="text-center">
          © {new Date().getFullYear()} {t('brand.name')} — {t('footer.rights')}
        </div>
      </footer>
    </div>
  )
}
