import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  LayoutDashboard, Sparkles, Truck, ListOrdered, CreditCard, Smartphone, HelpCircle,
  Mail, Megaphone, PanelsTopLeft, Eye, EyeOff, ChevronUp, ChevronDown, RotateCcw,
  Search, LogOut, ExternalLink, Check, SlidersHorizontal, Pencil, X, Layers,
  ChevronLeft, ChevronRight, Loader2, AlertTriangle, Inbox, Trash2,
  RefreshCw, Phone, Building2, Users,
} from 'lucide-react'
import { api } from '../../lib/api'
import { useLang } from '../../context/LanguageContext'
import { useAuth } from '../../context/AuthContext'
import { useSite } from '../../context/SiteContentContext'
import { translations } from '../../i18n/translations'
import { Button, Input, Textarea, cn } from '../../components/ui'
import { LangToggle } from '../../components/common/Toggles'

/* Which translation keys belong to which part of the landing page. Keys are
   matched by prefix so new copy added to the dictionary shows up here on its
   own — no second list to keep in sync. */
const GROUPS = [
  { id: 'brand', icon: PanelsTopLeft, prefixes: ['brand.', 'nav.'], section: null },
  { id: 'hero', icon: Sparkles, prefixes: ['hero.', 'stat.'], section: 'hero' },
  { id: 'features', icon: LayoutDashboard, prefixes: ['features.', 'feat.'], section: 'features' },
  { id: 'solutions', icon: Truck, prefixes: ['sol.'], section: 'solutions' },
  { id: 'how', icon: ListOrdered, prefixes: ['how.'], section: 'how' },
  { id: 'pricing', icon: CreditCard, prefixes: ['price.'], section: 'pricing' },
  { id: 'apps', icon: Smartphone, prefixes: ['apps.'], section: 'apps' },
  { id: 'faq', icon: HelpCircle, prefixes: ['faq.'], section: 'faq' },
  { id: 'contact', icon: Mail, prefixes: ['contact.'], section: 'contact' },
  { id: 'cta', icon: Megaphone, prefixes: ['cta.'], section: 'cta' },
  { id: 'footer', icon: PanelsTopLeft, prefixes: ['footer.'], section: null },
]

/* Two rail entries are not copy groups — they swap the editor for a different
   surface entirely — so they live beside the groups rather than in them. */
const LAYOUT = { id: 'layout', icon: SlidersHorizontal, label: 'admin.layout' }
const INBOX = { id: 'inbox', icon: Inbox, label: 'admin.g.inbox' }
const EXTRAS = [LAYOUT, INBOX]

/* Friendly names for the recurring key suffixes, so the editor reads as copy
   slots rather than as a dump of dictionary keys. */
