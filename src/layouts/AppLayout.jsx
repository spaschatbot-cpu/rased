import { Link, Outlet, useNavigate } from 'react-router-dom'
import { Bell, LogOut, User } from 'lucide-react'
import { useLang } from '../context/LanguageContext'
import { useAuth } from '../context/AuthContext'
import { useFleet } from '../context/FleetContext'
import { Logo, cn, IconPlate } from '../components/ui'
import { ThemeToggle, LangToggle } from '../components/common/Toggles'
import FleetMap from '../components/map/FleetMap'

export default function AppLayout() {
  const { t, lang } = useLang()
  const { user, logout, can } = useAuth()
  const { unreadCount } = useFleet()
  const navigate = useNavigate()

  const userName = user ? (lang === 'ar' ? user.nameAr : user.nameEn) : ''

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* ── top bar ────────────────────────────────────────────── */}
      <header className="relative z-[800] flex h-16 shrink-0 items-center justify-between gap-3 border-b border-[var(--s-border)] bg-[var(--s-panel)]/85 px-3 backdrop-blur-xl shadow-[0_10px_28px_-24px_rgb(15_23_42/0.55)] sm:px-5">
        {/* خيط علوي خفيف يمنح الشريط عمقًا */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-500/40 to-transparent"
        />

        <div className="flex min-w-0 items-center gap-3">
          <Link
            to="/app"
            title={t('cc.title')}
            className="min-w-0 shrink rounded-xl px-1.5 py-1 transition-opacity hover:opacity-85"
          >
            <Logo name={t('brand.name')} tagline={t('cc.title')} size={36} />
          </Link>
        </div>

        <div className="flex items-center gap-2">
          {/* مجموعة أدوات الواجهة */}
          <div className="flex items-center gap-0.5 rounded-2xl bg-[var(--s-panel-2)]/70 p-1 ring-1 ring-inset ring-[var(--s-border)]">
            {/* الجرس يختفي مع صفحته: عدّاد لا يمكن فتحه إزعاج لا خبر */}
            {can('alerts') && (
              <Link
                to="/app/alerts"
                aria-label={t('alert.title')}
                title={t('alert.title')}
                className="relative grid size-9 place-items-center rounded-xl text-muted transition-colors hover:bg-[var(--s-panel)] hover:text-brand-500"
              >
                <Bell size={17} />
                {unreadCount > 0 && (
                  <span className="absolute -end-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-[#f4634e] px-1 text-[9.5px] font-black leading-none text-white ring-2 ring-[var(--s-panel)]">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </Link>
            )}
            <LangToggle className="!h-9 border-transparent bg-transparent hover:bg-[var(--s-panel)]" />
            <ThemeToggle className="!h-9 border-transparent bg-transparent hover:bg-[var(--s-panel)]" />
          </div>

          {/* بطاقة المستخدم */}
          <Link
            to="/app/management"
            title={userName}
            className="hidden items-center gap-2.5 rounded-2xl bg-[var(--s-panel-2)]/70 py-1.5 pe-1.5 ps-3 ring-1 ring-inset ring-[var(--s-border)] transition-colors hover:ring-[var(--s-border-strong)] sm:flex"
          >
            <span className="leading-tight text-end">
              <span className="block max-w-36 truncate text-[13px] font-extrabold">{userName}</span>
              <span className="block text-[10px] font-bold text-muted">
                {t(`mng.role.${user?.role ?? 'viewer'}`)}
              </span>
            </span>
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-500 text-[13px] font-black text-[#04120c] shadow-[0_6px_16px_-8px_rgb(0_207_149/0.9)]">
              {userName ? userName.trim().slice(0, 1) : <User size={16} />}
            </span>
          </Link>

          <button
            onClick={handleLogout}
            title={t('nav.logout')}
            aria-label={t('nav.logout')}
            className="grid size-10 cursor-pointer place-items-center rounded-2xl text-muted ring-1 ring-inset ring-transparent transition-colors hover:bg-[#f4634e]/10 hover:text-[#f4634e] hover:ring-[#f4634e]/25"
          >
            <LogOut size={17} />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ── content ──────────────────────────────────────────── */}
        <main className="app-canvas min-w-0 flex-1 overflow-y-auto relative">
          <div className="pointer-events-none fixed inset-0 z-0 opacity-[0.15] mix-blend-luminosity grayscale dark:opacity-[0.1]" aria-hidden="true">
            <FleetMap controls={false} interactive={false} zoom={13} vehicles={[]} showGeofences={false} />
          </div>
          <CanvasRoutes />
          <Outlet />
        </main>
      </div>
    </div>
  )
}

/**
 * The tracking motif drawn behind the page content: a route network with slow
 * travelling dashes and a few GPS pings. Deliberately low-contrast — it should
 * register as texture, not as a picture competing with the panels.
 */
function CanvasRoutes() {
  return (
    <svg className="canvas-routes" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        {/* fades the network out toward the edges so it never boxes the page in */}
        <radialGradient id="routeFade" cx="50%" cy="35%" r="72%">
          <stop offset="0%" stopColor="#fff" stopOpacity="1" />
          <stop offset="62%" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id="routeMask">
          <rect width="1440" height="900" fill="url(#routeFade)" />
        </mask>
      </defs>

      <g mask="url(#routeMask)">
        {/* constellation — ground stations wired to each other */}
        <g fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1">
          <path d="M150 210 L 430 300 L 700 190 L 980 280 L 1270 170" strokeOpacity="0.16" className="flow" />
          <path d="M110 640 L 380 700 L 660 610 L 940 690 L 1300 600" strokeOpacity="0.13" className="flow-slow" />
          <path d="M430 300 L 380 700" strokeOpacity="0.09" />
          <path d="M700 190 L 660 610" strokeOpacity="0.09" />
          <path d="M980 280 L 940 690" strokeOpacity="0.09" />
          <path d="M150 210 L 110 640" strokeOpacity="0.07" />
        </g>

        {/* stations */}
        {[[430, 300], [700, 190], [980, 280], [380, 700], [660, 610], [940, 690]].map(([cx, cy]) => (
          <g key={`${cx}-${cy}`}>
            <circle cx={cx} cy={cy} r="14" fill="currentColor" fillOpacity="0.1" className="ping" />
            <circle cx={cx} cy={cy} r="3" fill="currentColor" fillOpacity="0.38" />
          </g>
        ))}

        {/* satellites watching over the network */}
        {[[250, 120, -18], [1180, 330, 14], [560, 810, 8], [1290, 760, -12]].map(([x, y, rot]) => (
          <g key={`sat-${x}`} transform={`translate(${x} ${y}) rotate(${rot})`} opacity="0.4">
            <rect x="-5" y="-7" width="10" height="14" rx="2.5" fill="currentColor" fillOpacity="0.5" />
            <rect x="-22" y="-4.5" width="14" height="9" rx="1.6" fill="currentColor" fillOpacity="0.28" />
            <rect x="8" y="-4.5" width="14" height="9" rx="1.6" fill="currentColor" fillOpacity="0.28" />
            <path d="M0 7 L0 15" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.2" strokeLinecap="round" />
            <path d="M-7 19 A 10 10 0 0 1 7 19" fill="none" stroke="currentColor" strokeOpacity="0.28" strokeWidth="1.2" strokeLinecap="round" />
          </g>
        ))}
      </g>
    </svg>
  )
}

/**
 * Consistent page header used by every app page.
 * `eyebrow` prints a small section label above the title, and `bare` drops the
 * bottom hairline for headers that already sit inside a panel.
 */
export function PageHeader({ title, subtitle, icon: Icon, tone = 'brand', eyebrow, actions, bare = false, className }) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-4',
        !bare && 'border-b pb-4',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3.5">
        {Icon && <IconPlate icon={Icon} tone={tone} size="lg" />}
        <div className="min-w-0">
          {eyebrow && (
            <span className="block text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-muted">{eyebrow}</span>
          )}
          <h1 className="truncate text-xl font-extrabold tracking-tight sm:text-[26px]">{title}</h1>
          {subtitle && <p className="mt-1 text-[13px] leading-snug text-muted">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}


