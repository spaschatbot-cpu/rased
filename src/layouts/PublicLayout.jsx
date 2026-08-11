import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { Menu, X, ArrowLeft, ArrowRight } from 'lucide-react'
import { useLang } from '../context/LanguageContext'
import { useAuth } from '../context/AuthContext'
import { Button, Logo, cn } from '../components/ui'
import { LangToggle } from '../components/common/Toggles'
import { useForcedTheme } from '../context/ThemeContext'
import { useSite } from '../context/SiteContentContext'

const NAV_LABELS = {
  features: 'nav.features',
  solutions: 'nav.solutions',
  how: 'nav.how',
  pricing: 'nav.pricing',
  apps: 'nav.apps',
  faq: 'nav.faq',
  contact: 'nav.contact',
}

/** Header links follow the super-admin's section order and visibility. */
function useNavSections() {
  const { visibleSections } = useSite()
  return useMemo(
    () => visibleSections.filter((id) => NAV_LABELS[id]).map((id) => [NAV_LABELS[id], id]),
    [visibleSections],
  )
}

/* Scroll state for the header: how far down we are (0→1 for the progress rail),
   whether we've left the hero, and which section owns the viewport right now. */
function useHeaderScroll(sections) {
  const [scrolled, setScrolled] = useState(false)
  const [progress, setProgress] = useState(0)
  const [active, setActive] = useState('')

  useEffect(() => {
    let frame = 0
    const read = () => {
      frame = 0
      const y = window.scrollY
      const max = document.documentElement.scrollHeight - window.innerHeight
      setScrolled(y > 16)
      setProgress(max > 0 ? Math.min(1, y / max) : 0)

      /* the section crossing the header line (just under the bar) wins */
      const line = 140
      let current = ''
      for (const [, id] of sections) {
        const el = document.getElementById(id)
        if (!el) continue
        const { top, bottom } = el.getBoundingClientRect()
        if (top <= line && bottom > line) current = id
      }
      setActive(current)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read)
    }
    read()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [sections])

  return { scrolled, progress, active }
}

/* Desktop nav: a bordered rail with one thumb that slides between links.
   The thumb tracks the pointer while hovering and settles back on the active
   section when the pointer leaves — measured in px so RTL and LTR behave the same. */
function DesktopNav({ active }) {
  const { t, lang } = useLang()
  const sections = useNavSections()
  const railRef = useRef(null)
  const itemsRef = useRef({})
  const [hovered, setHovered] = useState(null)
  const [thumb, setThumb] = useState(null)

  const target = hovered ?? active

  const measure = useCallback(() => {
    const rail = railRef.current
    const el = itemsRef.current[target]
    if (!rail || !el) return setThumb(null)
    setThumb({ left: el.offsetLeft, width: el.offsetWidth })
  }, [target])

  /* layout effect so the thumb never paints at a stale position */
  useLayoutEffect(measure, [measure, lang, sections])

  useEffect(() => {
    const rail = railRef.current
    if (!rail || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(rail)
    return () => ro.disconnect()
  }, [measure])

  return (
    <nav
      ref={railRef}
      onMouseLeave={() => setHovered(null)}
      className="relative hidden items-center gap-0.5 rounded-2xl border border-[var(--s-border)] bg-[var(--s-panel-2)]/70 p-1 backdrop-blur-sm transition-colors duration-300 hover:border-brand-400/35 lg:flex"
    >
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-y-1 rounded-xl bg-[var(--s-panel)] transition-[opacity,transform,width,box-shadow] duration-300 ease-out',
          thumb ? 'opacity-100' : 'opacity-0',
          /* hovering lifts the thumb: brighter ring + brand glow */
          hovered
            ? 'shadow-[0_6px_20px_-6px_rgb(18_232_172/0.55)] ring-1 ring-brand-400/60'
            : 'shadow-[0_2px_10px_-4px_rgb(15_23_42/0.35)] ring-1 ring-brand-400/30',
        )}
        style={{
          width: thumb?.width ?? 0,
          transform: `translateX(${thumb?.left ?? 0}px)`,
          left: 0,
        }}
      />
      {sections.map(([key, id]) => (
        <a
          key={id}
          href={`#${id}`}
          ref={(el) => {
            itemsRef.current[id] = el
          }}
          onMouseEnter={() => setHovered(id)}
          onFocus={() => setHovered(id)}
          onBlur={() => setHovered(null)}
          aria-current={active === id ? 'true' : undefined}
          className={cn(
            'group relative z-10 rounded-xl px-3.5 py-2 text-[13.5px] font-bold transition-colors duration-200 focus-visible:outline-none',
            target === id ? 'text-brand-500' : 'text-muted hover:text-[var(--s-text)]',
          )}
        >
          <span className="relative inline-block transition-transform duration-300 ease-out group-hover:-translate-y-px">
            {t(key)}
          </span>
          {/* dot marks the section you're actually in, even while hovering elsewhere */}
          <span
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute inset-x-0 -bottom-0.5 mx-auto size-1 rounded-full bg-brand-500 transition-all duration-300',
              active === id ? 'scale-100 opacity-100' : 'scale-0 opacity-0',
            )}
          />
        </a>
      ))}
    </nav>
  )
}