const SLOT_LABELS = {
  title: ['العنوان', 'Title'],
  title1: ['العنوان — الجزء الأول', 'Title — part 1'],
  title2: ['العنوان — الجزء الثاني', 'Title — part 2'],
  t: ['العنوان', 'Title'],
  desc: ['الوصف', 'Description'],
  d: ['الوصف', 'Description'],
  eyebrow: ['الشارة العلوية', 'Eyebrow'],
  badge: ['الشارة', 'Badge'],
  cta: ['الزر الرئيسي', 'Primary button'],
  cta2: ['الزر الثانوي', 'Secondary button'],
  btn: ['الزر الرئيسي', 'Primary button'],
  name: ['الاسم', 'Name'],
  tagline: ['الوصف المختصر', 'Tagline'],
  popular: ['شارة الأكثر طلبًا', 'Popular badge'],
  month: ['دورية السعر', 'Billing period'],
  currency: ['العملة', 'Currency'],
  custom: ['السعر المخصص', 'Custom price'],
  send: ['زر الإرسال', 'Submit button'],
  sending: ['أثناء الإرسال', 'While sending'],
  sent: ['رسالة النجاح', 'Success message'],
  err: ['رسالة الفشل', 'Failure message'],
  addr: ['العنوان البريدي', 'Address'],
  rights: ['حقوق النشر', 'Copyright'],
  privacy: ['سياسة الخصوصية', 'Privacy'],
  terms: ['الشروط والأحكام', 'Terms'],
  operational: ['حالة النظام', 'System status'],
  about: ['نبذة', 'About'],
  home: ['رابط الرئيسية', 'Home link'],
  features: ['رابط المميزات', 'Features link'],
  solutions: ['رابط الحلول', 'Solutions link'],
  how: ['رابط كيف يعمل', 'How it works link'],
  pricing: ['رابط الباقات', 'Pricing link'],
  apps: ['رابط التطبيقات', 'Apps link'],
  faq: ['رابط الأسئلة', 'FAQ link'],
  contact: ['رابط التواصل', 'Contact link'],
  login: ['زر تسجيل الدخول', 'Login button'],
  dashboard: ['زر لوحة التحكم', 'Dashboard button'],
  logout: ['زر تسجيل الخروج', 'Logout button'],
  menu: ['زر القائمة', 'Menu button'],
  sats: ['مؤشر الأقمار', 'Satellites stat'],
  satsVal: ['قيمة مؤشر الأقمار', 'Satellites value'],
  uptime: ['مؤشر الجاهزية', 'Uptime stat'],
  uptimeVal: ['قيمة مؤشر الجاهزية', 'Uptime value'],
  refresh: ['مؤشر التحديث', 'Refresh stat'],
  refreshVal: ['قيمة مؤشر التحديث', 'Refresh value'],
  basic: ['اسم الباقة الأساسية', 'Basic plan name'],
  basicD: ['وصف الباقة الأساسية', 'Basic plan description'],
  basicVal: ['سعر الباقة الأساسية', 'Basic plan price'],
  pro: ['اسم الباقة الاحترافية', 'Pro plan name'],
  proD: ['وصف الباقة الاحترافية', 'Pro plan description'],
  proVal: ['سعر الباقة الاحترافية', 'Pro plan price'],
  ent: ['اسم باقة المؤسسات', 'Enterprise plan name'],
  entD: ['وصف باقة المؤسسات', 'Enterprise plan description'],
  ctaEnt: ['زر باقة المؤسسات', 'Enterprise button'],
  live: ['ميزة: الخريطة الحية', 'Feature: live map'],
  history: ['ميزة: سجل المسارات', 'Feature: route history'],
  history1y: ['ميزة: سجل سنة كاملة', 'Feature: yearly history'],
  alerts: ['ميزة: التنبيهات', 'Feature: alerts'],
  alertsAdv: ['ميزة: تنبيهات متقدمة', 'Feature: advanced alerts'],
  geo: ['ميزة: المناطق الجغرافية', 'Feature: geofences'],
  reports: ['ميزة: التقارير', 'Feature: reports'],
  api: ['ميزة: ربط API', 'Feature: API'],
  support: ['ميزة: الدعم الفني', 'Feature: support'],
  supportPro: ['ميزة: دعم الأولوية', 'Feature: priority support'],
  manager: ['ميزة: مدير الحساب', 'Feature: account manager'],
  sla: ['ميزة: اتفاقية الخدمة', 'Feature: SLA'],
  company: ['اسم الشركة', 'Company'],
  phone: ['رقم الجوال', 'Phone'],
  email: ['البريد الإلكتروني', 'Email'],
  fleet: ['حجم الأسطول', 'Fleet size'],
  message: ['الرسالة', 'Message'],
  phoneLabel: ['عنوان حقل الهاتف', 'Phone label'],
  emailLabel: ['عنوان حقل البريد', 'Email label'],
  addrLabel: ['عنوان حقل العنوان', 'Address label'],
  phoneVal: ['رقم الهاتف المعروض', 'Displayed phone'],
  emailVal: ['البريد المعروض', 'Displayed email'],
  phoneHint: ['تلميح حقل الهاتف', 'Phone placeholder'],
  emailHint: ['تلميح حقل البريد', 'Email placeholder'],
  fleet1: ['حجم الأسطول — الخيار 1', 'Fleet option 1'],
  fleet2: ['حجم الأسطول — الخيار 2', 'Fleet option 2'],
  fleet3: ['حجم الأسطول — الخيار 3', 'Fleet option 3'],
  fleet4: ['حجم الأسطول — الخيار 4', 'Fleet option 4'],
  mockTime: ['موك: ساعة الجوال', 'Mock: clock'],
  mockList: ['موك: عنوان القائمة', 'Mock: list title'],
  mockKpi: ['موك: عنوان المؤشر', 'Mock: KPI label'],
  mockKpiVal: ['موك: قيمة المؤشر', 'Mock: KPI value'],
  mockPlate1: ['موك: لوحة المركبة 1', 'Mock: plate 1'],
  mockSpeed1: ['موك: سرعة المركبة 1', 'Mock: speed 1'],
  mockPlate2: ['موك: لوحة المركبة 2', 'Mock: plate 2'],
  mockSpeed2: ['موك: سرعة المركبة 2', 'Mock: speed 2'],
  mockPlate3: ['موك: لوحة المركبة 3', 'Mock: plate 3'],
  mockSpeed3: ['موك: سرعة المركبة 3', 'Mock: speed 3'],
  product: ['عمود المنتج', 'Product column'],
}

