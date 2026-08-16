import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Settings2, LayoutGrid, Users2, Truck, FolderTree, Plus, Search,
  Pencil, Trash2, ShieldCheck, Building2, CalendarClock, Cpu, MapPin, UserCog, UserCheck,
  Wrench, Droplets, CircleDot, Disc3, ClipboardCheck, BatteryCharging, Filter, AlertTriangle, Check, Info,
  KeyRound, Gauge, Map as MapIcon, History, FileBarChart, Bell, RotateCcw, X,
  UserRound, Mail, Phone, Lock, Languages, Sun, Moon, CalendarDays,
  Headset, MessageSquare, MessagesSquare, Send,
} from 'lucide-react'
import { useLang } from '../../context/LanguageContext'
import { useFleet } from '../../context/FleetContext'
import { useTheme } from '../../context/ThemeContext'
import { useAuth } from '../../context/AuthContext'
import {
  Card, CardHeader, IconPlate, Table, Td, Badge, Button, Input, StatTile, StatusPill, Modal, Field, Select, cn,
} from '../../components/ui'
import { PageHeader } from '../../layouts/AppLayout'
import { api } from '../../lib/api'
import { apiErrorText } from '../../lib/apiErrors'
import { APP_PAGES as PAGE_KEYS, ROLE_PAGES, pagesFor } from '../../../shared/app-pages'

const TABS = [
  { key: 'overview', icon: LayoutGrid, label: 'mng.overview', descAr: 'ملخص الأسطول', descEn: 'Fleet summary' },
  { key: 'users', icon: Users2, label: 'mng.users', descAr: 'الحسابات والصلاحيات', descEn: 'Accounts & roles' },
  { key: 'devices', icon: Truck, label: 'mng.devices', descAr: 'المركبات والأجهزة', descEn: 'Vehicles & trackers' },
  { key: 'groups', icon: FolderTree, label: 'mng.groups', descAr: 'الفروع والمجموعات', descEn: 'Branches & groups' },
  { key: 'maint', icon: Wrench, label: 'mng.maint', descAr: 'جدولة وصيانة الأسطول', descEn: 'Fleet service schedule' },
  { key: 'perms', icon: KeyRound, label: 'mng.perms', descAr: 'صفحات كل موظف', descEn: 'Per-employee page access' },
  { key: 'support', icon: Headset, label: 'mng.support', descAr: 'رسائل السائقين', descEn: 'Messages from drivers' },
  { key: 'profile', icon: UserRound, label: 'mng.profile', descAr: 'بيانات حسابك', descEn: 'Your account details' },
]

/** How often the support inbox is refreshed (ms). */
const SUPPORT_POLL_MS = 15000

/* أيقونة كل صفحة واسمها. المفاتيح نفسها تأتي من الملف المشترك مع السيرفر، فلا
   يمكن أن تمنح هذه الشاشة صلاحية لصفحة لا يعرفها الحارس ولا يقبلها الـAPI */
const PAGE_META = {
  dashboard: { icon: Gauge, label: 'cc.dashboard.t' },
  map: { icon: MapIcon, label: 'cc.map.t' },
  history: { icon: History, label: 'cc.history.t' },
  reports: { icon: FileBarChart, label: 'cc.reports.t' },
  alerts: { icon: Bell, label: 'cc.alerts.t' },
  manage: { icon: Settings2, label: 'cc.manage.t' },
}
const APP_PAGES = PAGE_KEYS.map((key) => ({ key, ...PAGE_META[key] }))

/**
 * الأقسام التي يملأ جدولها ما تبقّى من الشاشة.
 *
 * عمود المحتوى في هذه الأقسام بارتفاع النافذة تمامًا، وبطاقة الجدول تأخذ ما
 * يفضل بعد العنوان وبطاقات الملخّص مهما كان ارتفاعها. التمرير يقع داخل الجدول
 * ورؤوس أعمدته تثبت في أعلاه، فلا يغيب عنوان القسم ولا شريط البحث عن الشاشة —
 * ولا يبقى فراغ تحت الجدول لأن الارتفاع محسوب لا مُقدَّر.
 *
 * على الشاشات الضيّقة تُترك الصفحة تتمرّر كما هي: تقييد الارتفاع هناك يترك
 * للصفوف نافذة أضيق من أن تُقرأ.
 */
const FULL_HEIGHT_TABS = new Set(['users', 'devices', 'groups', 'maint', 'perms'])
/** بطاقة الجدول: تبتلع ما تبقّى من عمود المحتوى */
const TABLE_CARD = 'lg:flex lg:min-h-0 lg:flex-1 lg:flex-col'
/** الجدول نفسه: يتمرّر داخل بطاقته */
const TABLE_SCROLL = 'lg:min-h-0 lg:flex-1 lg:overflow-y-auto'

/** حالات الصيانة — اللون والنغمة */
const MAINT_TONE = { overdue: 'red', soon: 'amber', planned: 'brand' }
const MAINT_COLOR = { overdue: '#f4634e', soon: '#f5b301', planned: '#00a97a' }
const MAINT_TYPES = ['oil', 'tires', 'brakes', 'inspection', 'battery', 'filter', 'other']
const MAINT_ICON = {
  oil: Droplets, tires: CircleDot, brakes: Disc3, inspection: ClipboardCheck, battery: BatteryCharging, filter: Filter,
}
/** الأنواع المعروفة وحدها تُقترح في القائمة — «أخرى» اسم يكتبه المستخدم */
const MAINT_PRESETS = MAINT_TYPES.filter((k) => k !== 'other')
/** اسم سجل الصيانة: ما كتبه المستخدم، وإلا اسم النوع بلغة القارئ */
const maintName = (m, t) => m.label || t(`mng.maint.type.${m.type}`)
/** وحدة القياس حسب أساس الاحتساب */
const MAINT_UNIT = { odometer: 'mng.maint.km', hours: 'mng.maint.hours', date: 'mng.maint.days' }

const ROLE_TONE = { superadmin: 'violet', admin: 'red', viewer: 'sky', driver: 'amber' }

/** ألوان حالات المركبات — مطابقة لنغمات StatusPill */
const STATUS_KEYS = ['moving', 'idle', 'stopped', 'offline']
const STATUS_COLOR = {
  moving: '#00a97a',
  idle: '#f5b301',
  stopped: '#f4634e',
  offline: '#8898ac',
}

/** من يفتح لوحة التحكّم. السائق يسجّل من تطبيقه وحده، فلا صفحات تُمنح له. */
const opensDashboard = (u) => u.role !== 'driver'

/** العدّاد المعروض بجانب كل قسم في الشريط الجانبي */
const TAB_COUNT = {
  users: ({ users }) => users.length,
  devices: ({ vehicles }) => vehicles.length,
  groups: ({ groups }) => groups.length,
  maint: ({ maintenance }) => maintenance.length,
  perms: ({ users }) => users.filter(opensDashboard).length,
  /* غير المقروء أولًا: العدد الذي يستدعي فتح القسم هو ما ينتظر ردًّا، لا
     مجموع المحادثات التي أُغلقت منذ أسابيع */
  support: ({ support }) => support.unread || support.threads.length,
}

/** الأقسام التي يصبح عدّادها تحذيريًّا — رقم أحمر يعني «هنا ما ينتظرك» */
const TAB_ALERT = {
  support: ({ support }) => support.unread > 0,
}

/** الأدوار التي تملك تعديل إعدادات الأسطول — نفس القائمة التي يفرضها السيرفر. */
const WRITE_ROLES = ['superadmin', 'admin']