export default function PublicLayout() {
  /* the landing page is dark-only — the app and login keep the user's choice */
  useForcedTheme('dark')

  const { t, isRTL } = useLang()
  const { isAuthed } = useAuth()
  const sections = useNavSections()
  const { scrolled, progress, active } = useHeaderScroll(sections)
  const [menuOpen, setMenuOpen] = useState(false)
  const { pathname, hash } = useLocation()
  const Arrow = isRTL ? ArrowLeft : ArrowRight

  useEffect(() => {
    setMenuOpen(false)
  }, [pathname, hash])

  /* an open sheet owns the screen — don't let the page scroll behind it */
  useEffect(() => {
    if (!menuOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [menuOpen])

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && setMenuOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex min-h-screen flex-col">
      {/* ── header ─────────────────────────────────────────────── */}
      <header
        className={cn(
          'fixed inset-x-0 top-0 z-[900] transition-all duration-300',
          scrolled
            /* a step lighter than the page so the bar lifts off the dark canvas */
            ? 'glass border-b border-[var(--s-border)] bg-[rgb(24_38_57/0.82)] shadow-[0_8px_30px_-12px_rgb(0_0_0/0.45)]'
            : 'border-b border-transparent bg-[rgb(20_32_48/0.55)] backdrop-blur-sm',
        )}
      >
        {/* hairline of brand light along the bottom edge once docked */}
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-x-0 bottom-0 h-px bg-linear-to-r from-transparent via-brand-400/45 to-transparent transition-opacity duration-300',
            scrolled ? 'opacity-100' : 'opacity-0',
          )}
        />

        <div
          className={cn(
            'mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 transition-[height] duration-300 sm:px-6',
            scrolled ? 'h-16' : 'h-20',
          )}
        >
          <Link
            to="/"
            className="shrink-0 rounded-xl transition-transform duration-200 hover:scale-[1.02] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-400"
          >
            <Logo name={t('brand.name')} tagline={t('brand.tagline')} />
          </Link>

          <DesktopNav active={active} />

          <div className="flex items-center gap-2">
            <LangToggle />
            <Button
              to={isAuthed ? '/app' : '/login'}
              size="sm"
              className="hidden shadow-lg shadow-brand-500/25 transition-shadow hover:shadow-brand-500/40 sm:inline-flex"
            >
              {isAuthed ? t('nav.dashboard') : t('nav.login')}
              <Arrow size={15} />
            </Button>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={t('nav.menu')}
              aria-expanded={menuOpen}
              className="grid size-10 cursor-pointer place-items-center rounded-xl border border-[var(--s-border)] bg-[var(--s-panel-2)] transition-colors hover:border-brand-400/50 hover:text-brand-500 lg:hidden"
            >
              {menuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {/* reading progress — only meaningful once the page is moving */}
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-x-0 bottom-0 h-[2px] origin-left bg-linear-to-r from-brand-400 to-accent-400 transition-opacity duration-300 rtl:origin-right',
            scrolled ? 'opacity-100' : 'opacity-0',
          )}
          style={{ transform: `scaleX(${progress})` }}
        />

        {/* mobile menu */}
        <div
          className={cn(
            'overflow-hidden transition-[max-height,opacity] duration-300 ease-out lg:hidden',
            menuOpen ? 'max-h-[70vh] opacity-100' : 'max-h-0 opacity-0',
          )}
        >
          <nav className="glass flex flex-col gap-1 border-t border-[var(--s-border)] bg-[rgb(24_38_57/0.9)] p-4">
            {sections.map(([key, id], i) => (
              <a
                key={id}
                href={`#${id}`}
                style={{ transitionDelay: menuOpen ? `${60 + i * 35}ms` : '0ms' }}
                className={cn(
                  'rounded-xl px-3 py-2.5 text-sm font-bold transition-all duration-300',
                  active === id
                    ? 'bg-brand-500/10 text-brand-500'
                    : 'text-muted hover:bg-[var(--s-panel-2)] hover:text-brand-500',
                  menuOpen ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0',
                )}
              >
                {t(key)}
              </a>
            ))}
            <Button to={isAuthed ? '/app' : '/login'} className="mt-2">
              {isAuthed ? t('nav.dashboard') : t('nav.login')}
              <Arrow size={15} />
            </Button>
          </nav>
        </div>
      </header>

      <main className="flex-1 pt-20">
        <Outlet />
      </main>

      <SiteFooter />
    </div>
  )
}