const BASE_KEYS = Object.keys(translations.ar)
const keysOf = (group) => BASE_KEYS.filter((k) => group.prefixes.some((p) => k.startsWith(p)))

/* ── keys → cards ────────────────────────────────────────────────────
   An admin thinks in things — a feature, a plan, a question — not in
   dictionary keys. These rules fold the flat key list back into those
   things, so each one gets a card instead of a run of loose inputs.     */

/* Trailing decorations that mark a key as another slot of the SAME thing:
   price.basic / price.basicD / price.basicVal all describe one plan. */
const SLOT_SUFFIX = /(D|Val|Label|Hint|\d+)$/

function stemOf(key) {
  const parts = key.split('.')
  const last = parts.at(-1)

  /* feat.live.t → feat.live   |   price.f.api → price.f */
  if (parts.length >= 3) return parts.slice(0, -1).join('.')

  /* faq.q3 + faq.a3 → faq.3 */
  const qa = /^([qa])(\d+)$/.exec(last)
  if (qa) return `${parts[0]}.${qa[2]}`

  /* apps.mockPlate2 + apps.mockSpeed2 → apps.mock2 (one phone row) */
  const mock = /^mock(?:Plate|Speed)(\d+)$/.exec(last)
  if (mock) return `${parts[0]}.mock${mock[1]}`

  return `${parts[0]}.${last.replace(SLOT_SUFFIX, '') || last}`
}

/* A card whose slots are a list rather than one thing can't take its headline
   from its own values, so it is named here instead. */
const CARD_TITLES = {
  'price.f': ['بنود مقارنة الباقات', 'Plan comparison lines'],
}

/* Which key inside a card carries its headline, and which its supporting line.
   Ranked: the lower the score, the more title-like the slot. */
const titleRank = (key) => {
  const last = key.split('.').pop()
  if (/^(t|title|title1)$/.test(last)) return 0
  if (/^q\d+$/.test(last)) return 1
  if (/^(eyebrow|badge|name)$/.test(last)) return 3
  if (SLOT_SUFFIX.test(last)) return 4
  return 2
}
const descRank = (key) => {
  const last = key.split('.').pop()
  if (/^(d|desc)$/.test(last)) return 0
  if (/^a\d+$/.test(last)) return 1
  if (/D$/.test(last)) return 2
  if (/Val$/.test(last)) return 3
  return 5
}

/**
 * Cards for one group: the section's loose copy first, then one card per
 * repeating item. A stem with a single key isn't an item of its own — it is
 * part of the section's general copy, so it folds into the first card.
 */
function cardsOf(group) {
  const buckets = new Map()
  for (const key of keysOf(group)) {
    const stem = stemOf(key)
    if (!buckets.has(stem)) buckets.set(stem, [])
    buckets.get(stem).push(key)
  }

  const loose = []
  const items = []
  for (const [stem, keys] of buckets) {
    if (keys.length < 2) loose.push(...keys)
    else items.push({ id: stem, keys })
  }

  const cards = items.map((c) => ({
    ...c,
    name: CARD_TITLES[c.id] ?? null,
    titleKey: CARD_TITLES[c.id] ? null : [...c.keys].sort((a, b) => titleRank(a) - titleRank(b))[0],
    descKey: [...c.keys].sort((a, b) => descRank(a) - descRank(b)).find((k) => descRank(k) < 5) ?? null,
  }))

  if (loose.length) {
    cards.unshift({ id: `${group.id}.__section`, keys: loose, titleKey: null, descKey: null })
  }
  return cards
}

