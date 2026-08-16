import { useEffect, useRef, useState, forwardRef } from 'react'
import { Link } from 'react-router-dom'
import { X, ChevronDown, Check } from 'lucide-react'
import { useLang } from '../../context/LanguageContext'

export const cn = (...parts) => parts.filter(Boolean).join(' ')

/* ── Button ──────────────────────────────────────────────────────── */
const BTN_VARIANTS = {
  primary:
    'bg-linear-to-br from-brand-400 to-brand-600 text-[#04120c] hover:from-brand-300 hover:to-brand-500 shadow-lg shadow-brand-500/25 hover:shadow-brand-400/40',
  secondary: 'surface-2 hover:border-brand-400/50 hover:text-brand-500',
  ghost: 'bg-transparent hover:bg-[var(--s-panel-2)] border border-transparent',
  outline: 'bg-transparent border border-[var(--s-border-strong)] hover:border-brand-400 hover:text-brand-500',
  danger: 'bg-[#f4634e]/12 text-[#f4634e] border border-[#f4634e]/35 hover:bg-[#f4634e]/20',
  glass: 'glass hover:border-brand-400/50',
}
const BTN_SIZES = {
  sm: 'h-9 px-3.5 text-[13px] gap-1.5 rounded-lg',
  md: 'h-11 px-5 text-sm gap-2 rounded-xl',
  lg: 'h-13 px-7 text-base gap-2.5 rounded-xl',
}

export const Button = forwardRef(function Button(
  { as, to, href, variant = 'primary', size = 'md', className, children, ...rest },
  ref,
) {
  const classes = cn(
    'inline-flex items-center justify-center font-bold whitespace-nowrap transition-all duration-200 active:scale-[.97] disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400 cursor-pointer',
    BTN_VARIANTS[variant],
    BTN_SIZES[size],
    className,
  )
  if (to) return <Link ref={ref} to={to} className={classes} {...rest}>{children}</Link>
  if (href) return <a ref={ref} href={href} className={classes} {...rest}>{children}</a>
  const Tag = as ?? 'button'
  return <Tag ref={ref} className={classes} {...rest}>{children}</Tag>
})

/* ── tone system ─────────────────────────────────────────────────────
   One source of truth for the accent colours used by cards, icon plates,
   stat tiles and rails, so every inner page speaks the same language. */
export const TONE_TEXT = {
  brand: 'text-brand-500',
  sky: 'text-accent-500',
  amber: 'text-[#c58f00] dark:text-[#f5b301]',
  red: 'text-[#e04b34] dark:text-[#f4634e]',
  violet: 'text-[#7c5cf0] dark:text-[#a78bfa]',
  slate: 'text-[#6c7d92] dark:text-[#a9b8ca]',
}

/** Raw tone colours — used where CSS needs a value (rails, dots, charts). */
export const TONE_HEX = {
  brand: '#00a97a',
  sky: '#0ea5e9',
  amber: '#f5b301',
  red: '#f4634e',
  violet: '#a78bfa',
  slate: '#8898ac',
}

/** Tinted, ringed icon plate — the recurring "card identity" mark. */
export function IconPlate({ icon: Icon, tone = 'brand', size = 'md', className }) {
  const box = { sm: 'size-8 rounded-lg', md: 'size-10 rounded-xl', lg: 'size-12 rounded-2xl' }[size]
  const glyph = { sm: 15, md: 18, lg: 22 }[size]
  return (
    <span className={cn('icon-plate shrink-0', box, TONE_TEXT[tone] ?? TONE_TEXT.brand, className)}>
      <Icon size={glyph} />
    </span>
  )
}

/* ── Card ────────────────────────────────────────────────────────── */
/**
 * The single panel primitive for every app page.
 * `hover`  — the card is a link/target: lifts and haloes on hover.
 * `rail`   — paints a thin tone-coloured rail across the top edge.
 * `raised` — one step higher on the elevation ladder (floating panels).
 */