export default function Management() {
  const { t, lang, nf, formatDateTime } = useLang()
  const { user, can } = useAuth()
  const {
    users, vehicles, groups, counts, maintenance,
    saveUser, deleteUser,
    saveVehicle, removeVehicle,
    saveGroup, removeGroup,
    saveMaintenance, completeMaintenance, removeMaintenance,
  } = useFleet()

  /* من لم يُمنح «الإدارة» يصل إلى هذه الشاشة من بطاقة حسابه في الشريط العلوي،
     فيرى ملفه الشخصي وحده. وحتى من مُنحها لا يرى أزرار الإضافة والتعديل ما لم
     يكن دوره يسمح بالكتابة — السيرفر يرفضها على أي حال، وزرّ لا يعمل كذب */
  const canManage = can('manage')
  const canWrite = canManage && WRITE_ROLES.includes(user?.role)
  const tabs = canManage
    ? /* الدعم للإدارة وحدها: السيرفر لا يفتح صندوق المحادثات لمن لا يكتب */
      TABS.filter((tb) => tb.key !== 'support' || canWrite)
    : TABS.filter((tb) => tb.key === 'profile')

  /* محادثات الدعم تُقرأ هنا لا داخل القسم وحده: العدّاد بجانب «الدعم الفني»
     في الشريط الجانبي هو ما يجعل رسالة سائق تُرى قبل أن يفتح أحد القسم */
  const support = useSupportInbox(canWrite)

  /* Every one of these forms writes to the server now, so they all share one
     draft and one error slot: the dialog stays open and says what went wrong
     rather than closing on a save that never landed. */
  const [draft, setDraft] = useState({})
  const [formError, setFormError] = useState(null)
  const [saving, setSaving] = useState(false)

  /** A blank draft per form, so a new row starts from a valid shape. */
  const blankDraft = (type) =>
    ({
      user: { nameAr: '', nameEn: '', username: '', email: '', role: 'viewer', groupId: groups[0]?.id ?? 1, active: true, password: '' },
      device: { plate: '', modelAr: '', modelEn: '', driverAr: '', driverEn: '', imei: '', sim: '', simExpiry: '', groupId: groups[0]?.id ?? 1, speedLimit: 120, active: true },
      group: { nameAr: '', nameEn: '', cityAr: '', cityEn: '', managerAr: '', managerEn: '' },
      maint: { vehicleId: vehicles[0]?.id, type: 'oil', kind: 'odometer', period: 10000, cost: 0, vendorAr: '', vendorEn: '' },
    })[type] ?? {}

  const openModal = (type, row) => {
    setFormError(null)
    setDraft(row ? { ...row, ...(type === 'user' ? { password: '' } : null) } : blankDraft(type))
    setModal({ type, row })
  }

  /** Save whichever form is open. Each one knows only its own writer. */
  const submitModal = async () => {
    const write = {
      user: saveUser,
      device: saveVehicle,
      group: saveGroup,
      maint: saveMaintenance,
    }[modal.type]
    if (!write) return setModal(null)

    setSaving(true)
    setFormError(null)
    try {
      await write(modal.row?.id, draft)
      setModal(null)
    } catch (err) {
      setFormError(apiErrorText(err.message, t))
    } finally {
      setSaving(false)
    }
  }

  /** Delete with a confirmation, reporting whatever the server refuses. */
  const confirmDelete = async (message, run) => {
    if (!window.confirm(message)) return
    try {
      await run()
    } catch (err) {
      window.alert(apiErrorText(err.message, t))
    }
  }

  const removeUser = (row) => confirmDelete(t('mng.deleteUserConfirm'), () => deleteUser(row.id))
  const dropVehicle = (row) =>
    confirmDelete(
      lang === 'ar'
        ? `حذف المركبة ${row.plate}؟ سيتم إلغاء ربط سائقيها وإزالتها من الخريطة الحية.`
        : `Delete vehicle ${row.plate}? Its drivers will be unassigned and it will leave the live map.`,
      () => removeVehicle(row.id),
    )
  const dropGroup = (row) =>
    confirmDelete(
      lang === 'ar'
        ? `حذف الفرع «${row.nameAr}»؟`
        : `Delete branch "${row.nameEn}"?`,
      () => removeGroup(row.id),
    )

  const [tab, setTab] = useState(canManage ? 'overview' : 'profile')

  /* الصلاحية قد تُسحب والشاشة مفتوحة — لا يُترك المستخدم أمام قسم لم يعد له */
  useEffect(() => {
    if (!canManage && tab !== 'profile') setTab('profile')
  }, [canManage, tab])
  const [query, setQuery] = useState('')
  // { type: 'user' | 'device' | 'group' | 'maint', row?: object } — وجود row يعني وضع التعديل
  const [modal, setModal] = useState(null)
  // فلاتر قسم الصيانة + نافذة التفاصيل
  const [maintType, setMaintType] = useState('all')
  const [maintStatus, setMaintStatus] = useState('all')
  const [maintDetails, setMaintDetails] = useState(null)
  const [maintDelete, setMaintDelete] = useState(null) // السجل المطلوب حذفه — يفتح تأكيدًا

  /* صلاحيات الصفحات محفوظة على الحساب نفسه (`pages`)، فتنجو من التحديث ويقرأها
     حارس المسارات. ما يُحتفَظ به هنا ليس مصدر الحقيقة بل طبقة تفاؤلية: المربّع
     يُضاء لحظة الضغط، وإن رفض السيرفر عاد كما كان وقيل السبب. */
  const [permDraft, setPermDraft] = useState({})
  const [permError, setPermError] = useState(null)
  const [permBusy, setPermBusy] = useState(null)

  const permsOf = useCallback((u) => permDraft[u.id] ?? pagesFor(u), [permDraft])

  const writePerms = useCallback(
    async (u, next) => {
      setPermDraft((prev) => ({ ...prev, [u.id]: next }))
      setPermError(null)
      setPermBusy(u.id)
      try {
        await saveUser(u.id, { ...u, pages: next })
        /* الحساب عاد من السيرفر ومعه صلاحياته — الطبقة التفاؤلية لم تعد لازمة،
           وإبقاؤها يخفي أي تعديل يجريه زميل على الحساب نفسه */
        setPermDraft((prev) => {
          const { [u.id]: _done, ...rest } = prev
          return rest
        })
      } catch (err) {
        setPermError(apiErrorText(err.message, t))
        setPermDraft((prev) => {
          const { [u.id]: _failed, ...rest } = prev
          return rest
        })
      } finally {
        setPermBusy(null)
      }
    },
    [saveUser],
  )

  const togglePerm = (u, pageKey) => {
    const list = permsOf(u)
    return writePerms(u, list.includes(pageKey) ? list.filter((k) => k !== pageKey) : [...list, pageKey])
  }
  const setAllPerms = (u, value) =>
    writePerms(
      u,
      value === 'all' ? [...PAGE_KEYS] : value === 'none' ? [] : [...(ROLE_PAGES[value] ?? [])],
    )

  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups])
  const q = query.trim().toLowerCase()

  const filteredUsers = users.filter(
    (u) => !q || u.nameEn.toLowerCase().includes(q) || u.nameAr.includes(query) || u.username.includes(q),
  )
  /* تبويب الصلاحيات يوزّع صفحات لوحة التحكّم، والسائق لا يفتحها أصلًا — صفّه
     هناك مربّعات لا تَمنح شيئًا ولا تَسحب شيئًا */
  const dashboardUsers = users.filter(opensDashboard)
  const filteredDashboardUsers = filteredUsers.filter(opensDashboard)

  const filteredVehicles = vehicles.filter(
    (v) => !q || v.plate.toLowerCase().includes(q) || v.imei.includes(q) || v.modelEn.toLowerCase().includes(q),
  )

  /* شريط البحث ظاهر فوق كل جدول، فجدول الفروع يستجيب له كما يستجيب الباقي */
  const filteredGroups = groups.filter(
    (g) =>
      !q ||
      g.nameEn.toLowerCase().includes(q) ||
      g.nameAr.includes(query) ||
      g.cityEn.toLowerCase().includes(q) ||
      g.cityAr.includes(query) ||
      g.managerEn.toLowerCase().includes(q) ||
      g.managerAr.includes(query),
  )

  const expiringSoon = vehicles.filter((v) => new Date(v.simExpiry) - Date.now() < 90 * 864e5).length

  // ملخّص المستخدمين المعروض فوق الجدول
  const activeUsers = users.filter((u) => u.active).length
  const activePct = users.length ? Math.round((activeUsers / users.length) * 100) : 0
  const adminUsers = users.filter((u) => WRITE_ROLES.includes(u.role)).length

  // سجلات الصيانة مرتبطة بالمركبات ومرتّبة حسب الأقرب استحقاقًا
  const vehicleById = useMemo(() => new Map(vehicles.map((v) => [v.id, v])), [vehicles])
  const maintRows = useMemo(
    () =>
      maintenance
        .map((m) => ({ ...m, vehicle: vehicleById.get(m.vehicleId) }))
        .filter((m) => m.vehicle)
        .sort((a, b) => b.used - a.used),
    [maintenance, vehicleById],
  )
  const filteredMaint = maintRows.filter((m) => {
    if (maintType !== 'all' && m.type !== maintType) return false
    if (maintStatus !== 'all' && m.state !== maintStatus) return false
    if (!q) return true
    return (
      m.vehicle.plate.toLowerCase().includes(q) ||
      m.vendorEn.toLowerCase().includes(q) ||
      m.vendorAr.includes(query) ||
      String(m.id).includes(q) ||
      maintName(m, t).toLowerCase().includes(q)
    )
  })
  const maintOverdue = maintRows.filter((m) => m.state === 'overdue').length
  const maintSoon = maintRows.filter((m) => m.state === 'soon').length
  const maintCost = maintRows.reduce((sum, m) => sum + m.cost, 0)

  // ملخّص الصلاحيات — يعدّ من يفتح اللوحة فقط، كما يفعل الجدول تحته
  const fullAccessUsers = dashboardUsers.filter((u) => permsOf(u).length === APP_PAGES.length).length
  const noAccessUsers = dashboardUsers.filter((u) => permsOf(u).length === 0).length
  const avgPages = dashboardUsers.length
    ? Math.round((dashboardUsers.reduce((s, u) => s + permsOf(u).length, 0) / dashboardUsers.length) * 10) / 10
    : 0

  const addLabel = {
    users: t('mng.addUser'), devices: t('mng.addDevice'), groups: t('mng.addGroup'), maint: t('mng.addMaint'),
  }[tab]
  const modalKey = { users: 'user', devices: 'device', groups: 'group', maint: 'maint' }[tab]

  // عنوان القسم المعروض أعلى عمود المحتوى
  const activeTab = TABS.find((tb) => tb.key === tab)
  const sectionLabel = activeTab?.label ?? ''
  const sectionDesc = { ar: activeTab?.descAr ?? '', en: activeTab?.descEn ?? '' }

  return (
    <div className="min-h-full">
      <div className="mx-auto min-w-0 max-w-[1500px] space-y-6 p-4 sm:p-6">
        <div className="flex flex-col items-stretch gap-6 lg:flex-row">
          {/* ── الشريط الجانبي ─────────────────────────────────── */}
          <aside className="shrink-0 lg:w-72 lg:self-start">
            {/* ارتفاع واحد مع عمود المحتوى كي ينتهيا عند خطّ واحد. تجاوز الشاشة
                يعني أن أسفله لا يُرى إلا بتمرير الصفحة، فلا التصاق هنا */}
            <Card className="flex flex-col overflow-hidden border-[var(--s-border-strong)] shadow-[var(--s-e2)] lg:h-[calc(100vh+2rem)]">
              {/* رأس الشريط */}
              <div className="flex items-center gap-3 border-b border-[var(--s-border)] bg-gradient-to-b from-[var(--s-panel-2)] to-transparent px-4 py-4">
                <IconPlate icon={Settings2} size="lg" />
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-extrabold tracking-tight">
                    {lang === 'ar' ? 'أقسام الإدارة' : 'Management'}
                  </p>
                  <p className="mt-0.5 truncate text-[11.5px] font-semibold text-muted">
                    {lang === 'ar' ? 'تنقّل بين أقسام النظام' : 'Navigate system sections'}
                  </p>
                </div>
              </div>

              <nav className="flex gap-2 overflow-x-auto p-3 lg:flex-col lg:gap-1.5 lg:overflow-visible">
                {tabs.map((tb) => {
                  const on = tab === tb.key
                  const args = { users, vehicles, groups, maintenance, support }
                  const count = TAB_COUNT[tb.key]?.(args)
                  const alarming = TAB_ALERT[tb.key]?.(args) ?? false
                  return (
                    <button
                      key={tb.key}
                      onClick={() => setTab(tb.key)}
                      aria-current={on ? 'page' : undefined}
                      className={cn(
                        'group relative flex shrink-0 cursor-pointer items-center gap-3 overflow-hidden rounded-xl px-3 py-2.5 text-start transition-all lg:w-full',
                        on
                          ? 'bg-brand-500/12 text-[var(--s-text)] shadow-[inset_0_0_0_1px_rgb(0_207_149/0.35)]'
                          : 'text-[var(--s-text)]/85 hover:bg-[var(--s-panel-2)] hover:text-[var(--s-text)]',
                      )}
                    >
                      {/* مؤشر القسم النشط */}
                      <span
                        className={cn(
                          'absolute inset-y-1.5 start-0 w-[3px] rounded-full bg-brand-500 transition-opacity',
                          on ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                      <span
                        className={cn(
                          'grid size-9 shrink-0 place-items-center rounded-xl transition-colors',
                          on
                            ? 'bg-brand-500 text-[#04120c] shadow-[0_6px_16px_-8px_rgb(0_207_149/0.9)]'
                            : 'bg-[var(--s-panel-2)] text-muted group-hover:text-brand-500',
                        )}
                      >
                        <tb.icon size={17} strokeWidth={2.4} />
                      </span>

                      <span className="min-w-0 flex-1 leading-tight">
                        <span
                          className={cn(
                            'block truncate text-[13.5px] font-extrabold',
                            on && 'text-brand-600 dark:text-brand-300',
                          )}
                        >
                          {t(tb.label)}
                        </span>
                        <span className="mt-0.5 hidden truncate text-[11px] font-semibold text-muted lg:block">
                          {lang === 'ar' ? tb.descAr : tb.descEn}
                        </span>
                      </span>

                      {count != null && (
                        <span
                          className={cn(
                            'shrink-0 rounded-lg px-2 py-1 text-[11.5px] font-black tabular-nums transition-colors',
                            alarming
                              ? 'bg-[#f4634e] text-white'
                              : on
                                ? 'bg-brand-500 text-[#04120c]'
                                : 'bg-[var(--s-panel-2)] text-muted group-hover:text-[var(--s-text)]',
                          )}
                        >
                          {nf(count)}
                        </span>
                      )}
                    </button>
                  )
                })}
              </nav>

              <div className="mt-auto hidden border-t border-[var(--s-border)] bg-[var(--s-panel-2)]/70 px-4 py-3.5 lg:block">
                <div className="flex items-center gap-2.5">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-500/15 text-brand-500">
                    <ShieldCheck size={15} strokeWidth={2.4} />
                  </span>
                  <span className="min-w-0 leading-tight">
                    <span className="block text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-muted">
                      {lang === 'ar' ? 'الصلاحية' : 'Role'}
                    </span>
                    <span className="block truncate text-[12.5px] font-extrabold">
                      {t(`mng.role.${user?.role ?? 'viewer'}`)}
                    </span>
                  </span>
                </div>
              </div>
            </Card>
          </aside>

          {/* ── المحتوى ────────────────────────────────────────── */}
          {/* أطول من الشاشة بقدر معلوم: الصفحة تتمرّر قليلًا ليُرى أسفل العمودين */}
          <div
            className={cn(
              'min-w-0 flex-1 space-y-6',
              FULL_HEIGHT_TABS.has(tab) && 'lg:flex lg:h-[calc(100vh+2rem)] lg:flex-col',
            )}
          >
        {/* عنوان القسم + شريط الأدوات — داخل عمود المحتوى حتى لا يزيح الشريط الجانبي */}
        {tab !== 'overview' && (
          <div className="shrink-0 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[20px] font-extrabold tracking-tight sm:text-[22px]">{t(sectionLabel)}</h2>
              <p className="mt-1 text-[12.5px] font-semibold text-muted">
                {lang === 'ar' ? sectionDesc.ar : sectionDesc.en}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {/* فلاتر خاصة بجدول الصيانة */}
              {tab === 'maint' && (
                <>
                  <Select
                    value={maintType}
                    onChange={(e) => setMaintType(e.target.value)}
                    className="h-10 w-36 text-[13px]"
                  >
                    <option value="all">{t('mng.maint.allTypes')}</option>
                    {MAINT_TYPES.map((k) => (
                      <option key={k} value={k}>{t(`mng.maint.type.${k}`)}</option>
                    ))}
                  </Select>
                  <Select
                    value={maintStatus}
                    onChange={(e) => setMaintStatus(e.target.value)}
                    className="h-10 w-36 text-[13px]"
                  >
                    <option value="all">{t('mng.maint.allStatus')}</option>
                    {['overdue', 'soon', 'planned'].map((k) => (
                      <option key={k} value={k}>{t(`mng.maint.${k}`)}</option>
                    ))}
                  </Select>
                </>
              )}
              {/* الملف الشخصي حساب واحد لا جدول — بحثٌ فيه لا يصفّي شيئًا */}
              {tab !== 'profile' && (
                <div className="w-44 sm:w-60">
                  <Input
                    icon={Search}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t('common.search')}
                    className="h-10 text-[13px]"
                  />
                </div>
              )}
              {modalKey && canWrite && (
                <Button size="sm" onClick={() => openModal(modalKey, null)}>
                  <Plus size={15} />
                  {addLabel}
                </Button>
              )}
            </div>
          </div>
        )}

        {tab === 'overview' && (
          <>
            <div>
              <h3 className="text-[20px] font-extrabold tracking-tight text-[var(--s-text)] sm:text-[22px]">
                {t('mng.welcome')}
              </h3>
              <p className="mt-1.5 text-[14px] font-semibold leading-relaxed text-[var(--s-text)]/75">
                {t('mng.welcomeDesc')}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatTile icon={Users2} label={t('mng.totalUsers')} value={nf(users.length)} tone="brand" />
              <StatTile icon={Truck} label={t('mng.totalDevices')} value={nf(vehicles.length)} tone="sky" />
              <StatTile icon={FolderTree} label={t('mng.totalGroups')} value={nf(groups.length)} tone="amber" />
              <StatTile icon={CalendarClock} label={t('mng.expiring')} value={nf(expiringSoon)} tone="red" />
            </div>

            <Card className="overflow-hidden">
              <CardHeader
                title={t('mng.groups')}
                subtitle={`${nf(groups.length)} ${lang === 'ar' ? 'فرع' : 'branches'}`}
                icon={Building2}
              />
              <div className="divide-y divide-[var(--s-border)]">
                {groups.map((g) => {
                  const gv = vehicles.filter((v) => v.groupId === g.id).length
                  const gu = users.filter((u) => u.groupId === g.id).length
                  const share = vehicles.length ? Math.round((gv / vehicles.length) * 100) : 0
                  return (
                    <div
                      key={g.id}
                      className="group relative flex flex-col gap-4 px-5 py-4 transition-colors hover:bg-[var(--s-panel-2)]/60 sm:flex-row sm:items-center sm:gap-6"
                    >
                      {/* مؤشر جانبي عند المرور */}
                      <span className="absolute inset-y-2 start-0 w-[3px] scale-y-0 rounded-full bg-brand-500 transition-transform duration-200 group-hover:scale-y-100" />

                      {/* الهوية */}
                      <div className="flex min-w-0 flex-1 items-center gap-3.5">
                        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-500/10 text-brand-500 ring-1 ring-inset ring-brand-500/25 transition-all group-hover:bg-brand-500 group-hover:text-[#04120c] group-hover:ring-brand-500">
                          <Building2 size={20} strokeWidth={2.2} />
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <h3 className="truncate text-[15px] font-extrabold tracking-tight">
                              {lang === 'ar' ? g.nameAr : g.nameEn}
                            </h3>
                            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--s-panel-2)] px-2 py-0.5 text-[10.5px] font-bold text-muted ring-1 ring-inset ring-[var(--s-border)]">
                              <MapPin size={11} strokeWidth={2.6} />
                              {lang === 'ar' ? g.cityAr : g.cityEn}
                            </span>
                          </div>
                          <p className="mt-1 flex items-center gap-1.5 truncate text-[12.5px] font-semibold text-muted">
                            <UserCog size={13} strokeWidth={2.3} className="shrink-0" />
                            <span className="truncate">{lang === 'ar' ? g.managerAr : g.managerEn}</span>
                          </p>
                        </div>
                      </div>

                      {/* حصة الفرع من الأسطول */}
                      <div className="hidden w-48 shrink-0 lg:block">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-[10.5px] font-extrabold uppercase tracking-[0.1em] text-muted">
                            {lang === 'ar' ? 'حصة الأسطول' : 'Fleet share'}
                          </span>
                          <span className="text-[13px] font-extrabold tabular-nums text-brand-600 dark:text-brand-300">
                            {nf(share)}%
                          </span>
                        </div>
                        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[var(--s-border)]/70">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-400 transition-[width] duration-700"
                            style={{ width: `${Math.max(share, 4)}%` }}
                          />
                        </div>
                      </div>

                      {/* الأرقام */}
                      <div className="flex shrink-0 items-stretch divide-x divide-[var(--s-border)] overflow-hidden rounded-xl bg-[var(--s-panel-2)]/70 ring-1 ring-inset ring-[var(--s-border)] rtl:divide-x-reverse">
                        <StatChip icon={Truck} value={nf(gv)} label={t('mng.vehiclesCount')} />
                        <StatChip icon={Users2} value={nf(gu)} label={t('mng.usersCount')} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader
                title={t('dash.statusCount')}
                subtitle={`${nf(vehicles.length)} ${lang === 'ar' ? 'مركبة' : 'vehicles'}`}
                icon={Truck}
              />

              <div className="p-5 sm:p-6">
                {/* شريط التوزيع الإجمالي */}
                <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-[var(--s-border)]/70">
                  {STATUS_KEYS.map((s) => {
                    const pct = vehicles.length ? (counts[s] / vehicles.length) * 100 : 0
                    return (
                      pct > 0 && (
                        <span
                          key={s}
                          className="h-full transition-[width] duration-700"
                          style={{ width: `${pct}%`, background: STATUS_COLOR[s] }}
                          title={`${t(`status.${s}`)} — ${nf(counts[s])}`}
                        />
                      )
                    )
                  })}
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {STATUS_KEYS.map((s) => {
                    const pct = vehicles.length ? Math.round((counts[s] / vehicles.length) * 100) : 0
                    return (
                      <div
                        key={s}
                        className="group relative overflow-hidden rounded-2xl bg-[var(--s-panel-2)]/60 p-4 ring-1 ring-inset ring-[var(--s-border)] transition-all hover:ring-[var(--s-border-strong)]"
                      >
                        <span
                          className="absolute inset-y-0 start-0 w-1"
                          style={{ background: STATUS_COLOR[s] }}
                        />
                        <div className="flex items-center gap-2">
                          <span
                            className="size-2.5 shrink-0 rounded-full"
                            style={{ background: STATUS_COLOR[s], boxShadow: `0 0 0 4px ${STATUS_COLOR[s]}22` }}
                          />
                          <span className="truncate text-[12px] font-extrabold text-[var(--s-text)]/85">
                            {t(`status.${s}`)}
                          </span>
                        </div>
                        <div className="mt-2.5 flex items-baseline gap-2">
                          <span className="text-[26px] font-extrabold leading-none tabular-nums">
                            {nf(counts[s])}
                          </span>
                          <span className="text-[12px] font-bold tabular-nums text-muted">{nf(pct)}%</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </Card>
          </>
        )}

        {tab === 'users' && (
          <>
            {/* بطاقات ملخّص المستخدمين */}
            <div className="shrink-0 grid gap-4 sm:grid-cols-3">
              <MetricCard
                icon={Users2}
                color="#00a97a"
                label={lang === 'ar' ? 'إجمالي المستخدمين' : 'Total users'}
                value={nf(users.length)}
                hint={`${nf(groups.length)} ${lang === 'ar' ? 'فرع' : 'branches'}`}
              />
              <MetricCard
                icon={UserCheck}
                color="#38a3ff"
                label={lang === 'ar' ? 'المستخدمون النشطون' : 'Active users'}
                value={nf(activeUsers)}
                hint={`${nf(activePct)}% ${lang === 'ar' ? 'من الإجمالي' : 'of total'}`}
              />
              <MetricCard
                icon={ShieldCheck}
                color="#f5b301"
                label={lang === 'ar' ? 'صلاحيات إدارية' : 'Admin access'}
                value={nf(adminUsers)}
                hint={lang === 'ar' ? 'مدير نظام أو منصّة' : 'Admins & super admins'}
              />
            </div>

            <Card className={cn("overflow-hidden", TABLE_CARD)}>
            <CardHeader title={t('mng.users')} subtitle={`${nf(filteredUsers.length)} ${t('rep.rows')}`} icon={Users2} />
            <Table
              fit
              className={TABLE_SCROLL}
              columns={[
                { key: 'n', label: t('common.name'), width: '20%' },
                { key: 'u', label: t('login.user'), width: '16%' },
                { key: 'r', label: t('mng.role'), width: '12%' },
                { key: 'g', label: t('mng.group'), width: '13%' },
                { key: 'l', label: t('mng.lastLogin'), width: '17%' },
                { key: 's', label: t('common.status'), width: '12%' },
                { key: 'a', label: t('common.actions'), width: '10%', className: 'text-end' },
              ]}
              rows={filteredUsers}
              empty={t('common.noData')}
              renderRow={(u) => (
                <>
                  <Td>
                    <span className="block font-extrabold">{lang === 'ar' ? u.nameAr : u.nameEn}</span>
                    <span className="block text-[11px] text-muted" dir="ltr">{u.email}</span>
                  </Td>
                  <Td className="text-muted" dir="ltr">{u.username}</Td>
                  <Td>
                    <Badge tone={ROLE_TONE[u.role]}>{t(`mng.role.${u.role}`)}</Badge>
                  </Td>
                  <Td className="text-muted">
                    {lang === 'ar' ? groupById.get(u.groupId)?.nameAr : groupById.get(u.groupId)?.nameEn}
                  </Td>
                  <Td className="text-[12px] text-muted">
                    {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : t('common.none')}
                  </Td>
                  <Td>
                    <Badge tone={u.active ? 'brand' : 'slate'} dot>
                      {u.active ? t('common.active') : t('common.inactive')}
                    </Badge>
                  </Td>
                  <Td className="text-end">
                    {canWrite && (
                      /* حساب مدير المنصّة لا يُعدَّل ولا يُحذف من هنا — صاحبه
                         وحده يعدّله من «الملف الشخصي»، والسيرفر يرفضها كذلك */
                      <RowActions
                        onEdit={() => openModal('user', u)}
                        onDelete={() => removeUser(u)}
                        locked={u.role === 'superadmin'}
                        lockTitle={t('mng.users.superadminLocked')}
                      />
                    )}
                  </Td>
                </>
              )}
            />
            </Card>
          </>
        )}

        {tab === 'devices' && (
          <Card className={cn("overflow-hidden", TABLE_CARD)}>
            <CardHeader title={t('mng.devices')} subtitle={`${nf(filteredVehicles.length)} ${t('rep.rows')}`} icon={Truck} />
            <Table
              fit
              className={TABLE_SCROLL}
              columns={[
                { key: 'p', label: t('mng.plate'), width: '11%' },
                { key: 'm', label: t('mng.model'), width: '13%' },
                { key: 'd', label: t('common.driver'), width: '15%' },
                { key: 'i', label: t('mng.imei'), width: '18%' },
                { key: 'g', label: t('mng.group'), width: '13%' },
                { key: 'e', label: t('mng.simExpiry'), width: '12%' },
                { key: 's', label: t('common.status'), width: '10%' },
                { key: 'a', label: t('common.actions'), width: '8%', className: 'text-end' },
              ]}
              rows={filteredVehicles}
              empty={t('common.noData')}
              renderRow={(v) => {
                const soon = new Date(v.simExpiry) - Date.now() < 90 * 864e5
                return (
                  <>
                    <Td className="font-extrabold" dir="ltr">{v.plate}</Td>
                    <Td className="text-muted">{lang === 'ar' ? v.modelAr : v.modelEn}</Td>
                    <Td>{lang === 'ar' ? v.driverAr : v.driverEn}</Td>
                    <Td className="text-[12px] text-muted" dir="ltr">
                      <span className="inline-flex items-center gap-1.5">
                        <Cpu size={13} />
                        {v.imei}
                      </span>
                    </Td>
                    <Td className="text-muted">
                      {lang === 'ar' ? groupById.get(v.groupId)?.nameAr : groupById.get(v.groupId)?.nameEn}
                    </Td>
                    <Td>
                      <span className={cn('text-[12px] font-bold', soon ? 'text-[#e04b34] dark:text-[#f4634e]' : 'text-muted')}>
                        {formatDateTime(v.simExpiry, { dateStyle: 'medium' })}
                      </span>
                    </Td>
                    <Td>
                      <StatusPill status={v.status} label={t(`status.${v.status}`)} />
                    </Td>
                    <Td className="text-end">
                      {canWrite && (
                        <RowActions onEdit={() => openModal('device', v)} onDelete={() => dropVehicle(v)} />
                      )}
                    </Td>
                  </>
                )
              }}
            />
          </Card>
        )}

        {tab === 'groups' && (
          <Card className={cn("overflow-hidden", TABLE_CARD)}>
            <CardHeader title={t('mng.groups')} subtitle={`${nf(filteredGroups.length)} ${t('rep.rows')}`} icon={FolderTree} />
            <Table
              fit
              className={TABLE_SCROLL}
              columns={[
                { key: 'n', label: t('common.name'), width: '24%' },
                { key: 'c', label: t('mng.city'), width: '15%' },
                { key: 'm', label: t('mng.manager'), width: '21%' },
                { key: 'v', label: t('mng.vehiclesCount'), width: '15%' },
                { key: 'u', label: t('mng.usersCount'), width: '15%' },
                { key: 'a', label: t('common.actions'), width: '10%', className: 'text-end' },
              ]}
              rows={filteredGroups}
              empty={t('common.noData')}
              renderRow={(g) => (
                <>
                  <Td className="font-extrabold">{lang === 'ar' ? g.nameAr : g.nameEn}</Td>
                  <Td className="text-muted">{lang === 'ar' ? g.cityAr : g.cityEn}</Td>
                  <Td>{lang === 'ar' ? g.managerAr : g.managerEn}</Td>
                  <Td className="tabular-nums">{nf(vehicles.filter((v) => v.groupId === g.id).length)}</Td>
                  <Td className="tabular-nums">{nf(users.filter((u) => u.groupId === g.id).length)}</Td>
                  <Td className="text-end">
                    {canWrite && (
                      <RowActions onEdit={() => openModal('group', g)} onDelete={() => dropGroup(g)} />
                    )}
                  </Td>
                </>
              )}
            />
          </Card>
        )}

        {tab === 'maint' && (
          <>
            {/* ملخّص الصيانة */}
            <div className="shrink-0 grid gap-4 sm:grid-cols-3">
              <MetricCard
                icon={AlertTriangle}
                color={MAINT_COLOR.overdue}
                label={t('mng.maint.overdue')}
                value={nf(maintOverdue)}
                hint={lang === 'ar' ? 'تحتاج إجراءً فوريًا' : 'Needs action now'}
              />
              <MetricCard
                icon={CalendarClock}
                color={MAINT_COLOR.soon}
                label={t('mng.maint.soon')}
                value={nf(maintSoon)}
                /* العتبة نسبة من الفترة لا عدد أيام — الفترة قد تكون كيلومترات
                   أو ساعات تشغيل، ووعد «خلال ١٤ يومًا» لا يصحّ فيهما */
                hint={lang === 'ar' ? 'بقي أقل من ١٥٪ من الفترة' : 'under 15% of the period left'}
              />
              <MetricCard
                icon={Wrench}
                color={MAINT_COLOR.planned}
                label={t('mng.maint.totalCost')}
                value={nf(maintCost)}
                hint={lang === 'ar' ? 'ريال' : 'SAR'}
              />
            </div>

            <Card className={cn("overflow-hidden", TABLE_CARD)}>
              <CardHeader
                title={t('mng.maint')}
                subtitle={`${nf(filteredMaint.length)} ${t('rep.rows')}`}
                icon={Wrench}
              />
              <Table
                fit
                className={TABLE_SCROLL}
                columns={[
                  { key: 'n', label: t('mng.maint.name'), width: '21%' },
                  { key: 'd', label: t('mng.maint.device'), width: '12%' },
                  { key: 'p', label: t('mng.maint.period'), width: '11%' },
                  { key: 'g', label: `${t('mng.maint.current')} / ${t('mng.maint.due')}`, width: '18%' },
                  { key: 'r', label: t('mng.maint.remaining'), width: '12%' },
                  { key: 's', label: t('common.status'), width: '11%' },
                  { key: 'a', label: t('common.actions'), width: '15%', className: 'text-end' },
                ]}
                rows={filteredMaint}
                empty={t('common.noData')}
                renderRow={(m) => {
                  const TypeIcon = MAINT_ICON[m.type] ?? Wrench
                  const unit = t(MAINT_UNIT[m.kind])
                  const usedPct = Math.min(100, Math.round(m.used * 100))
                  const remainLabel = `${nf(Math.abs(m.remaining))} ${unit}`
                  return (
                    <>
                      {/* الاسم — نوع الصيانة + المعرّف + أساس الاحتساب */}
                      <Td>
                        <span className="flex items-center gap-2.5">
                          <span
                            className="grid size-9 shrink-0 place-items-center rounded-xl"
                            style={{ background: `${MAINT_COLOR[m.state]}1f`, color: MAINT_COLOR[m.state] }}
                          >
                            <TypeIcon size={17} strokeWidth={2.3} />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-extrabold">{maintName(m, t)}</span>
                            <span className="block truncate text-[11px] font-semibold text-muted">
                              #{m.id} · {t(`mng.maint.kind.${m.kind}`)}
                            </span>
                          </span>
                        </span>
                      </Td>

                      {/* الجهاز */}
                      <Td>
                        <span className="block font-extrabold" dir="ltr">{m.vehicle.plate}</span>
                        <span className="block truncate text-[11px] text-muted">
                          {lang === 'ar' ? m.vehicle.modelAr : m.vehicle.modelEn}
                        </span>
                      </Td>

                      {/* الفترة */}
                      <Td className="text-[12.5px] font-bold text-muted">
                        {t('mng.maint.every').replace('{v}', `${nf(m.period)} ${unit}`)}
                      </Td>

                      {/* الحالي / الاستحقاق + شريط التقدّم */}
                      <Td>
                        <span className="flex items-baseline justify-between gap-2 text-[12px] font-bold tabular-nums">
                          <span>{nf(m.current)}</span>
                          <span className="text-muted">{nf(m.nextDue)}</span>
                        </span>
                        <span className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full bg-[var(--s-border)]/70">
                          <span
                            className="block h-full rounded-full"
                            style={{ width: `${usedPct}%`, background: MAINT_COLOR[m.state] }}
                          />
                        </span>
                      </Td>

                      {/* المتبقي */}
                      <Td>
                        <span
                          className="text-[12.5px] font-extrabold tabular-nums"
                          style={{ color: m.state === 'planned' ? undefined : MAINT_COLOR[m.state] }}
                        >
                          {(m.remaining < 0 ? t('mng.maint.overdueBy') : t('mng.maint.remainingBy'))
                            .replace('{v}', remainLabel)}
                        </span>
                      </Td>

                      {/* الحالة */}
                      <Td>
                        <Badge tone={MAINT_TONE[m.state]} dot>{t(`mng.maint.${m.state}`)}</Badge>
                      </Td>

                      {/* إكمال · تفاصيل · تعديل · حذف */}
                      <Td className="text-end">
                        <span className="inline-flex flex-nowrap gap-0.5">
                          {canWrite && (
                            <IconButton
                              icon={Check}
                              title={t('mng.maint.complete')}
                              tone="brand"
                              onClick={() => completeMaintenance(m.id).catch((err) => window.alert(apiErrorText(err.message, t)))}
                            />
                          )}
                          {/* التفاصيل قراءة — تبقى لمن يقرأ الجدول ولا يكتبه */}
                          <IconButton
                            icon={Info}
                            title={t('mng.maint.details')}
                            onClick={() => setMaintDetails(m)}
                          />
                          {canWrite && (
                            <>
                              <IconButton
                                icon={Pencil}
                                title={t('common.edit')}
                                onClick={() => openModal('maint', m)}
                              />
                              <IconButton
                                icon={Trash2}
                                title={t('common.delete')}
                                tone="red"
                                onClick={() => setMaintDelete(m)}
                              />
                            </>
                          )}
                        </span>
                      </Td>
                    </>
                  )
                }}
              />
            </Card>
          </>
        )}

        {tab === 'perms' && (
          <>
            {/* ملخّص الصلاحيات */}
            <div className="shrink-0 grid gap-4 sm:grid-cols-3">
              <MetricCard
                icon={ShieldCheck}
                color="#00a97a"
                label={t('mng.perms.fullAccess')}
                value={nf(fullAccessUsers)}
                hint={`${lang === 'ar' ? 'من' : 'of'} ${nf(dashboardUsers.length)}`}
              />
              <MetricCard
                icon={KeyRound}
                color="#38a3ff"
                label={t('mng.perms.avg')}
                value={nf(avgPages)}
                hint={`${lang === 'ar' ? 'من' : 'of'} ${nf(APP_PAGES.length)} ${lang === 'ar' ? 'صفحات' : 'pages'}`}
              />
              <MetricCard
                icon={AlertTriangle}
                color="#f4634e"
                label={t('mng.perms.noAccess')}
                value={nf(noAccessUsers)}
                hint={lang === 'ar' ? 'بحاجة لمراجعة' : 'needs review'}
              />
            </div>

            <Card className={cn("overflow-hidden", TABLE_CARD)}>
              <CardHeader
                title={t('mng.perms')}
                subtitle={t('mng.perms.desc')}
                icon={KeyRound}
              />

              {/* تلميح الاستخدام */}
              <p className="flex items-center gap-2 border-b border-[var(--s-border)] bg-[var(--s-panel-2)]/50 px-5 py-2.5 text-[11.5px] font-semibold text-muted">
                <Info size={14} className="shrink-0" />
                {t('mng.perms.hint')}
              </p>

              {permError && (
                <p className="border-b border-[var(--s-border)] bg-[#f4634e]/12 px-5 py-2.5 text-[12px] font-bold text-[#e04b34] dark:text-[#f4634e]">
                  {permError}
                </p>
              )}

              <Table
                fit
                className={TABLE_SCROLL}
                columns={[
                  { key: 'u', label: t('mng.perms.employee'), width: '22%' },
                  ...APP_PAGES.map((p) => ({ key: p.key, label: t(p.label), width: '11%', className: 'text-center' })),
                  { key: 'a', label: t('common.actions'), width: '12%', className: 'text-end' },
                ]}
                rows={filteredDashboardUsers}
                empty={t('common.noData')}
                renderRow={(u) => {
                  const list = permsOf(u)
                  /* مدير النظام هو من يوزّع الصلاحيات — حجب «الإدارة» عنه يترك
                     المنصّة بلا أحد يستطيع إعادتها، فصفوفه للعرض لا للتعديل */
                  const locked = u.role === 'superadmin'
                  /* سحب «الإدارة» عن نفسك يغلق الشاشة التي تُعاد منها وحدها،
                     فلا يبقى إلا أن ينقذك زميل. السيرفر يرفضها كذلك */
                  const isSelf = u.id === user?.id
                  const busy = permBusy === u.id
                  return (
                    <>
                      <Td>
                        <span className="block truncate font-extrabold">
                          {lang === 'ar' ? u.nameAr : u.nameEn}
                        </span>
                        <span className="block truncate text-[11px] font-semibold text-muted">
                          {t(`mng.role.${u.role}`)} · {nf(list.length)}/{nf(APP_PAGES.length)}
                          {locked ? ` · ${t('mng.perms.locked')}` : isSelf ? ` · ${t('mng.perms.self')}` : ''}
                        </span>
                      </Td>

                      {APP_PAGES.map((p) => (
                        <Td key={p.key} className="text-center">
                          <PermToggle
                            icon={p.icon}
                            on={list.includes(p.key)}
                            label={t(p.label)}
                            disabled={locked || busy || !canWrite || (isSelf && p.key === 'manage')}
                            onClick={() => togglePerm(u, p.key)}
                          />
                        </Td>
                      ))}

                      <Td className="text-end">
                        <span className="inline-flex flex-nowrap gap-0.5">
                          <IconButton
                            icon={Check}
                            title={t('mng.perms.selectAll')}
                            disabled={locked || busy || !canWrite}
                            onClick={() => setAllPerms(u, 'all')}
                          />
                          <IconButton
                            icon={RotateCcw}
                            title={t('mng.perms.resetRole')}
                            disabled={locked || busy || !canWrite}
                            onClick={() => setAllPerms(u, u.role)}
                          />
                          <IconButton
                            icon={X}
                            title={t('mng.perms.clearAll')}
                            tone="red"
                            disabled={locked || busy || !canWrite || isSelf}
                            onClick={() => setAllPerms(u, 'none')}
                          />
                        </span>
                      </Td>
                    </>
                  )
                }}
              />
            </Card>
          </>
        )}

        {tab === 'support' && <SupportSection inbox={support} query={query} />}

        {tab === 'profile' && <ProfileSection groups={groups} />}
          </div>
        </div>
      </div>

      {/* نموذج الإضافة/التعديل — يُعبّأ من السطر عند الضغط على أيقونة التعديل */}
      <Modal
        // key يعيد بناء الحقول (defaultValue) عند تبديل السطر المحرَّر
        key={modal ? `${modal.type}-${modal.row?.id ?? 'new'}` : 'closed'}
        open={Boolean(modal)}
        onClose={() => setModal(null)}
        error={formError}
        offsetY={40}
        title={
          modal?.row
            ? `${t('common.edit')} — ${editTitle(modal, lang)}`
            : {
                user: t('mng.addUser'),
                device: t('mng.addDevice'),
                group: t('mng.addGroup'),
                maint: t('mng.addMaint'),
              }[modal?.type] ?? ''
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(null)}>{t('common.cancel')}</Button>
            <Button onClick={submitModal} disabled={saving}>
              {saving ? t('common.loading') : t('common.save')}
            </Button>
          </>
        }
      >
        {modal?.type === 'user' && (
          <UserForm
            draft={draft}
            setDraft={setDraft}
            vehicles={vehicles}
            groups={groups}
            isNew={!modal.row}
          />
        )}

        {modal?.type === 'device' && (
          <DeviceForm draft={draft} setDraft={setDraft} groups={groups} />
        )}

        {modal?.type === 'maint' && (
          <MaintForm draft={draft} setDraft={setDraft} vehicles={vehicles} isNew={!modal.row} />
        )}

        {modal?.type === 'group' && <GroupForm draft={draft} setDraft={setDraft} />}
      </Modal>

      {/* تأكيد حذف سجل صيانة */}
      <Modal
        open={Boolean(maintDelete)}
        onClose={() => setMaintDelete(null)}
        title={t('common.delete')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setMaintDelete(null)}>{t('common.cancel')}</Button>
            <Button
              className="!bg-none !bg-[#f4634e] !text-white hover:!bg-[#e04b34] !shadow-[#f4634e]/25"
              onClick={() => {
                removeMaintenance(maintDelete.id).catch((err) => window.alert(apiErrorText(err.message, t)))
                setMaintDelete(null)
              }}
            >
              <Trash2 size={15} />
              {t('common.delete')}
            </Button>
          </>
        }
      >
        {maintDelete && (
          <div className="flex items-start gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#f4634e]/12 text-[#f4634e]">
              <AlertTriangle size={22} strokeWidth={2.2} />
            </span>
            <div className="min-w-0">
              <p className="text-[14px] font-extrabold">{t('mng.maint.deleteConfirm')}</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
                {maintName(maintDelete, t)} — {maintDelete.vehicle.plate} (#{maintDelete.id})
              </p>
              <p className="mt-1 text-[12px] font-semibold text-muted">{t('mng.maint.deleteHint')}</p>
            </div>
          </div>
        )}
      </Modal>

      {/* تفاصيل سجل الصيانة — للقراءة فقط */}
      <Modal
        open={Boolean(maintDetails)}
        onClose={() => setMaintDetails(null)}
        offsetY={48}
        title={maintDetails ? `${t('mng.maint.details')} #${maintDetails.id}` : ''}
        footer={<Button variant="ghost" onClick={() => setMaintDetails(null)}>{t('common.close')}</Button>}
      >
        {maintDetails && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span
                className="grid size-10 shrink-0 place-items-center rounded-xl"
                style={{
                  background: `${MAINT_COLOR[maintDetails.state]}1f`,
                  color: MAINT_COLOR[maintDetails.state],
                }}
              >
                {(() => {
                  const Ico = MAINT_ICON[maintDetails.type] ?? Wrench
                  return <Ico size={19} strokeWidth={2.2} />
                })()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[14px] font-extrabold leading-tight">
                  {maintName(maintDetails, t)}
                </p>
                <p className="truncate text-[11.5px] font-semibold text-muted">
                  {maintDetails.vehicle.plate} · {t(`mng.maint.kind.${maintDetails.kind}`)}
                </p>
              </div>
              <Badge tone={MAINT_TONE[maintDetails.state]} dot className="ms-auto shrink-0">
                {t(`mng.maint.${maintDetails.state}`)}
              </Badge>
            </div>

            {/* شريط التقدّم نحو الاستحقاق */}
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--s-border)]/70">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, Math.round(maintDetails.used * 100))}%`,
                  background: MAINT_COLOR[maintDetails.state],
                }}
              />
            </div>

            <dl className="divide-y divide-[var(--s-border)] rounded-xl bg-[var(--s-panel-2)]/50 px-4">
              {[
                [t('mng.maint.start'), nf(maintDetails.start)],
                [t('mng.maint.period'), `${nf(maintDetails.period)} ${t(MAINT_UNIT[maintDetails.kind])}`],
                [t('mng.maint.current'), nf(maintDetails.current)],
                [t('mng.maint.due'), nf(maintDetails.nextDue)],
                [
                  maintDetails.remaining < 0 ? t('mng.maint.overdue') : t('mng.maint.remaining'),
                  `${nf(Math.abs(maintDetails.remaining))} ${t(MAINT_UNIT[maintDetails.kind])}`,
                ],
                [t('mng.maint.cost'), nf(maintDetails.cost)],
                [t('mng.maint.vendor'), lang === 'ar' ? maintDetails.vendorAr : maintDetails.vendorEn],
                [t('mng.group'), lang === 'ar'
                  ? groupById.get(maintDetails.vehicle.groupId)?.nameAr
                  : groupById.get(maintDetails.vehicle.groupId)?.nameEn],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-4 py-1.5">
                  <dt className="shrink-0 text-[11.5px] font-bold text-muted">{k}</dt>
                  <dd className="min-w-0 truncate text-[12.5px] font-extrabold tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </Modal>
    </div>
  )
}

/** اسم السجل المعروض في عنوان نافذة التعديل */
function editTitle(modal, lang) {
  const r = modal.row
  if (modal.type === 'device') return r.plate
  if (modal.type === 'maint') return r.vehicle?.plate ?? `#${r.id}`
  return lang === 'ar' ? r.nameAr : r.nameEn
}

/** بطاقة ملخّص صغيرة تُعرض فوق الجداول */
function MetricCard({ icon: Icon, color, label, value, hint }) {
  return (
    <Card className="relative overflow-hidden p-4 shadow-[var(--s-e2)] transition-shadow hover:shadow-[0_4px_10px_rgb(15_23_42/0.08),0_24px_46px_-20px_rgb(15_23_42/0.35)]">
      <span className="absolute inset-y-0 start-0 w-1" style={{ background: color }} />
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[11.5px] font-extrabold uppercase tracking-[0.1em] text-muted">{label}</p>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-[26px] font-extrabold leading-none tabular-nums">{value}</span>
            <span className="truncate text-[11.5px] font-bold text-muted">{hint}</span>
          </div>
        </div>
        <span
          className="grid size-11 shrink-0 place-items-center rounded-2xl"
          style={{ background: `${color}1f`, color }}
        >
          <Icon size={20} strokeWidth={2.3} />
        </span>
      </div>
    </Card>
  )
}

/** رقم مختصر بأيقونة — يُستخدم في صف الفرع */
function StatChip({ icon: Icon, value, label }) {
  return (
    <span className="flex min-w-[100px] items-center gap-2.5 px-3.5 py-2.5 leading-tight">
      <Icon size={16} strokeWidth={2.3} className="shrink-0 text-muted" />
      <span className="min-w-0">
        <span className="block text-[17px] font-extrabold tabular-nums">{value}</span>
        <span className="block truncate text-[10.5px] font-bold text-muted">{label}</span>
      </span>
    </span>
  )
}

/**
 * Bilingual text field.
 *
 * The tables show one language at a time, but a record carries both — so
 * editing the Arabic name must not blank the English one. The field writes
 * only the side matching the interface language, and seeds the other from it
 * when the record is new and has nothing there yet.
 */
function BiField({ draft, setDraft, base, label, className, ...rest }) {
  const { lang } = useLang()
  const mine = lang === 'ar' ? `${base}Ar` : `${base}En`
  const other = lang === 'ar' ? `${base}En` : `${base}Ar`

  return (
    <Field label={label} className={className}>
      <Input
        {...rest}
        value={draft[mine] ?? ''}
        placeholder={label}
        onChange={(e) => {
          const value = e.target.value
          setDraft((d) => ({
            ...d,
            [mine]: value,
            /* mirror into the empty side so a single-language entry is complete */
            [other]: d[other] ? d[other] : value,
          }))
        }}
      />
    </Field>
  )
}

/** نموذج إضافة/تعديل مركبة — سجل الأسطول على السيرفر */
function DeviceForm({ draft, setDraft, groups }) {
  const { t, lang } = useLang()
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }))

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t('mng.plate')}>
        <Input
          dir="ltr"
          value={draft.plate ?? ''}
          placeholder="0000 ABC"
          onChange={(e) => set({ plate: e.target.value })}
        />
      </Field>
      <BiField draft={draft} setDraft={setDraft} base="model" label={t('mng.model')} />

      <Field label={t('mng.imei')}>
        <Input
          dir="ltr"
          value={draft.imei ?? ''}
          placeholder="860000000000000"
          onChange={(e) => set({ imei: e.target.value })}
        />
      </Field>
      <BiField draft={draft} setDraft={setDraft} base="driver" label={t('common.driver')} />

      <Field label={t('mng.sim')}>
        <Input
          dir="ltr"
          value={draft.sim ?? ''}
          placeholder="9665XXXXXXXX"
          onChange={(e) => set({ sim: e.target.value })}
        />
      </Field>
      <Field label={t('mng.simExpiry')}>
        <Input
          type="date"
          dir="ltr"
          value={(draft.simExpiry ?? '').slice(0, 10)}
          onChange={(e) => set({ simExpiry: e.target.value })}
        />
      </Field>

      <Field label={t('mng.group')}>
        <Select value={draft.groupId ?? ''} onChange={(e) => set({ groupId: Number(e.target.value) })}>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{lang === 'ar' ? g.nameAr : g.nameEn}</option>
          ))}
        </Select>
      </Field>
      {/* what the speeding rules and the speed report measure this vehicle against */}
      <Field label={`${t('mng.speedLimit')} (${t('common.kmh')})`}>
        <Input
          type="number"
          dir="ltr"
          min="20"
          max="300"
          value={draft.speedLimit ?? 120}
          onChange={(e) => set({ speedLimit: Number(e.target.value) })}
        />
      </Field>
    </div>
  )
}