function slotLabel(key, lang) {
  const last = key.split('.').pop()

  /* numbered pairs: faq.q3 / faq.a3 */
  const qa = /^([qa])(\d+)$/.exec(last)
  if (qa) {
    const isQ = qa[1] === 'q'
    return lang === 'ar'
      ? `${isQ ? 'السؤال' : 'الإجابة'} ${qa[2]}`
      : `${isQ ? 'Question' : 'Answer'} ${qa[2]}`
  }

  const hit = SLOT_LABELS[last]
  if (hit) return lang === 'ar' ? hit[0] : hit[1]
  return last.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())
}

export default function SuperAdmin() {
  const { t, lang, isRTL } = useLang()
  const { logout } = useAuth()
  const site = useSite()
  const [active, setActive] = useState('hero')
  const [query, setQuery] = useState('')
  /* the card being edited, or null when the grid is just being browsed */
  const [openCard, setOpenCard] = useState(null)
  const Chevron = isRTL ? ChevronLeft : ChevronRight

  const extra = EXTRAS.find((e) => e.id === active) ?? null
  const group = GROUPS.find((g) => g.id === active) ?? GROUPS[0]
  const allCards = useMemo(() => cardsOf(group), [group])
  const cards = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return allCards
    const hit = (k) =>
      k.toLowerCase().includes(q) ||
      (translations.ar[k] || '').toLowerCase().includes(q) ||
      (translations.en[k] || '').toLowerCase().includes(q)
    return allCards.filter((c) => c.keys.some(hit))
  }, [allCards, query])

  /* a card open in the modal must follow the live config, not a stale copy */
  const editing = openCard ? allCards.find((c) => c.id === openCard) ?? null : null

  /* moving to another section starts clean: no leftover modal or filter */
  const selectGroup = (id) => {
    setActive(id)
    setOpenCard(null)
    setQuery('')
  }

  const hiddenCount = site.hidden.length
  const visibleCount = site.order.length - hiddenCount

  return (
    <div className="relative min-h-screen bg-[var(--s-bg)]">
      {/* A faint dot field so the page reads as a surface, not a blank sheet.
         It fades out down the page so it never competes with the cards. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 opacity-70"
        style={{
          backgroundImage: 'radial-gradient(var(--s-border-strong) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
          maskImage: 'linear-gradient(to bottom, black, transparent 85%)',
          WebkitMaskImage: 'linear-gradient(to bottom, black, transparent 85%)',
        }}
      />

      {/* ── top bar ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-[var(--s-border)] bg-[var(--s-panel)]">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[15px] font-bold">{t('admin.title')}</p>
            <p className="flex items-center gap-1.5 truncate text-[11.5px] text-muted">
              {t('admin.subtitle')}
              <Chevron size={11} className="shrink-0 opacity-60" />
              <span>{t(extra ? extra.label : `admin.g.${group.id}`)}</span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <SaveChip state={site.saveState} t={t} />
            <LangToggle />
            <Button href="/" target="_blank" variant="outline" size="sm">
              <ExternalLink size={15} />
              <span className="hidden sm:inline">{t('admin.preview')}</span>
            </Button>
            <button
              onClick={logout}
              className="grid size-9 cursor-pointer place-items-center rounded-lg border border-[var(--s-border)] text-muted transition-colors hover:text-red-500"
              aria-label={t('admin.logout')}
              title={t('admin.logout')}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      <div className="relative mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
        {/* ── summary chips ─────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2">
          <Stat icon={Layers} label={t('admin.stat.visible')} value={visibleCount} tone="brand" />
          <Stat icon={EyeOff} label={t('admin.stat.hidden')} value={hiddenCount} tone="amber" />
          <Stat icon={Pencil} label={t('admin.editedCount')} value={site.editedCount} tone="sky" />
        </div>

        <div className="mt-4 grid gap-6 lg:grid-cols-[280px_1fr]">
          {/* ── sidebar ─────────────────────────────────────────── */}
          {/* The rail stays a deep brand green in both themes: it is chrome, and
             the contrast keeps the eye on the editing surface, not the menu. */}
          <aside className="text-emerald-50/80 lg:sticky lg:top-[86px] lg:self-start">
            <nav className="rounded-lg border border-white/10 bg-[#052a20]">
              <p className="border-b border-white/10 px-4 py-2.5 text-[12px] font-semibold text-emerald-200/50">
                {t('admin.sections')}
              </p>
              <ul className="p-1.5">
                {GROUPS.map((g) => (
                  <NavItem
                    key={g.id}
                    icon={g.icon}
                    label={t(`admin.g.${g.id}`)}
                    active={g.id === active}
                    onClick={() => selectGroup(g.id)}
                  >
                    {g.section && !site.isVisible(g.section) ? (
                      <EyeOff size={13} className="ms-auto shrink-0 text-amber-400" />
                    ) : (
                      <span className="ms-auto shrink-0 text-[11px] tabular-nums text-emerald-200/40">
                        {keysOf(g).length}
                      </span>
                    )}
                  </NavItem>
                ))}

                {/* the two non-copy surfaces, under the groups behind a rule */}
                <li className="mt-1.5 border-t border-white/10 pt-1.5" />
                {EXTRAS.map((e) => (
                  <NavItem
                    key={e.id}
                    icon={e.icon}
                    label={t(e.label)}
                    active={e.id === active}
                    onClick={() => selectGroup(e.id)}
                  />
                ))}
              </ul>
            </nav>
          </aside>

          {/* ── editor ──────────────────────────────────────────── */}
          <main className="min-w-0">
            {extra === LAYOUT ? (
              <LayoutPanel site={site} t={t} />
            ) : extra === INBOX ? (
              <InboxPanel t={t} lang={lang} />
            ) : (
            <div className="rounded-lg border border-[var(--s-border)] bg-[var(--s-panel)]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--s-border)] px-4 py-3 sm:px-5">
                <div className="leading-tight">
                  <p className="text-[15px] font-bold">{t(`admin.g.${group.id}`)}</p>
                  <p className="text-[11.5px] text-muted">
                    {cards.length} {t('admin.cards')}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {group.section && (
                    <button
                      onClick={() => site.toggleSection(group.section)}
                      className={cn(
                        'inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-[var(--s-border)] px-3 text-[12px] font-semibold transition-colors hover:bg-[var(--s-panel-2)]',
                        site.isVisible(group.section) ? 'text-muted' : 'text-amber-500',
                      )}
                    >
                      {site.isVisible(group.section) ? <Eye size={14} /> : <EyeOff size={14} />}
                      {site.isVisible(group.section) ? t('admin.visible') : t('admin.hidden')}
                    </button>
                  )}
                  <div className="relative">
                    <Search size={15} className="pointer-events-none absolute top-1/2 start-3 -translate-y-1/2 text-muted" />
                    <Input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={t('admin.search')}
                      className="h-9 w-52 ps-9"
                    />
                  </div>
                </div>
              </div>

              <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3">
                {cards.map((card) => (
                  <CardTile
                    key={card.id}
                    card={card}
                    group={group}
                    site={site}
                    t={t}
                    lang={lang}
                    onEdit={() => setOpenCard(card.id)}
                  />
                ))}
              </div>
              {cards.length === 0 && <p className="p-10 text-center text-sm text-muted">{t('admin.noResults')}</p>}
            </div>
            )}
          </main>
        </div>
      </div>

      {editing && (
        <CardEditor
          card={editing}
          group={group}
          site={site}
          t={t}
          lang={lang}
          onClose={() => setOpenCard(null)}
        />
      )}
    </div>
  )
}