export function Card({ className, hover = false, rail, raised = false, style, children, ...rest }) {
  return (
    <div
      className={cn('card rounded-2xl overflow-hidden', raised && 'card-raised', hover && 'card-link', rail && 'card-rail', className)}
      style={rail ? { '--rail': TONE_HEX[rail] ?? TONE_HEX.brand, ...style } : style}
      {...rest}
    >
      {children}
    </div>
  )
}

export function CardHeader({ title, subtitle, action, icon: Icon, tone = 'brand', dense = false, className }) {
  return (
    <div
      className={cn(
        'card-head flex items-start justify-between gap-4 border-b border-[var(--s-border)]/60 bg-gradient-to-r from-[var(--s-panel-2)]/60 to-transparent',
        dense ? 'p-3 sm:p-3.5' : 'px-5 py-4 sm:px-6 sm:py-5',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-4">
        {Icon && (
          <div className="relative group">
            <IconPlate icon={Icon} tone={tone} size={dense ? 'sm' : 'md'} className="relative z-10 shadow-sm" />
            <div className={cn("absolute inset-0 z-0 blur-md opacity-0 transition-opacity duration-500 group-hover:opacity-40", TONE_TEXT[tone] ?? 'text-brand-500')} style={{ backgroundColor: 'currentColor' }} />
          </div>
        )}
        <div className="min-w-0">
          <h3 className="truncate text-[16px] font-black leading-tight tracking-tight text-slate-900 dark:text-white">{title}</h3>
          {subtitle && <p className="mt-0 truncate text-[12px] font-bold text-[var(--s-text-muted)]">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="flex shrink-0 flex-wrap items-center justify-end gap-3">{action}</div>}
    </div>
  )
}

/** Padded body for a card — keeps inner spacing identical everywhere. */
export function CardBody({ className, children, ...rest }) {
  return (
    <div className={cn('p-4 sm:p-5', className)} {...rest}>
      {children}
    </div>
  )
}

/* ── Empty / placeholder state ───────────────────────────────────── */
export function EmptyState({ icon: Icon, title, desc, action, tone = 'brand', className }) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-14 text-center', className)}>
      {Icon && <IconPlate icon={Icon} tone={tone} size="lg" className="mb-4 !size-16 !rounded-3xl" />}
      <p className="text-[15px] font-extrabold">{title}</p>
      {desc && <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted">{desc}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

/* ── Toolbar — the filter/action strip that sits above content ───── */
export function Toolbar({ className, children }) {
  return (
    <Card className={cn('flex flex-wrap items-center gap-3 p-3 sm:p-3.5', className)}>{children}</Card>
  )
}

/* ── Badge / status ──────────────────────────────────────────────── */
const BADGE_TONES = {
  brand: 'bg-brand-500/12 text-brand-600 dark:text-brand-300 border-brand-500/25',
  sky: 'bg-accent-500/12 text-accent-600 dark:text-accent-400 border-accent-500/25',
  amber: 'bg-[#f5b301]/14 text-[#b07d00] dark:text-[#f5b301] border-[#f5b301]/30',
  red: 'bg-[#f4634e]/14 text-[#c8341e] dark:text-[#f4634e] border-[#f4634e]/30',
  violet: 'bg-[#a78bfa]/14 text-[#6d47d9] dark:text-[#c4b5fd] border-[#a78bfa]/30',
  slate: 'bg-[#8898ac]/14 text-[#5d6c81] dark:text-[#a9b8ca] border-[#8898ac]/30',
}
export function Badge({ tone = 'brand', className, children, dot = false }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold leading-none',
        BADGE_TONES[tone] ?? BADGE_TONES.brand,
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

export const STATUS_TONE = { moving: 'brand', idle: 'amber', stopped: 'red', offline: 'slate' }

export function StatusPill({ status, label, className }) {
  return (
    <Badge tone={STATUS_TONE[status] ?? 'slate'} dot className={className}>
      {label}
    </Badge>
  )
}

/* ── form controls ───────────────────────────────────────────────── */
const FIELD_BASE =
  'w-full rounded-xl border bg-[var(--s-panel-2)] px-3.5 text-sm outline-none transition-all duration-200 placeholder:text-[var(--s-text-muted)] focus:border-brand-400 focus:ring-4 focus:ring-brand-400/12 disabled:opacity-50'

export function Input({ className, icon: Icon, ...rest }) {
  if (Icon) {
    return (
      <div className="relative">
        <Icon size={16} className="pointer-events-none absolute top-1/2 start-3.5 -translate-y-1/2 text-muted" />
        <input className={cn(FIELD_BASE, 'h-11 ps-10', className)} {...rest} />
      </div>
    )
  }
  return <input className={cn(FIELD_BASE, 'h-11', className)} {...rest} />
}

export function Textarea({ className, ...rest }) {
  return <textarea className={cn(FIELD_BASE, 'py-3 min-h-28 resize-y', className)} {...rest} />
}

export function Select({ className, children, ...rest }) {
  return (
    <div className="relative">
      <select className={cn(FIELD_BASE, 'h-11 appearance-none pe-9 cursor-pointer', className)} {...rest}>
        {children}
      </select>
      <ChevronDown size={15} className="pointer-events-none absolute top-1/2 end-3.5 -translate-y-1/2 text-muted" />
    </div>
  )
}

export function Field({ label, hint, children, className }) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-2 block text-[12.5px] font-extrabold text-[var(--s-text)]">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted">{hint}</span>}
    </label>
  )
}

export function Switch({ checked, onChange, label, id }) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-6 w-11 shrink-0 cursor-pointer rounded-full border transition-colors duration-200',
        checked ? 'bg-brand-500/85 border-brand-500' : 'bg-[var(--s-panel-2)] border-[var(--s-border-strong)]',
      )}
    >
      <span
        className={cn(
          'absolute top-1/2 size-4.5 -translate-y-1/2 rounded-full bg-white shadow transition-all duration-200',
          checked ? 'start-[22px]' : 'start-[3px]',
        )}
      />
    </button>
  )
}