/** نموذج إضافة/تعديل فرع */
function GroupForm({ draft, setDraft }) {
  const { t } = useLang()
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <BiField draft={draft} setDraft={setDraft} base="name" label={t('common.name')} />
      <BiField draft={draft} setDraft={setDraft} base="city" label={t('mng.city')} />
      <BiField draft={draft} setDraft={setDraft} base="manager" label={t('mng.manager')} className="sm:col-span-2" />
    </div>
  )
}

/**
 * نموذج إضافة/تعديل صيانة — حقوله مطابقة لأعمدة الجدول:
 * الجهاز · الاسم · النوع · الفترة · البداية · الاستحقاق (محسوب) · التكلفة · الورشة
 */
function MaintForm({ draft, setDraft, vehicles, isNew }) {
  const { t, lang } = useLang()
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }))

  const vehicle = vehicles.find((v) => v.id === Number(draft.vehicleId))
  const kind = draft.kind ?? 'odometer'

  /* the reading a new record would start counting from — the server works this
     out too when `start` is omitted, and shows the same number here */
  const currentReading =
    kind === 'odometer' ? Math.round(vehicle?.odometer ?? 0)
    : kind === 'hours' ? Math.round(vehicle?.engineHours ?? 0)
    : Math.floor(Date.now() / 864e5)

  const unit = t(MAINT_UNIT[kind])
  const field = 'h-10 text-[13px]'

  /* نوع معروف يُعرض باسمه المترجم، فالسجل نفسه يُقرأ بالعربية وبالإنجليزية دون
     أن يُخزَّن اسمه مرتين. أما ما يكتبه المستخدم فيُحفَظ كما كتبه */
  const nameValue =
    draft.type === 'other' ? (draft.label ?? '')
    : draft.type ? t(`mng.maint.type.${draft.type}`)
    : ''
  const setName = (value) => {
    const typed = value.trim()
    const preset = MAINT_PRESETS.find((k) => t(`mng.maint.type.${k}`) === typed)
    set(preset ? { type: preset, label: '' } : { type: 'other', label: value })
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={t('mng.maint.device')}>
        <Select
          className={field}
          value={draft.vehicleId ?? ''}
          onChange={(e) => set({ vehicleId: Number(e.target.value) })}
        >
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.plate} — {lang === 'ar' ? v.modelAr : v.modelEn}
            </option>
          ))}
        </Select>
      </Field>
      {/* الاسم — قائمة وكتابة معًا: الأنواع المعروفة تُقترح، وأي اسم آخر
          يُحفظ كما هو تحت النوع «صيانة أخرى» */}
      <Field label={t('mng.maint.name')} hint={t('mng.maint.nameHint')}>
        <Input
          className={field}
          list="maint-name-presets"
          autoComplete="off"
          value={nameValue}
          onChange={(e) => setName(e.target.value)}
        />
        <datalist id="maint-name-presets">
          {MAINT_PRESETS.map((k) => (
            <option key={k} value={t(`mng.maint.type.${k}`)} />
          ))}
        </datalist>
      </Field>
      <Field label={t('mng.maint.type')}>
        <Select
          className={field}
          value={kind}
          onChange={(e) => {
            /* the start reading is in the old unit — drop it so the server
               re-bases the plan on the new one */
            set({ kind: e.target.value, start: null })
          }}
        >
          {['odometer', 'hours', 'date'].map((k) => (
            <option key={k} value={k}>{t(`mng.maint.kind.${k}`)}</option>
          ))}
        </Select>
      </Field>
      <Field label={`${t('mng.maint.period')} (${unit})`}>
        <Input
          className={field}
          type="number"
          dir="ltr"
          value={draft.period ?? ''}
          onChange={(e) => set({ period: Number(e.target.value) })}
        />
      </Field>
      <Field label={`${t('mng.maint.start')} (${unit})`}>
        <Input
          className={field}
          type="number"
          dir="ltr"
          value={draft.start ?? (isNew ? currentReading : '')}
          onChange={(e) => set({ start: Number(e.target.value) })}
        />
      </Field>
      <Field label={t('mng.maint.cost')}>
        <Input
          className={field}
          type="number"
          dir="ltr"
          value={draft.cost ?? 0}
          onChange={(e) => set({ cost: Number(e.target.value) })}
        />
      </Field>
      <BiField
        draft={draft}
        setDraft={setDraft}
        base="vendor"
        label={t('mng.maint.vendor')}
        className="sm:col-span-2"
      />
    </div>
  )
}