function SiteFooter() {
  const { t, isRTL } = useLang()
  const Arrow = isRTL ? ArrowLeft : ArrowRight
  const year = new Date().getFullYear()

  return (
    <footer className="relative overflow-hidden border-t border-[var(--s-border)] bg-[var(--s-bg-alt)]">
      {/* quiet texture + a hairline of brand light along the top edge */}
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-brand-400/45 to-transparent" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          backgroundImage:
            'linear-gradient(to right, var(--s-border) 1px, transparent 1px), linear-gradient(to bottom, var(--s-border) 1px, transparent 1px)',
          backgroundSize: '72px 72px',
          maskImage: 'radial-gradient(80% 90% at 50% 0%, black, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(80% 90% at 50% 0%, black, transparent 100%)',
        }}
      />
      <div className="pointer-events-none absolute -top-32 start-1/4 h-72 w-72 rounded-full bg-brand-500/8 blur-[110px]" />

      <div className="relative mx-auto max-w-7xl px-4 pt-12 pb-8 sm:px-6">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-12">
          {/* brand */}
          <div className="lg:col-span-6">
            <Logo name={t('brand.name')} tagline={t('brand.tagline')} size={38} />
            <p className="mt-3.5 max-w-md text-[13.5px] leading-relaxed text-muted">{t('footer.about')}</p>

            <a
              href="#contact"
              className="group mt-5 inline-flex items-center gap-2 rounded-xl border border-brand-500/30 bg-brand-500/10 px-4 py-2.5 text-[12.5px] font-extrabold text-brand-600 transition-all duration-300 hover:-translate-y-0.5 hover:border-brand-400/60 dark:text-brand-300"
            >
              {t('cta.btn')}
              <Arrow size={14} className="transition-transform duration-300 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
            </a>
          </div>

          <div className="lg:col-span-3">
            <FooterCol
              title={t('footer.product')}
              links={[
                [t('nav.features'), '#features'],
                [t('nav.solutions'), '#solutions'],
                [t('nav.pricing'), '#pricing'],
                [t('nav.apps'), '#apps'],
              ]}
            />
          </div>

          <div className="lg:col-span-3">
            <FooterCol
              title={t('footer.company')}
              links={[
                [t('nav.how'), '#how'],
                [t('nav.faq'), '#faq'],
                [t('nav.contact'), '#contact'],
              ]}
            />
          </div>
        </div>

        {/* bottom bar */}
        <div className="mt-10 border-t border-[var(--s-border)] pt-5">
          <div className="flex flex-col items-center gap-3 text-xs text-muted">
            <div className="flex flex-wrap items-center justify-center gap-5">
              <span className="inline-flex items-center gap-2 rounded-full border border-brand-500/25 bg-brand-500/10 px-3 py-1 font-bold text-brand-600 dark:text-brand-300">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-400 opacity-70" />
                  <span className="relative inline-flex size-2 rounded-full bg-brand-500" />
                </span>
                {t('footer.operational')}
              </span>
              <a href="#" className="font-bold transition-colors hover:text-brand-500">{t('footer.privacy')}</a>
              <a href="#" className="font-bold transition-colors hover:text-brand-500">{t('footer.terms')}</a>
            </div>

            <p className="text-center">
              © {year} {t('brand.name')} — {t('footer.rights')}
            </p>
          </div>
        </div>

      </div>
    </footer>
  )
}

function FooterCol({ title, links }) {
  return (
    <div>
      <h4 className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-muted">{title}</h4>
      <ul className="mt-3.5 space-y-2 text-[13.5px]">
        {links.map(([label, href]) => (
          <li key={label}>
            <a
              href={href}
              className="group inline-flex items-center gap-1.5 font-bold text-muted transition-colors hover:text-brand-500"
            >
              <span className="h-px w-0 bg-brand-500 transition-all duration-300 group-hover:w-3" />
              {label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
