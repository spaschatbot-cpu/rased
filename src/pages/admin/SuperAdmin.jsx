import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  LayoutDashboard, Sparkles, Truck, ListOrdered, CreditCard, Smartphone, HelpCircle,
  Mail, Megaphone, PanelsTopLeft, Eye, EyeOff, ChevronUp, ChevronDown, RotateCcw,
  Search, LogOut, ExternalLink, Check, SlidersHorizontal, Layers,
  Pencil, ChevronLeft, ChevronRight, Loader2, AlertTriangle, Inbox, Trash2,
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

/* The inbox is not a copy group — it swaps the editor for the messages the
   contact form collected, so it lives beside the groups rather than in them. */
const INBOX = { id: 'inbox', icon: Inbox }

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
  const Chevron = isRTL ? ChevronLeft : ChevronRight

  const onInbox = active === INBOX.id
  const group = GROUPS.find((g) => g.id === active) ?? GROUPS[0]
  const allKeys = useMemo(() => keysOf(group), [group])
  const keys = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return allKeys
    return allKeys.filter(
      (k) =>
        k.toLowerCase().includes(q) ||
        (translations.ar[k] || '').toLowerCase().includes(q) ||
        (translations.en[k] || '').toLowerCase().includes(q),
    )
  }, [allKeys, query])

  const hiddenCount = site.hidden.length
  const visibleCount = site.order.length - hiddenCount

  return (
    <div className="relative min-h-screen bg-[var(--s-bg)]">
      {/* quiet workspace texture */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 opacity-[0.55]"
        style={{
          backgroundImage:
            'linear-gradient(to right, var(--s-border) 1px, transparent 1px), linear-gradient(to bottom, var(--s-border) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
          maskImage: 'radial-gradient(90% 70% at 50% 0%, black, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(90% 70% at 50% 0%, black, transparent 100%)',
        }}
      />

      {/* ── top bar ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-[var(--s-border)] bg-[var(--s-panel)]/85 backdrop-blur-xl">
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-linear-to-r from-transparent via-brand-400/45 to-transparent" />
        <div className="mx-auto flex max-w-[1560px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-linear-to-br from-brand-500 to-brand-600 text-[#04120c] shadow-lg shadow-brand-500/25">
              <Pencil size={17} strokeWidth={2.5} />
            </span>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[15px] font-extrabold">{t('admin.title')}</p>
              <p className="flex items-center gap-1.5 truncate text-[11.5px] text-muted">
                {t('admin.subtitle')}
                <Chevron size={11} className="shrink-0 opacity-60" />
                <span className="font-bold text-brand-500">{t(`admin.g.${onInbox ? INBOX.id : group.id}`)}</span>
              </p>
            </div>
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
              className="grid size-9 cursor-pointer place-items-center rounded-xl border border-[var(--s-border)] bg-[var(--s-panel-2)] text-muted transition-colors hover:border-red-500/40 hover:text-red-500"
              aria-label={t('admin.logout')}
              title={t('admin.logout')}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      <div className="relative mx-auto max-w-[1560px] px-4 py-6 sm:px-6">
        {/* ── stat strip ────────────────────────────────────────── */}
        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile icon={Layers} label={t('admin.stat.visible')} value={visibleCount} tone="brand" />
          <StatTile icon={EyeOff} label={t('admin.stat.hidden')} value={hiddenCount} tone="amber" />
          <StatTile icon={Pencil} label={t('admin.editedCount')} value={site.editedCount} tone="sky" />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[300px_1fr]">
          {/* ── sidebar ─────────────────────────────────────────── */}
          <aside className="lg:sticky lg:top-[86px] lg:self-start">
            <nav className="overflow-hidden rounded-2xl border border-[var(--s-border)] bg-[var(--s-panel)] shadow-[var(--s-e1)]">
              <p className="border-b border-[var(--s-border)] px-4 py-3 text-[11px] font-extrabold uppercase tracking-[0.18em] text-muted">
                {t('admin.sections')}
              </p>
              <ul className="p-2">
                {GROUPS.map((g) => {
                  const isActive = g.id === active
                  const hidden = g.section ? !site.isVisible(g.section) : false
                  return (
                    <li key={g.id}>
                      <button
                        onClick={() => setActive(g.id)}
                        className={cn(
                          'relative flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-start text-[13.5px] font-bold transition-all duration-200',
                          isActive
                            ? 'bg-brand-500/10 text-brand-500'
                            : 'text-muted hover:bg-[var(--s-panel-2)] hover:text-[var(--s-text)]',
                        )}
                      >
                        {isActive && (
                          <span className="absolute inset-y-2 start-0 w-[3px] rounded-full bg-linear-to-b from-brand-500 to-accent-500" />
                        )}
                        <g.icon size={16} className="shrink-0" />
                        <span className="truncate">{t(`admin.g.${g.id}`)}</span>
                        {hidden ? (
                          <EyeOff size={13} className="ms-auto shrink-0 text-amber-500" />
                        ) : (
                          <span
                            className={cn(
                              'ms-auto shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-extrabold tabular-nums',
                              isActive ? 'bg-brand-500/15 text-brand-500' : 'bg-[var(--s-panel-2)] text-muted',
                            )}
                          >
                            {keysOf(g).length}
                          </span>
                        )}
                      </button>
                    </li>
                  )
                })}

                {/* messages sit under the copy groups, separated by a rule */}
                <li className="mt-2 border-t border-[var(--s-border)] pt-2">
                  <button
                    onClick={() => setActive(INBOX.id)}
                    className={cn(
                      'relative flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-start text-[13.5px] font-bold transition-all duration-200',
                      onInbox
                        ? 'bg-brand-500/10 text-brand-500'
                        : 'text-muted hover:bg-[var(--s-panel-2)] hover:text-[var(--s-text)]',
                    )}
                  >
                    {onInbox && (
                      <span className="absolute inset-y-2 start-0 w-[3px] rounded-full bg-linear-to-b from-brand-500 to-accent-500" />
                    )}
                    <INBOX.icon size={16} className="shrink-0" />
                    <span className="truncate">{t('admin.g.inbox')}</span>
                  </button>
                </li>
              </ul>
            </nav>

            {/* order + visibility */}
            <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--s-border)] bg-[var(--s-panel)] shadow-[var(--s-e1)]">
              <p className="flex items-center gap-2 border-b border-[var(--s-border)] px-4 py-3 text-[11px] font-extrabold uppercase tracking-[0.18em] text-muted">
                <SlidersHorizontal size={13} />
                {t('admin.layout')}
              </p>
              <ul className="p-2">
                {site.order.map((id, i) => {
                  const meta = GROUPS.find((g) => g.section === id)
                  const visible = site.isVisible(id)
                  return (
                    <li
                      key={id}
                      className="group flex items-center gap-1 rounded-xl px-2 py-1.5 transition-colors hover:bg-[var(--s-panel-2)]"
                    >
                      <span className="w-5 shrink-0 text-center font-mono text-[10px] text-muted opacity-60">
                        {i + 1}
                      </span>
                      <span className={cn('flex-1 truncate text-[13px] font-bold', !visible && 'text-muted line-through')}>
                        {t(`admin.g.${meta?.id ?? id}`)}
                      </span>
                      <IconBtn onClick={() => site.moveSection(id, -1)} disabled={i === 0} label={t('admin.moveUp')}>
                        <ChevronUp size={14} />
                      </IconBtn>
                      <IconBtn
                        onClick={() => site.moveSection(id, 1)}
                        disabled={i === site.order.length - 1}
                        label={t('admin.moveDown')}
                      >
                        <ChevronDown size={14} />
                      </IconBtn>
                      <IconBtn onClick={() => site.toggleSection(id)} label={t('admin.toggle')} tone={visible ? 'brand' : 'amber'}>
                        {visible ? <Eye size={14} /> : <EyeOff size={14} />}
                      </IconBtn>
                    </li>
                  )
                })}
              </ul>
            </div>

          </aside>

          {/* ── editor ──────────────────────────────────────────── */}
          <main className="min-w-0">
            {onInbox ? (
              <InboxPanel t={t} lang={lang} />
            ) : (
            <div className="overflow-hidden rounded-2xl border border-[var(--s-border)] bg-[var(--s-panel)] shadow-[var(--s-e1)]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--s-border)] px-4 py-3 sm:px-5">
                <div className="flex items-center gap-3">
                  <span className="grid size-11 place-items-center rounded-xl bg-brand-500/12 text-brand-500 ring-1 ring-brand-500/25">
                    <group.icon size={19} />
                  </span>
                  <div className="leading-tight">
                    <p className="text-[16px] font-extrabold">{t(`admin.g.${group.id}`)}</p>
                    <p className="text-[11.5px] text-muted">
                      {keys.length} {t('admin.fields')}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {group.section && (
                    <button
                      onClick={() => site.toggleSection(group.section)}
                      className={cn(
                        'inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border px-3.5 text-[12px] font-extrabold transition-colors',
                        site.isVisible(group.section)
                          ? 'border-brand-500/30 bg-brand-500/10 text-brand-500 hover:bg-brand-500/15'
                          : 'border-amber-500/30 bg-amber-500/10 text-amber-500 hover:bg-amber-500/15',
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
                      className="h-10 w-56 ps-9"
                    />
                  </div>
                </div>
              </div>

              <div className="divide-y divide-[var(--s-border)]">
                {keys.map((key) => (
                  <FieldRow key={key} k={key} site={site} t={t} lang={lang} />
                ))}
                {keys.length === 0 && <p className="p-10 text-center text-sm text-muted">{t('admin.noResults')}</p>}
              </div>
            </div>
            )}
          </main>
        </div>
      </div>
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
    <div className="overflow-hidden rounded-2xl border border-[var(--s-border)] bg-[var(--s-panel)] shadow-[var(--s-e1)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--s-border)] px-4 py-3 sm:px-5">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-brand-500/12 text-brand-500 ring-1 ring-brand-500/25">
            <Inbox size={19} />
          </span>
          <div className="leading-tight">
            <p className="text-[16px] font-extrabold">{t('admin.g.inbox')}</p>
            <p className="text-[11.5px] text-muted">
              {messages?.length ?? 0} {t('admin.inbox.count')}
            </p>
          </div>
        </div>
        <button
          onClick={() => load()}
          className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-[var(--s-border)] bg-[var(--s-panel-2)] px-3.5 text-[12px] font-extrabold text-muted transition-colors hover:border-brand-500/40 hover:text-brand-500"
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
    idle: ['border-brand-500/25 bg-brand-500/10 text-brand-500', Check, 'admin.saved'],
    saving: ['border-sky-500/30 bg-sky-500/10 text-sky-500', Loader2, 'admin.saving'],
    saved: ['border-brand-500/25 bg-brand-500/10 text-brand-500', Check, 'admin.saveOk'],
    error: ['border-red-500/30 bg-red-500/10 text-red-500', AlertTriangle, 'admin.saveErr'],
    denied: ['border-amber-500/30 bg-amber-500/10 text-amber-500', AlertTriangle, 'admin.saveDenied'],
  }
  const [tone, Icon, key] = looks[state] ?? looks.idle

  return (
    <span
      className={cn(
        'hidden items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-extrabold md:inline-flex',
        tone,
      )}
    >
      <Icon size={12} strokeWidth={3} className={cn(state === 'saving' && 'animate-spin')} />
      {t(key)}
    </span>
  )
}

function StatTile({ icon: Icon, label, value, tone }) {
  const tones = {
    brand: 'bg-brand-500/12 text-brand-500 ring-brand-500/20',
    amber: 'bg-amber-500/12 text-amber-500 ring-amber-500/20',
    sky: 'bg-sky-500/12 text-sky-500 ring-sky-500/20',
  }
  return (
    <div className="flex items-center gap-3.5 rounded-2xl border border-[var(--s-border)] bg-[var(--s-panel)] p-4 shadow-[var(--s-e1)]">
      <span className={cn('grid size-11 shrink-0 place-items-center rounded-xl ring-1', tones[tone])}>
        <Icon size={18} />
      </span>
      <span className="leading-tight">
        <span className="block text-[11px] font-bold uppercase tracking-wider text-muted">{label}</span>
        <span className="mt-0.5 block text-[20px] font-extrabold tabular-nums">{value}</span>
      </span>
    </div>
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
        'grid size-7 cursor-pointer place-items-center rounded-lg transition-colors hover:bg-[var(--s-panel)] disabled:cursor-not-allowed disabled:opacity-30',
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
    <div
      className={cn(
        'relative px-4 py-3 transition-colors hover:bg-[var(--s-panel-2)]/40 sm:px-5',
        edited && 'bg-brand-500/[0.04]',
      )}
    >
      {edited && <span className="absolute inset-y-0 start-0 w-[3px] bg-brand-500" />}

      <div className="mb-2 flex items-center gap-2">
        <span className="text-[12.5px] font-extrabold">{slotLabel(k, lang)}</span>
        <code className="rounded bg-[var(--s-panel-2)] px-1.5 py-px font-mono text-[9.5px] text-muted">{k}</code>
        {edited && (
          <button
            onClick={() => site.clearText(k)}
            title={t('admin.reset')}
            className="ms-auto inline-flex cursor-pointer items-center gap-1 rounded-lg px-1.5 py-0.5 text-[11px] font-bold text-brand-500 transition-colors hover:bg-brand-500/10"
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
      <span className="grid h-9 w-8 shrink-0 place-items-center rounded-lg bg-[var(--s-panel-2)] font-mono text-[9.5px] font-extrabold text-muted ring-1 ring-[var(--s-border)]">
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