/** صفحة الملف الشخصي — بيانات الحساب المسجَّل حاليًا وتفضيلاته */
/**
 * صندوق محادثات الدعم — ملخّصات فقط.
 *
 * يعمل خارج قسم الدعم أيضًا، لأن عدّاد الشريط الجانبي يعتمد عليه: رسالة سائق
 * يجب أن تُرى وأنت في «المركبات»، لا حين تفتح القسم مصادفةً.
 */
function useSupportInbox(enabled) {
  const [threads, setThreads] = useState([])
  const [unread, setUnread] = useState(0)
  const [offline, setOffline] = useState(false)

  const reload = useCallback(
    async (signal) => {
      if (!enabled) return
      try {
        const data = await api.getSupportThreads(signal)
        setThreads(data.threads ?? [])
        setUnread(data.unread ?? 0)
        setOffline(false)
      } catch (err) {
        /* تعذّر التحديث لا يمسح ما وصل سابقًا — قائمة قديمة أنفع من فارغة */
        if (err.name !== 'AbortError') setOffline(true)
      }
    },
    [enabled],
  )

  useEffect(() => {
    /* من لا يملك الردّ لا يُسأل السيرفر عنه: طلب يعود بـ403 كل ربع دقيقة ضجيج
       في السجلّ ولا يعرض شيئًا على أحد */
    if (!enabled) return undefined
    const ctrl = new AbortController()
    reload(ctrl.signal)
    const timer = setInterval(() => reload(), SUPPORT_POLL_MS)
    return () => {
      ctrl.abort()
      clearInterval(timer)
    }
  }, [enabled, reload])

  return { threads, unread, offline, reload }
}