export function Checkbox({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="inline-flex cursor-pointer items-center gap-2 text-sm"
    >
      <span
        className={cn(
          'grid size-5 place-items-center rounded-md border transition-colors',
          checked ? 'border-brand-500 bg-brand-500 text-[#04120c]' : 'border-[var(--s-border-strong)]',
        )}
      >
        {checked && <Check size={13} strokeWidth={3.5} />}
      </span>
      {label && <span>{label}</span>}
    </button>
  )
}

/* ── Segmented control ───────────────────────────────────────────── */
export function Segmented({ options, value, onChange, className, size = 'md' }) {
  return (
    <div className={cn('inline-flex gap-1 rounded-xl border p-1 surface-2', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'cursor-pointer rounded-lg font-bold transition-all duration-200',
            size === 'sm' ? 'px-2.5 py-1 text-[12px]' : 'px-3.5 py-1.5 text-[13px]',
            value === o.value
              ? 'bg-brand-500 text-[#04120c] shadow-sm'
              : 'text-[var(--s-text)]/75 hover:bg-[var(--s-panel)] hover:text-[var(--s-text)]',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ── Modal ───────────────────────────────────────────────────────── */
/**
 * `error` sits in its own band between the header and the scrolling body
 * rather than inside it. A form taller than the modal starts scrolled, and a
 * message placed at the top of that scroll box is simply not on screen when
 * the save button that produced it is at the bottom — the refusal reads as
 * the button doing nothing at all.
 */
export function Modal({ open, onClose, title, children, footer, error, size = 'md', offsetY = 0 }) {
  const { t } = useLang()
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null
  const width = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' }[size]

  return (
    <div className="fixed inset-0 z-[1200] grid place-items-center p-4">
      <button
        aria-label={t('common.close')}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/55 backdrop-blur-sm"
      />
      <div
        className={cn('card relative w-full rounded-2xl shadow-[var(--s-e3)]', width)}
        style={offsetY ? { transform: `translateY(${offsetY}px)` } : undefined}
      >
        <div className="card-head flex items-center justify-between gap-3 border-b p-4 sm:p-5">
          <h3 className="font-extrabold">{title}</h3>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            title={t('common.close')}
            className="grid size-8 cursor-pointer place-items-center rounded-lg text-muted transition-colors hover:bg-[var(--s-panel-2)] hover:text-[var(--s-text)]"
          >
            <X size={17} />
          </button>
        </div>
        {error && (
          <p
            role="alert"
            className="border-b border-[#f4634e]/25 bg-[#f4634e]/12 px-4 py-3 text-[12.5px] font-bold text-[#e04b34] sm:px-5 dark:text-[#f4634e]"
          >
            {error}
          </p>
        )}
        <div className="max-h-[65vh] overflow-y-auto p-4 sm:p-5">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t p-4">{footer}</div>}
      </div>
    </div>
  )
}

/* ── Table shell ─────────────────────────────────────────────────── */
/** fit: يلغي التمرير الأفقي — تنكمش الأعمدة ويلتف النص بدلًا من ذلك */
export function Table({ columns, rows, renderRow, empty, onRowClick, activeId, className, fit = false }) {
  return (
    <div
      className={cn(
        fit
          ? 'overflow-x-hidden [&_td]:whitespace-normal [&_td]:break-words [&_td]:px-3'
          : 'overflow-x-auto',
        className,
      )}
    >
      <table className={cn('w-full border-collapse text-sm', fit && 'table-fixed')}>
        <thead className="sticky top-0 z-10 bg-[var(--s-bg-alt)]/95 backdrop-blur-sm">
          <tr className="border-b border-[var(--s-border-strong)]">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                style={fit && c.width ? { width: c.width } : undefined}
                className={cn(
                  'align-middle text-[13px] font-black uppercase tracking-[0.06em] text-[var(--s-text)]',
                  fit ? 'whitespace-normal break-words px-3 py-3 leading-tight' : 'whitespace-nowrap px-5 py-3',
                  // نفس محاذاة الخلايا: بداية السطر ما لم يحدد العمود محاذاة أخرى
                  /\btext-(start|end|center|left|right)\b/.test(c.className ?? '') ? '' : 'text-start',
                  c.className,
                )}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-14 text-center text-[13px] font-bold text-muted">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr
                key={row.id ?? i}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  'group border-b border-[var(--s-border)]/55 transition-colors duration-200 last:border-0',
                  // شريط جانبي رفيع (يتبع اتجاه اللغة) بدون أي إزاحة للمحتوى
                  '[&>td:first-child]:border-s-[3px] [&>td:first-child]:[border-inline-start-color:transparent]',
                  onRowClick && 'cursor-pointer',
                  activeId != null && row.id === activeId
                    ? 'bg-brand-500/10 [&>td:first-child]:[border-inline-start-color:var(--color-brand-500)]'
                    : 'hover:bg-[var(--s-panel-2)] hover:[&>td:first-child]:[border-inline-start-color:var(--s-border-strong)]',
                )}
              >
                {renderRow(row, i)}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

export function Td({ className, children, ...rest }) {
  return (
    <td
      className={cn(
        'whitespace-nowrap px-5 py-2.5 align-middle',
        /\btext-(start|end|center|left|right)\b/.test(className ?? '') ? '' : 'text-start',
        className,
      )}
      {...rest}
    >
      {children}
    </td>
  )
}

/* ── Stat tile ───────────────────────────────────────────────────── */
export function StatTile({ icon: Icon, label, value, unit, tone = 'brand', trend, footer, className }) {
  const color = TONE_HEX[tone] || TONE_HEX.brand;
  return (
    <div 
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-2xl border border-[var(--s-border)] bg-[var(--s-panel)]/90 p-5 shadow-lg shadow-black/5 dark:shadow-black/20 transition-all duration-500 hover:-translate-y-1 hover:border-[var(--vc)] hover:shadow-2xl', 
        className
      )}
      style={{ '--vc': color }}
    >
      {/* Colored top edge line */}
      <div 
        className="absolute inset-x-0 top-0 h-[3px] opacity-70 transition-all duration-500 group-hover:opacity-100 group-hover:h-[4px]" 
        style={{ background: color, boxShadow: `0 0 15px ${color}` }} 
      />
      
      {/* Animated scanline texture on hover */}
      <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-[0.02] mix-blend-overlay transition-opacity duration-500" style={{ backgroundImage: 'repeating-linear-gradient(45deg, var(--s-text) 0, var(--s-text) 1px, transparent 1px, transparent 4px)' }} />

      <div className="relative flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-extrabold uppercase tracking-wider text-[var(--s-text)] mb-1">
            {label}
          </p>
          <p className="flex items-baseline gap-1.5">
            <span className="text-[32px] font-black tabular-nums tracking-tight drop-shadow-sm text-[var(--s-text)] leading-none">{value}</span>
            {unit && <span className="text-sm font-bold text-muted">{unit}</span>}
          </p>
          {trend && <p className="mt-1.5 text-[11.5px] font-bold" style={{ color }}>{trend}</p>}
        </div>
        
        {Icon && (
          <div 
            className="grid size-12 shrink-0 place-items-center rounded-xl transition-all duration-500 group-hover:scale-110 group-hover:rotate-3 group-hover:shadow-[0_0_15px_var(--vc)]" 
            style={{ 
              backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`, 
              color: color,
              border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`
            }}
          >
            <Icon size={22} strokeWidth={2.5} />
          </div>
        )}
      </div>
      
      {footer && (
        <div className="relative mt-4 border-t border-[var(--s-border)] pt-3 transition-colors duration-500 group-hover:border-[var(--vc)]">
          <p className="text-[11.5px] font-bold text-muted transition-colors duration-500 group-hover:text-[var(--s-text)]">{footer}</p>
        </div>
      )}
    </div>
  )
}

/* ── scroll reveal ───────────────────────────────────────────────── */
export function Reveal({ children, delay = 0, className, as: Tag = 'div' }) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          io.disconnect()
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -60px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <Tag ref={ref} className={cn('reveal', visible && 'is-visible', className)} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </Tag>
  )
}

