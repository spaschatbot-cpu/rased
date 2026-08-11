import { Moon, Sun, Globe } from 'lucide-react'
import { useTheme } from '../../context/ThemeContext'
import { useLang } from '../../context/LanguageContext'
import { cn } from '../ui'

/* explicit h-/w- (never `size-`) so a caller's className can't collide with
   the base sizing and wrap the label onto a second line */
const BTN_BASE =
  'group relative inline-flex h-10 cursor-pointer select-none items-center justify-center overflow-hidden rounded-xl border whitespace-nowrap transition-all duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-400/25'

/* `surface` sits on app chrome · `glass` on imagery (login stage)
   `ghost` is for buttons already inside a bordered cluster/pill */
const BTN_VARIANT = {
  surface:
    'border-[var(--s-border)] bg-[var(--s-panel-2)] text-muted hover:border-brand-400/50 hover:text-brand-500',
  glass:
    'border-white/15 bg-white/8 text-white/75 backdrop-blur-xl hover:border-brand-400/45 hover:bg-white/14 hover:text-brand-300',
  ghost: 'border-transparent bg-transparent text-white/70 hover:bg-white/10 hover:text-brand-300',
}

export function ThemeToggle({ className, variant = 'surface' }) {
  const { isDark, toggleTheme } = useTheme()
  const { t } = useLang()
  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={t('common.theme')}
      aria-label={t('common.theme')}
      aria-pressed={isDark}
      className={cn(BTN_BASE, BTN_VARIANT[variant], 'w-10', className)}
    >
      {/* soft halo that warms up in light mode / cools down in dark */}
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100',
          isDark
            ? 'bg-[radial-gradient(circle_at_50%_120%,rgb(56_189_248/0.28),transparent_70%)]'
            : 'bg-[radial-gradient(circle_at_50%_120%,rgb(245_179_1/0.28),transparent_70%)]',
        )}
      />
      <span className="relative grid size-[18px] place-items-center">
        <Sun
          size={18}
          className={cn(
            'absolute transition-all duration-300 ease-out',
            isDark ? 'scale-50 rotate-90 opacity-0' : 'scale-100 rotate-0 opacity-100',
          )}
        />
        <Moon
          size={18}
          className={cn(
            'absolute transition-all duration-300 ease-out',
            isDark ? 'scale-100 rotate-0 opacity-100' : 'scale-50 -rotate-90 opacity-0',
          )}
        />
      </span>
    </button>
  )
}

/**
 * Language switch.
 * `segmented` renders both locales side by side with the active one lit —
 * unambiguous at a glance; the default compact form shows globe + target code.
 */
export function LangToggle({ className, variant = 'surface', segmented = false }) {
  const { lang, setLang, toggleLang, t } = useLang()

  if (segmented) {
    const onStage = variant !== 'surface'
    return (
      <div
        role="group"
        aria-label={t('common.language')}
        className={cn(
          'relative inline-flex h-10 items-center rounded-xl border p-1',
          onStage ? 'border-white/12 bg-white/6' : 'border-[var(--s-border)] bg-[var(--s-panel-2)]',
          className,
        )}
      >
        {/* sliding thumb */}
        <span
          aria-hidden="true"
          className={cn(
            'absolute inset-y-1 w-[calc(50%-0.25rem)] rounded-lg bg-brand-500/90 shadow-[0_4px_14px_-4px_rgb(18_232_172/0.7)] transition-transform duration-300 ease-out',
            'start-1',
            lang === 'ar' ? 'translate-x-0' : 'rtl:-translate-x-full ltr:translate-x-full',
          )}
        />
        {['ar', 'en'].map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => setLang(code)}
            aria-pressed={lang === code}
            className={cn(
              'relative z-10 grid h-full w-9 cursor-pointer place-items-center rounded-lg text-[11.5px] font-extrabold transition-colors duration-200',
              lang === code
                ? 'text-[#04231a]'
                : onStage
                  ? 'text-white/60 hover:text-white'
                  : 'text-muted hover:text-brand-500',
            )}
          >
            {code === 'ar' ? 'ع' : 'EN'}
          </button>
        ))}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={toggleLang}
      title={t('common.language')}
      aria-label={t('common.language')}
      className={cn(BTN_BASE, BTN_VARIANT[variant], 'w-auto gap-1.5 px-3 text-[12px] font-extrabold', className)}
    >
      <Globe size={16} className="transition-transform duration-500 group-hover:rotate-180" />
      <span>{lang === 'ar' ? 'EN' : 'ع'}</span>
    </button>
  )
}