/** قسم الدعم الفني: قائمة السائقين على جهة، والمحادثة المفتوحة على الأخرى. */
function SupportSection({ inbox, query }) {
  const { t, lang, nf, formatDateTime } = useLang()
  const { threads, unread, offline, reload } = inbox

  const [openId, setOpenId] = useState(null)
  const [thread, setThread] = useState(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const scroller = useRef(null)

  const q = query.trim().toLowerCase()
  const rows = threads.filter(
    (th) =>
      !q ||
      th.nameEn.toLowerCase().includes(q) ||
      th.nameAr.includes(query) ||
      th.username.toLowerCase().includes(q),
  )

  /* أحدث محادثة تُفتح وحدها: من يدخل القسم يدخله من أجل آخر ما وصل */
  useEffect(() => {
    if (openId == null && threads.length) setOpenId(threads[0].driverId)
  }, [threads, openId])

  const openThread = useCallback(
    async (driverId, signal) => {
      const { thread: row } = await api.getSupportThread(driverId, signal)
      setThread(row)
      /* الفتح نفسه هو القراءة — وتصفير العدّاد يعود على قائمة الشريط أيضًا */
      if (row.staffUnread > 0) {
        await api.readSupport(driverId)
        reload()
      }
    },
    [reload],
  )

  useEffect(() => {
    if (openId == null) return undefined
    const ctrl = new AbortController()
    const tick = () => openThread(openId, ctrl.signal).catch((err) => {
      if (err.name !== 'AbortError') setError(apiErrorText(err.message, t))
    })
    setError(null)
    tick()
    const timer = setInterval(tick, SUPPORT_POLL_MS)
    return () => {
      ctrl.abort()
      clearInterval(timer)
    }
  }, [openId, openThread])

  /* آخر رسالة هي المقصودة دائمًا — القائمة تُفتح على أسفلها لا على أعلاها.
     والتحديث الدوري يعيد بناء المحادثة كل ربع دقيقة، فلو نزلنا مع كل ردّ من
     السيرفر لانتُزع من يقرأ رسالة قديمة إلى الأسفل وهو يقرؤها. النزول يتبع
     وصول رسالة جديدة أو فتح محادثة أخرى، لا مجرد وصول الردّ */
  const lastMessageId = thread?.messages?.[thread.messages.length - 1]?.id ?? null
  useEffect(() => {
    const box = scroller.current
    if (box) box.scrollTop = box.scrollHeight
  }, [openId, lastMessageId])

  const send = async () => {
    const text = draft.trim()
    if (!text || openId == null || sending) return
    setSending(true)
    setError(null)
    try {
      const { thread: row } = await api.replySupport(openId, text)
      setThread(row)
      setDraft('')
      reload()
    } catch (err) {
      setError(apiErrorText(err.message, t))
    } finally {
      setSending(false)
    }
  }

  const openRow = threads.find((th) => th.driverId === openId) ?? null
  const driverName = openRow ? (lang === 'ar' ? openRow.nameAr : openRow.nameEn) : ''

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          icon={MessagesSquare}
          color="#00a97a"
          label={t('mng.support.openThreads')}
          value={nf(threads.length)}
        />
        <MetricCard
          icon={Bell}
          color="#f4634e"
          label={t('mng.support.unread')}
          value={nf(unread)}
        />
        <MetricCard
          icon={CalendarClock}
          color="#5aa9f8"
          label={t('common.lastUpdate')}
          value={
            threads[0]?.updatedAt
              ? formatDateTime(new Date(threads[0].updatedAt), { timeStyle: 'short' })
              : '—'
          }
        />
      </div>

      {offline && (
        <p className="rounded-xl bg-[#f4634e]/12 px-4 py-2.5 text-[12.5px] font-bold text-[#e04b34] dark:text-[#f4634e]">
          {t('mng.support.offline')}
        </p>
      )}

      {/* على الشاشات الواسعة يأخذ اللوحان ارتفاع النافذة، فالتمرير يقع داخل
          المحادثة وداخل القائمة — لا بالصفحة كلها. من يقرأ رسالة يبقى شريط
          الردّ ورأس المحادثة أمامه بدل أن يختفيا فوق حافة الشاشة */}
      <div className="grid gap-6 lg:h-[calc(100vh-19rem)] lg:min-h-[440px] lg:grid-cols-[320px_1fr]">
        {/* قائمة المحادثات */}
        <Card className="flex min-h-0 flex-col overflow-hidden">
          <CardHeader title={t('mng.support.threads')} icon={MessagesSquare} dense />
          {rows.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <MessageSquare size={28} className="mx-auto text-muted" />
              <p className="mt-3 text-[13.5px] font-extrabold">{t('mng.support.empty')}</p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
                {t('mng.support.emptyHint')}
              </p>
            </div>
          ) : (
            <div className="min-h-0 max-h-[560px] flex-1 divide-y divide-[var(--s-border)] overflow-y-auto lg:max-h-none">
              {rows.map((th) => {
                const on = th.driverId === openId
                return (
                  <button
                    key={th.driverId}
                    onClick={() => setOpenId(th.driverId)}
                    className={cn(
                      'flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-start transition-colors',
                      on ? 'bg-brand-500/10' : 'hover:bg-[var(--s-panel-2)]',
                    )}
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-500/15 text-[12px] font-black text-brand-600 dark:text-brand-300">
                      {(lang === 'ar' ? th.nameAr : th.nameEn).trim().slice(0, 1)}
                    </span>
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block truncate text-[13px] font-extrabold">
                        {lang === 'ar' ? th.nameAr : th.nameEn}
                      </span>
                      <span className="mt-0.5 block truncate text-[11.5px] font-semibold text-muted">
                        {th.last ? th.last.text : t('mng.support.noMessages')}
                      </span>
                    </span>
                    {th.staffUnread > 0 && (
                      <span className="shrink-0 rounded-lg bg-[#f4634e] px-2 py-0.5 text-[11px] font-black tabular-nums text-white">
                        {nf(th.staffUnread)}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </Card>

        {/* المحادثة المفتوحة */}
        <Card className="flex min-h-[520px] flex-col overflow-hidden lg:min-h-0">
          {openId == null ? (
            <div className="grid flex-1 place-items-center px-6 py-12 text-center">
              <div>
                <Headset size={30} className="mx-auto text-muted" />
                <p className="mt-3 text-[14px] font-extrabold">{t('mng.support.pick')}</p>
                <p className="mt-1.5 text-[12.5px] text-muted">{t('mng.support.pickHint')}</p>
              </div>
            </div>
          ) : (
            <>
              <CardHeader
                title={driverName || `#${openId}`}
                subtitle={
                  openRow
                    ? [
                        openRow.username,
                        openRow.vehicleId
                          ? `${t('mng.vehicle')} #${nf(openRow.vehicleId)}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')
                    : ''
                }
                icon={UserRound}
                dense
              />

              <div ref={scroller} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
                {(thread?.messages ?? []).length === 0 && (
                  <p className="py-10 text-center text-[12.5px] font-semibold text-muted">
                    {t('mng.support.noMessages')}
                  </p>
                )}
                {(thread?.messages ?? []).map((m) => {
                  const mine = m.from === 'staff'
                  return (
                    <div
                      key={m.id}
                      className={cn('flex', mine ? 'justify-end' : 'justify-start')}
                    >
                      <div
                        className={cn(
                          'max-w-[78%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed',
                          mine
                            ? 'bg-brand-500/15 text-[var(--s-text)]'
                            : 'bg-[var(--s-panel-2)] text-[var(--s-text)]',
                        )}
                      >
                        <p className="mb-1 text-[10.5px] font-black uppercase tracking-wide text-muted">
                          {mine
                            ? (lang === 'ar' ? m.authorAr : m.authorEn) || t('mng.support.you')
                            : driverName}
                        </p>
                        <p className="whitespace-pre-wrap break-words">{m.text}</p>
                        <p className="mt-1.5 text-[10.5px] font-semibold text-muted">
                          {formatDateTime(new Date(m.at), {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>

              {error && (
                <p className="border-t border-[var(--s-border)] bg-[#f4634e]/10 px-5 py-2 text-[12px] font-bold text-[#e04b34] dark:text-[#f4634e]">
                  {error}
                </p>
              )}

              <div className="flex items-end gap-2 border-t border-[var(--s-border)] p-3">
                <Input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      send()
                    }
                  }}
                  placeholder={t('mng.support.reply')}
                  className="h-11 flex-1 text-[13px]"
                />
                <Button onClick={send} disabled={sending || !draft.trim()}>
                  <Send size={15} />
                  {sending ? t('mng.support.sending') : t('mng.support.send')}
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>
    </>
  )
}

function ProfileSection({ groups }) {
  const { t, lang, setLang, nf, formatDateTime } = useLang()
  const { theme, setTheme } = useTheme()
  const { user, saveProfile } = useAuth()
  const [notify, setNotify] = useState(true)

  /* حقول الهوية مضبوطة من الحساب، وتُعاد إليه كلّما تغيّر — حفظ ناجح لزميل
     آخر أو تحديث للصفحة يجب ألا يترك مسودّة قديمة في الحقول */
  const [draft, setDraft] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)

  /* كلمة المرور لا تُخلط بالبيانات: نموذجها منفصل، ولا يُرسَل شيء منه إلا
     حين يضغط صاحبه زرّه هو */
  const blankPass = { current: '', next: '', confirm: '' }
  const [pass, setPass] = useState(blankPass)
  const [passState, setPassState] = useState({ busy: false, done: false, error: null })

  useEffect(() => {
    if (!user) return
    setDraft({
      nameAr: user.nameAr ?? '',
      nameEn: user.nameEn ?? '',
      email: user.email ?? '',
      phone: user.phone ?? '',
    })
  }, [user])

  if (!user || !draft) return null

  const nameField = lang === 'ar' ? 'nameAr' : 'nameEn'
  const name = lang === 'ar' ? user.nameAr : user.nameEn
  /* الفرع يأتي من مجموعة الحساب — لا يوجد حقل «فرع» على الحساب نفسه */
  const group = groups.find((g) => g.id === user.groupId)
  const branch = (lang === 'ar' ? group?.nameAr : group?.nameEn) ?? t('common.none')
  const initials = (name ?? '').trim().slice(0, 1)

  const set = (patch) => {
    setDraft((d) => ({ ...d, ...patch }))
    setSaved(false)
    setError(null)
  }

  const submitProfile = async () => {
    setSaving(true)
    setError(null)
    try {
      /* الاسم يُحرَّر بلغة الواجهة وحدها، فيُرسل الآخر كما هو بدل أن يُمحى */
      await saveProfile(draft)
      setSaved(true)
    } catch (err) {
      setError(apiErrorText(err.message, t))
    } finally {
      setSaving(false)
    }
  }

  const submitPassword = async () => {
    if (pass.next !== pass.confirm) {
      return setPassState({ busy: false, done: false, error: t('mng.profile.passMismatch') })
    }
    setPassState({ busy: true, done: false, error: null })
    try {
      await saveProfile({ ...draft, currentPassword: pass.current, newPassword: pass.next })
      setPass(blankPass)
      setPassState({ busy: false, done: true, error: null })
    } catch (err) {
      setPassState({ busy: false, done: false, error: apiErrorText(err.message, t) })
    }
  }

  return (
    <>
      {/* بطاقة الهوية */}
      <Card rail="brand" className="overflow-hidden p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-4">
          <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-brand-500 text-[24px] font-black text-[#04120c] shadow-[0_10px_26px_-12px_rgb(0_207_149/0.9)]">
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[18px] font-extrabold tracking-tight">{name}</h3>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] font-semibold text-muted">
              <span className="inline-flex items-center gap-1.5">
                <Mail size={13} />
                <span dir="ltr">{user.email}</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Building2 size={13} />
                {branch}
              </span>
            </p>
          </div>
          <Badge tone={ROLE_TONE[user.role]} className="shrink-0">{t(`mng.role.${user.role}`)}</Badge>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* المعلومات الشخصية */}
        <Card className="overflow-hidden">
          <CardHeader title={t('mng.profile.info')} icon={UserRound} />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label={t('common.name')} className="sm:col-span-2">
              <Input
                className="h-10 text-[13px]"
                value={draft[nameField]}
                onChange={(e) => set({ [nameField]: e.target.value })}
              />
            </Field>
            <Field label={t('login.user')} className="sm:col-span-2">
              <Input className="h-10 text-[13px]" dir="ltr" defaultValue={user.username} readOnly />
            </Field>
            <Field label={t('contact.email')} className="sm:col-span-2">
              <Input
                className="h-10 text-[13px]"
                type="email"
                dir="ltr"
                value={draft.email}
                onChange={(e) => set({ email: e.target.value })}
              />
            </Field>
            <Field label={t('mng.profile.phone')} className="sm:col-span-2">
              <Input
                className="h-10 text-[13px]"
                dir="ltr"
                placeholder="+9665XXXXXXXX"
                value={draft.phone}
                onChange={(e) => set({ phone: e.target.value })}
              />
            </Field>
            <Field label={t('mng.profile.branch')}>
              <Input className="h-10 text-[13px]" value={branch} readOnly />
            </Field>
            <Field label={t('mng.profile.job')}>
              <Input className="h-10 text-[13px]" value={t(`mng.role.${user.role}`)} readOnly />
            </Field>
            <div className="flex items-center gap-2 text-[12px] font-semibold text-muted sm:col-span-2">
              <CalendarDays size={14} className="shrink-0" />
              {t('mng.profile.joined')}:{' '}
              {user.createdAt ? formatDateTime(new Date(user.createdAt), { dateStyle: 'long' }) : '—'}
            </div>

            {error && (
              <p className="rounded-lg bg-[#f4634e]/12 px-3 py-2 text-[12.5px] font-bold text-[#e04b34] dark:text-[#f4634e] sm:col-span-2">
                {error}
              </p>
            )}
            {saved && !error && (
              <p className="flex items-center gap-1.5 rounded-lg bg-brand-500/12 px-3 py-2 text-[12.5px] font-bold text-brand-600 dark:text-brand-300 sm:col-span-2">
                <Check size={14} />
                {t('mng.profile.saved')}
              </p>
            )}

            <Button className="w-full sm:col-span-2" onClick={submitProfile} disabled={saving}>
              {saving ? t('common.loading') : t('common.save')}
            </Button>
          </div>
        </Card>

        <div className="space-y-6">
          {/* الأمان */}
          <Card className="overflow-hidden">
            <CardHeader title={t('mng.profile.security')} icon={Lock} />
            <div className="grid gap-4 p-5">
              <Field label={t('mng.profile.currentPass')}>
                <Input
                  className="h-10 text-[13px]"
                  type="password"
                  dir="ltr"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={pass.current}
                  onChange={(e) => setPass((p) => ({ ...p, current: e.target.value }))}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('mng.profile.newPass')}>
                  <Input
                    className="h-10 text-[13px]"
                    type="password"
                    dir="ltr"
                    autoComplete="new-password"
                    placeholder="••••••••"
                    value={pass.next}
                    onChange={(e) => setPass((p) => ({ ...p, next: e.target.value }))}
                  />
                </Field>
                <Field label={t('mng.profile.confirmPass')}>
                  <Input
                    className="h-10 text-[13px]"
                    type="password"
                    dir="ltr"
                    autoComplete="new-password"
                    placeholder="••••••••"
                    value={pass.confirm}
                    onChange={(e) => setPass((p) => ({ ...p, confirm: e.target.value }))}
                  />
                </Field>
              </div>

              {passState.error && (
                <p className="rounded-lg bg-[#f4634e]/12 px-3 py-2 text-[12.5px] font-bold text-[#e04b34] dark:text-[#f4634e]">
                  {passState.error}
                </p>
              )}
              {passState.done && (
                <p className="flex items-center gap-1.5 rounded-lg bg-brand-500/12 px-3 py-2 text-[12.5px] font-bold text-brand-600 dark:text-brand-300">
                  <Check size={14} />
                  {t('mng.profile.passChanged')}
                </p>
              )}

              <div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={submitPassword}
                  disabled={passState.busy || !pass.current || !pass.next}
                >
                  <Lock size={15} />
                  {passState.busy ? t('common.loading') : t('mng.profile.changePass')}
                </Button>
              </div>
            </div>
          </Card>

          {/* التفضيلات */}
          <Card className="overflow-hidden">
            <CardHeader title={t('mng.profile.prefs')} icon={Settings2} />
            <div className="divide-y divide-[var(--s-border)]">
              <PrefRow icon={Languages} label={t('mng.profile.lang')}>
                <Segmented
                  value={lang}
                  onChange={setLang}
                  options={[{ value: 'ar', label: 'العربية' }, { value: 'en', label: 'English' }]}
                />
              </PrefRow>
              <PrefRow icon={theme === 'dark' ? Moon : Sun} label={t('mng.profile.theme')}>
                <Segmented
                  value={theme}
                  onChange={setTheme}
                  options={[
                    { value: 'light', label: t('mng.profile.theme.light') },
                    { value: 'dark', label: t('mng.profile.theme.dark') },
                  ]}
                />
              </PrefRow>
              <PrefRow icon={Bell} label={t('mng.profile.notify')} desc={t('mng.profile.notify.desc')}>
                <button
                  type="button"
                  role="switch"
                  aria-checked={notify}
                  onClick={() => setNotify((v) => !v)}
                  className={cn(
                    'relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors',
                    notify ? 'bg-brand-500' : 'bg-[var(--s-border-strong)]',
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 size-5 rounded-full bg-white shadow transition-all',
                      notify ? 'start-[22px]' : 'start-0.5',
                    )}
                  />
                </button>
              </PrefRow>
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}

/** سطر تفضيل واحد داخل بطاقة التفضيلات */
function PrefRow({ icon: Icon, label, desc, children }) {
  return (
    <div className="flex items-center gap-3 px-5 py-3.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--s-panel-2)] text-muted">
        <Icon size={16} strokeWidth={2.3} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-extrabold">{label}</span>
        {desc && <span className="block truncate text-[11px] font-semibold text-muted">{desc}</span>}
      </span>
      {children}
    </div>
  )
}

/** مبدّل خيارين مضغوط */
function Segmented({ value, onChange, options }) {
  return (
    <span className="inline-flex shrink-0 gap-0.5 rounded-xl bg-[var(--s-panel-2)] p-0.5 ring-1 ring-inset ring-[var(--s-border)]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'cursor-pointer rounded-lg px-3 py-1.5 text-[12px] font-extrabold transition-colors',
            value === o.value ? 'bg-brand-500 text-[#04120c]' : 'text-muted hover:text-[var(--s-text)]',
          )}
        >
          {o.label}
        </button>
      ))}
    </span>
  )
}

/** خلية صلاحية — أخضر ممتلئ = مسموح، رمادي باهت = ممنوع */
function PermToggle({ icon: Icon, on, label, onClick, disabled = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={on}
      className={cn(
        'mx-auto grid size-9 place-items-center rounded-xl transition-all',
        disabled ? 'cursor-not-allowed' : 'cursor-pointer',
        on
          ? 'bg-brand-500 text-[#04120c] shadow-[0_6px_16px_-8px_rgb(0_207_149/0.9)]'
          : 'bg-[var(--s-panel-2)] text-muted opacity-60 ring-1 ring-inset ring-[var(--s-border)]',
        !disabled &&
          (on ? 'hover:bg-brand-400' : 'hover:opacity-100 hover:text-[var(--s-text)]'),
      )}
    >
      <Icon size={16} strokeWidth={2.4} />
    </button>
  )
}

/** زر إجراء صغير داخل صفوف الجداول */
function IconButton({ icon: Icon, title, onClick, tone = 'muted', disabled = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={cn(
        'grid size-8 shrink-0 place-items-center rounded-lg text-muted transition-colors',
        disabled
          ? 'cursor-not-allowed opacity-40'
          : cn(
              'cursor-pointer',
              tone === 'red'
                ? 'hover:bg-[#f4634e]/12 hover:text-[#f4634e]'
                : 'hover:bg-brand-500/12 hover:text-brand-500',
            ),
      )}
    >
      <Icon size={14} />
    </button>
  )
}

/**
 * The account form.
 *
 * Unlike the other tabs this one writes to the server, so it is controlled:
 * the parent holds the draft and the Save button in the modal footer submits
 * it. A driver saved here can sign into the mobile app immediately, which is
 * why the password and vehicle fields live on this screen.
 */
function UserForm({ draft, setDraft, vehicles, groups, isNew }) {
  const { t, lang } = useLang()
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }))
  const name = lang === 'ar' ? 'nameAr' : 'nameEn'

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t('common.name')}>
        <Input value={draft[name] ?? ''} onChange={(e) => set({ [name]: e.target.value })} placeholder={t('common.name')} />
      </Field>

      <Field label={t('login.user')}>
        <Input
          dir="ltr"
          value={draft.username ?? ''}
          onChange={(e) => set({ username: e.target.value })}
          placeholder={t('mng.userHint')}
        />
      </Field>

      <Field label={t('contact.email')}>
        <Input
          type="email"
          dir="ltr"
          value={draft.email ?? ''}
          onChange={(e) => set({ email: e.target.value })}
          placeholder={t('contact.emailHint')}
        />
      </Field>

      <Field label={isNew ? t('mng.password') : t('mng.passwordNew')}>
        <Input
          type="password"
          dir="ltr"
          value={draft.password ?? ''}
          onChange={(e) => set({ password: e.target.value })}
          placeholder={isNew ? t('mng.passwordHint') : t('mng.passwordKeep')}
        />
      </Field>

      <Field label={t('mng.role')}>
        {/* «مدير المنصّة» لا يُمنح من هنا، لكنه يبقى معروضًا لمن يحمله بالفعل —
            بدونه يظهر الحقل فارغًا وأول لمسة للقائمة تُنزل رتبته */}
        <Select value={draft.role ?? 'viewer'} onChange={(e) => set({ role: e.target.value })}>
          {(draft.role === 'superadmin'
            ? ['superadmin', 'admin', 'viewer', 'driver']
            : ['admin', 'viewer', 'driver']
          ).map((r) => (
            <option key={r} value={r}>{t(`mng.role.${r}`)}</option>
          ))}
        </Select>
      </Field>

      <Field label={t('mng.group')}>
        <Select value={draft.groupId ?? 1} onChange={(e) => set({ groupId: Number(e.target.value) })}>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{lang === 'ar' ? g.nameAr : g.nameEn}</option>
          ))}
        </Select>
      </Field>

      {/* only a driver drives something — the app reads this to know which
          vehicle the positions it sends belong to */}
      {draft.role === 'driver' && (
        <Field label={t('mng.vehicle')} className="sm:col-span-2">
          <Select value={draft.vehicleId ?? ''} onChange={(e) => set({ vehicleId: e.target.value })}>
            <option value="">{t('common.none')}</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.plate} — {lang === 'ar' ? v.modelAr : v.modelEn}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <Field label={t('common.status')} className="sm:col-span-2">
        <Select value={draft.active === false ? '0' : '1'} onChange={(e) => set({ active: e.target.value === '1' })}>
          <option value="1">{t('common.active')}</option>
          <option value="0">{t('common.inactive')}</option>
        </Select>
      </Field>
    </div>
  )
}

function RowActions({ onEdit, onDelete, locked = false, lockTitle }) {
  const { t } = useLang()
  return (
    <span className="inline-flex gap-1">
      <IconButton
        icon={Pencil}
        title={locked ? lockTitle : t('common.edit')}
        onClick={onEdit}
        disabled={locked}
      />
      <IconButton
        icon={Trash2}
        title={locked ? lockTitle : t('common.delete')}
        tone="red"
        onClick={onDelete}
        disabled={locked}
      />
    </span>
  )
}