/* ── section heading ─────────────────────────────────────────────── */
export function SectionHeading({ eyebrow, title, desc, center = true, className }) {
  return (
    <div className={cn(center && 'mx-auto text-center', 'max-w-2xl', className)}>
      {eyebrow && (
        <span className="inline-flex items-center gap-2 rounded-full border border-brand-500/25 bg-brand-500/10 px-3.5 py-1.5 text-[11px] font-extrabold uppercase tracking-widest text-brand-600 dark:text-brand-300">
          {eyebrow}
        </span>
      )}
      <h2 className="mt-4 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">{title}</h2>
      {desc && <p className="mt-3 text-[15px] leading-relaxed text-muted">{desc}</p>}
    </div>
  )
}

/* ── brand logo ──────────────────────────────────────────────────── */
export function Logo({ size = 38, withText = true, name, tagline, className }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <span
        className="relative grid shrink-0 place-items-center rounded-xl bg-linear-to-br from-brand-400 to-brand-600 shadow-lg shadow-brand-500/30"
        style={{ width: size, height: size }}
      >
        <svg viewBox="0 0 24 24" width={size * 0.56} height={size * 0.56} fill="none" aria-hidden="true">
          <path
            d="M12 2.5a6.5 6.5 0 0 0-6.5 6.5c0 4.9 6.5 12.5 6.5 12.5s6.5-7.6 6.5-12.5A6.5 6.5 0 0 0 12 2.5Z"
            fill="#04120c"
          />
          <circle cx="12" cy="9" r="2.4" fill="#00c391" />
        </svg>
      </span>
      {withText && (
        <span className="leading-none">
          <span className="block text-[17px] font-extrabold tracking-tight">{name}</span>
          {tagline && <span className="mt-0.5 block text-[10px] font-bold text-muted">{tagline}</span>}
        </span>
      )}
    </span>
  )
}