/** What the card is called on screen: its own headline value where it has one. */
function cardTitle(card, site, t, lang) {
  if (card.name) return lang === 'ar' ? card.name[0] : card.name[1]
  if (!card.titleKey) return t('admin.cardSection')
  return site.text[lang][card.titleKey] ?? translations[lang][card.titleKey] ?? ''
}

/** One thing on the landing page — a feature, a plan, a question — at a glance. */
function CardTile({ card, group, site, t, lang, onEdit }) {
  const val = (key) => (key ? site.text[lang][key] ?? translations[lang][key] ?? '' : '')
  const edited = card.keys.some((k) => site.text.ar[k] != null || site.text.en[k] != null)

  const title = cardTitle(card, site, t, lang)
  const desc = card.descKey ? val(card.descKey) : `${card.keys.length} ${t('admin.fields')}`

  const reset = () => {
    if (!window.confirm(t('admin.cardResetConfirm'))) return
    card.keys.forEach((k) => site.clearText(k))
  }

  return (
    <article
      className={cn(
        'flex flex-col rounded-lg border bg-[var(--s-panel)] p-4 transition-colors',
        edited ? 'border-brand-500/40' : 'border-[var(--s-border)]',
      )}
    >
      <div className="flex items-start gap-2">
        <group.icon size={15} className="mt-0.5 shrink-0 text-brand-500" />
        <h3 className="min-w-0 flex-1 text-[14px] font-bold leading-snug">{title || '—'}</h3>
        <div className="flex shrink-0 items-center gap-0.5">
          {edited && (
            <IconBtn onClick={reset} label={t('admin.cardReset')}>
              <RotateCcw size={13} />
            </IconBtn>
          )}
          <IconBtn onClick={onEdit} label={t('admin.cardEdit')} tone="brand">
            <Pencil size={13} />
          </IconBtn>
        </div>
      </div>

      <p className="mt-2 line-clamp-3 text-[12.5px] leading-relaxed text-muted">{desc}</p>
    </article>
  )
}

/** Every slot of one card, both languages, saved as you type. */
function CardEditor({ card, group, site, t, lang, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  const title = cardTitle(card, site, t, lang)

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-t-xl border border-[var(--s-border)] bg-[var(--s-panel)] sm:rounded-xl"
      >
        <div className="flex items-center gap-3 border-b border-[var(--s-border)] px-5 py-3.5">
          <group.icon size={16} className="shrink-0 text-brand-500" />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[15px] font-bold">{title || '—'}</p>
            <p className="text-[11.5px] text-muted">
              {card.keys.length} {t('admin.fields')}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className="grid size-8 cursor-pointer place-items-center rounded-md text-muted transition-colors hover:bg-[var(--s-panel-2)]"
          >
            <X size={17} />
          </button>
        </div>

        <div className="min-h-0 flex-1 divide-y divide-[var(--s-border)] overflow-y-auto">
          {card.keys.map((key) => (
            <FieldRow key={key} k={key} site={site} t={t} lang={lang} />
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[var(--s-border)] px-5 py-3">
          <SaveChip state={site.saveState} t={t} />
          <Button onClick={onClose} size="sm">
            {t('admin.cardDone')}
          </Button>
        </div>
      </div>
    </div>
  )
}

/** One entry in the dark rail. */
function NavItem({ icon: Icon, label, active, onClick, children }) {
  return (
    <li>
      <button
        onClick={onClick}
        className={cn(
          'flex w-full cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-start text-[13.5px] transition-colors',
          active ? 'bg-brand-500/15 font-semibold text-brand-400' : 'hover:bg-white/5 hover:text-white',
        )}
      >
        <Icon size={15} className="shrink-0 opacity-70" />
        <span className="truncate">{label}</span>
        {children}
      </button>
    </li>
  )
}

/** Which sections the landing page shows, and in what order. */
function LayoutPanel({ site, t }) {
  return (
    <div className="rounded-lg border border-[var(--s-border)] bg-[var(--s-panel)]">
      <div className="border-b border-[var(--s-border)] px-4 py-3 leading-tight sm:px-5">
        <p className="text-[15px] font-bold">{t('admin.layout')}</p>
        <p className="text-[11.5px] text-muted">
          {site.order.length} {t('admin.sections')}
        </p>
      </div>

      <ul className="divide-y divide-[var(--s-border)]">
        {site.order.map((id, i) => {
          const meta = GROUPS.find((g) => g.section === id)
          const visible = site.isVisible(id)
          const Icon = meta?.icon ?? PanelsTopLeft
          return (
            <li key={id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
              <span className="w-5 shrink-0 text-center text-[11px] tabular-nums text-muted">{i + 1}</span>
              <Icon size={15} className={cn('shrink-0', visible ? 'text-brand-500' : 'text-muted')} />
              <span className={cn('flex-1 truncate text-[13.5px] font-semibold', !visible && 'text-muted line-through')}>
                {t(`admin.g.${meta?.id ?? id}`)}
              </span>
              <IconBtn onClick={() => site.moveSection(id, -1)} disabled={i === 0} label={t('admin.moveUp')}>
                <ChevronUp size={15} />
              </IconBtn>
              <IconBtn
                onClick={() => site.moveSection(id, 1)}
                disabled={i === site.order.length - 1}
                label={t('admin.moveDown')}
              >
                <ChevronDown size={15} />
              </IconBtn>
              <IconBtn
                onClick={() => site.toggleSection(id)}
                label={t('admin.toggle')}
                tone={visible ? 'brand' : 'amber'}
              >
                {visible ? <Eye size={15} /> : <EyeOff size={15} />}
              </IconBtn>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Everything the contact form has collected, newest first. */
function InboxPanel({ t, lang }) {
  const [messages, setMessages] = useState(null)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback((signal) => {
    setError(false)
    return api
      .getMessages(signal)
      .then(({ messages: rows }) => setMessages(rows))
      .catch((err) => {
        if (err.name !== 'AbortError') setError(true)
      })
  }, [])

  useEffect(() => {
    const ctrl = new AbortController()
    load(ctrl.signal)
    return () => ctrl.abort()
  }, [load])

  const remove = async (id) => {
    if (!window.confirm(t('admin.inbox.confirm'))) return
    setBusy(true)
    /* drop it locally first; a failed delete puts it straight back */
    const before = messages
    setMessages((rows) => rows.filter((r) => r.id !== id))
    try {
      await api.deleteMessage(id)
    } catch {
      setMessages(before)
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  const stamp = (iso) =>
    new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso))

  return (
    <div className="rounded-lg border border-[var(--s-border)] bg-[var(--s-panel)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--s-border)] px-4 py-3 sm:px-5">
        <div className="leading-tight">
          <p className="text-[15px] font-bold">{t('admin.g.inbox')}</p>
          <p className="text-[11.5px] text-muted">
            {messages?.length ?? 0} {t('admin.inbox.count')}
          </p>
        </div>
        <button
          onClick={() => load()}
          className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-[var(--s-border)] px-3 text-[12px] font-semibold text-muted transition-colors hover:bg-[var(--s-panel-2)]"
        >
          <RefreshCw size={14} />
          {t('admin.inbox.refresh')}
        </button>
      </div>

      {error && <p className="p-10 text-center text-sm text-red-500">{t('admin.inbox.error')}</p>}
      {!error && messages === null && (
        <p className="p-10 text-center text-sm text-muted">{t('common.loading')}</p>
      )}
      {!error && messages?.length === 0 && (
        <p className="p-10 text-center text-sm text-muted">{t('admin.inbox.empty')}</p>
      )}

      <ul className="divide-y divide-[var(--s-border)]">
        {(messages ?? []).map((m) => (
          <li key={m.id} className="px-4 py-4 transition-colors hover:bg-[var(--s-panel-2)]/40 sm:px-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13.5px] font-extrabold">{m.name}</span>
              {m.company && (
                <span className="inline-flex items-center gap-1 text-[11.5px] text-muted">
                  <Building2 size={12} />
                  {m.company}
                </span>
              )}
              <span className="ms-auto font-mono text-[10.5px] text-muted">{stamp(m.at)}</span>
              <button
                onClick={() => remove(m.id)}
                disabled={busy}
                title={t('admin.inbox.delete')}
                aria-label={t('admin.inbox.delete')}
                className="grid size-7 cursor-pointer place-items-center rounded-lg text-muted transition-colors hover:bg-red-500/10 hover:text-red-500 disabled:opacity-40"
              >
                <Trash2 size={14} />
              </button>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12px] text-muted">
              <a href={`tel:${m.phone}`} className="inline-flex items-center gap-1.5 hover:text-brand-500" dir="ltr">
                <Phone size={12} />
                {m.phone}
              </a>
              {m.email && (
                <a href={`mailto:${m.email}`} className="inline-flex items-center gap-1.5 hover:text-brand-500" dir="ltr">
                  <Mail size={12} />
                  {m.email}
                </a>
              )}
              {m.fleet && (
                <span className="inline-flex items-center gap-1.5">
                  <Users size={12} />
                  {t('admin.inbox.fleet')}: <span dir="ltr">{m.fleet}</span>
                </span>
              )}
            </div>

            {m.message && (
              <p className="mt-2.5 whitespace-pre-wrap rounded-xl bg-[var(--s-panel-2)] px-3.5 py-2.5 text-[13px] leading-relaxed">
                {m.message}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Live save status — the one place an admin learns an edit reached the server. */
function SaveChip({ state, t }) {
  const looks = {
    idle: ['text-muted', Check, 'admin.saved'],
    saving: ['text-muted', Loader2, 'admin.saving'],
    saved: ['text-brand-500', Check, 'admin.saveOk'],
    error: ['text-red-500', AlertTriangle, 'admin.saveErr'],
    denied: ['text-amber-500', AlertTriangle, 'admin.saveDenied'],
  }
  const [tone, Icon, key] = looks[state] ?? looks.idle

  return (
    <span className={cn('hidden items-center gap-1.5 px-1 text-[12px] md:inline-flex', tone)}>
      <Icon size={13} className={cn(state === 'saving' && 'animate-spin')} />
      {t(key)}
    </span>
  )
}

/** A single number about the site, small enough to sit in a row of three. */
function Stat({ icon: Icon, label, value, tone }) {
  const tones = {
    brand: 'text-brand-500',
    amber: 'text-amber-500',
    sky: 'text-sky-500',
  }
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-[var(--s-border)] bg-[var(--s-panel)] py-1.5 ps-3 pe-2">
      <Icon size={13} className={cn('shrink-0', tones[tone])} />
      <span className="text-[12px] text-muted">{label}</span>
      <span className="min-w-6 rounded-full bg-[var(--s-panel-2)] px-1.5 py-0.5 text-center text-[11.5px] font-bold tabular-nums">
        {value}
      </span>
    </span>
  )
}

function IconBtn({ onClick, disabled, label, tone = 'muted', children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        'grid size-7 cursor-pointer place-items-center rounded-md transition-colors hover:bg-[var(--s-panel-2)] disabled:cursor-not-allowed disabled:opacity-30',
        tone === 'brand' && 'text-brand-500',
        tone === 'amber' && 'text-amber-500',
        tone === 'muted' && 'text-muted hover:text-brand-500',
      )}
    >
      {children}
    </button>
  )
}

/** One editable string: a named copy slot with its Arabic and English values. */
function FieldRow({ k, site, t, lang }) {
  const ar = site.text.ar[k]
  const en = site.text.en[k]
  const edited = (typeof ar === 'string' && ar !== '') || (typeof en === 'string' && en !== '')
  const long = (translations.ar[k] || '').length > 70
  const Control = long ? Textarea : Input

  return (
    <div className={cn('relative px-4 py-3 sm:px-5', edited && 'bg-brand-500/[0.04]')}>
      {edited && <span className="absolute inset-y-0 start-0 w-0.5 bg-brand-500" />}

      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-[12.5px] font-semibold" title={k}>{slotLabel(k, lang)}</span>
        {edited && (
          <button
            onClick={() => site.clearText(k)}
            title={t('admin.reset')}
            className="ms-auto inline-flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-brand-500 transition-colors hover:bg-brand-500/10"
          >
            <RotateCcw size={11} />
            {t('admin.reset')}
          </button>
        )}
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        <LangInput
          tag="ع"
          title={t('admin.arabic')}
          dir="rtl"
          Control={Control}
          long={long}
          value={ar ?? translations.ar[k] ?? ''}
          onChange={(v) => site.setText('ar', k, v)}
        />
        <LangInput
          tag="EN"
          title={t('admin.english')}
          dir="ltr"
          Control={Control}
          long={long}
          value={en ?? translations.en[k] ?? ''}
          onChange={(v) => site.setText('en', k, v)}
        />
      </div>
    </div>
  )
}

/** Language tag sits beside the field, so each row costs one line instead of two. */
function LangInput({ tag, title, dir, Control, long, value, onChange }) {
  return (
    <div className={cn('flex gap-2', long ? 'items-start' : 'items-center')} title={title}>
      <span className="grid h-9 w-7 shrink-0 place-items-center text-[10px] font-semibold text-muted">
        {tag}
      </span>
      <Control
        dir={dir}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn('flex-1 text-[13px]', long ? 'min-h-16 py-2' : 'h-9')}
      />
    </div>
  )
}
