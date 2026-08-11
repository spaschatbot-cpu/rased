import { useMemo, useState } from 'react'
import {
  Bell, Gauge, PlugZap, Siren, LogIn, LogOut, KeyRound, Timer, BatteryLow,
  Wrench, Plus, Trash2, CheckCheck, Mail, AlertTriangle, Send, User,
} from 'lucide-react'
import { useLang } from '../../context/LanguageContext'
import { useFleet } from '../../context/FleetContext'
import {
  Card, CardHeader, EmptyState, Table, Td, Badge, Button, Switch, Modal, Field, Select, Input, Segmented, Checkbox, cn,
} from '../../components/ui'
import { PageHeader } from '../../layouts/AppLayout'

/* shared with the dashboard's "recent alerts" list */
export const ALERT_ICON = {
  speed: Gauge,
  power: PlugZap,
  sos: Siren,
  geofenceIn: LogIn,
  geofenceOut: LogOut,
  ignitionOn: KeyRound,
  ignitionOff: KeyRound,
  idle: Timer,
  lowBattery: BatteryLow,
  maintenance: Wrench,
}

export const ALERT_TONE = {
  high: 'bg-[#f4634e]/14 text-[#e04b34] dark:text-[#f4634e]',
  medium: 'bg-[#f5b301]/14 text-[#c58f00] dark:text-[#f5b301]',
  low: 'bg-accent-500/12 text-accent-500',
}

const SEV_BADGE = { high: 'red', medium: 'amber', low: 'sky' }

const ALERT_TYPES = [
  'speed', 'power', 'sos', 'geofenceIn', 'geofenceOut',
  'ignitionOn', 'ignitionOff', 'idle', 'lowBattery', 'maintenance',
]

const MINI_TONE = {
  brand: 'bg-brand-500/12 text-brand-600 dark:text-brand-400',
  sky: 'bg-sky-500/12 text-sky-600 dark:text-sky-400',
  amber: 'bg-amber-500/15 text-amber-600 dark:text-amber-500',
  red: 'bg-[#f4634e]/14 text-[#e04b34] dark:text-[#f4634e]',
}

/** بطاقة إحصاء أفقية منخفضة الارتفاع */
function MiniStat({ icon: Icon, label, value, note, tone = 'brand' }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[var(--s-border)] bg-[var(--s-panel)] px-4 py-3 shadow-[var(--s-e1)] transition-colors hover:border-[var(--s-border-strong)]">
      <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg', MINI_TONE[tone])}>
        <Icon size={17} strokeWidth={2.5} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12.5px] font-extrabold text-[var(--s-text)]">{label}</p>
        <p className="mt-0.5 flex items-baseline gap-2 leading-none">
          <span className="text-[22px] font-black tabular-nums text-[var(--s-text)]">{value}</span>
          {note && <span className="truncate text-[11.5px] font-bold text-[var(--s-text-muted)]">{note}</span>}
        </p>
      </div>
    </div>
  )
}

export default function Alerts() {
  const { t, lang, nf, formatDateTime } = useLang()
  const {
    vehicles, alertRules, addRule, updateRule, removeRule,
    inbox, unreadCount, markRead, markAllRead, sendAlert,
  } = useFleet()

  const [tab, setTab] = useState('rules')
  const [modalOpen, setModalOpen] = useState(false)
  const [draft, setDraft] = useState(newDraft())

  /* sending one by hand — a separate dialog from the rule builder, because
     they answer different questions: a rule is "watch for this from now on",
     a sent alert is "tell this driver now" */
  const [sendOpen, setSendOpen] = useState(false)
  const [note, setNote] = useState(newNote())
  const [sendError, setSendError] = useState(null)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(null)
  /* rules live on the server now, so saving one can fail — say why rather than
     closing the dialog on a write that never landed */
  const [ruleError, setRuleError] = useState(null)
  const [saving, setSaving] = useState(false)

  const vehicleById = useMemo(() => new Map(vehicles.map((v) => [v.id, v])), [vehicles])

  const activeRules = alertRules.filter((r) => r.active).length
  const highAlerts = inbox.filter((a) => a.severity === 'high').length

  /** وحدة الحد حسب نوع القاعدة */
  const thresholdUnit = (type) => {
    if (type === 'speed') return t('common.kmh')
    if (type === 'idle') return lang === 'ar' ? 'دقيقة' : 'min'
    if (type === 'lowBattery') return 'V'
    return ''
  }

  const submitRule = async (e) => {
    e.preventDefault()
    setSaving(true)
    setRuleError(null)
    try {
      await addRule({
        type: draft.type,
        threshold: draft.threshold === '' ? null : Number(draft.threshold),
        channels: draft.channels,
        severity: draft.severity,
        vehicles: draft.allVehicles ? 'all' : draft.vehicles,
        active: true,
      })
      setDraft(newDraft())
      setModalOpen(false)
      setTab('rules')
    } catch (err) {
      setRuleError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const submitNote = async (e) => {
    e.preventDefault()
    setSending(true)
    setSendError(null)
    try {
      const vehicle = vehicles.find((v) => v.id === Number(note.vehicleId))
      await sendAlert({
        vehicleId: Number(note.vehicleId),
        type: note.type,
        severity: note.severity,
        detail: note.detail.trim(),
      })
      setSendOpen(false)
      setNote(newNote(vehicles))
      setTab('inbox')
      /* name the driver it went to: "sent" on its own does not say to whom, and
         picking the wrong vehicle is the mistake worth catching here */
      setSent(vehicle ? (lang === 'ar' ? vehicle.driverAr : vehicle.driverEn) : '')
      setTimeout(() => setSent(null), 6000)
    } catch (err) {
      setSendError(err.message)
    } finally {
      setSending(false)
    }
  }

  const toggleRule = (id, active) =>
    updateRule(id, { active }).catch((err) => setRuleError(err.message))

  const dropRule = (id) => removeRule(id).catch((err) => setRuleError(err.message))

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-4 sm:p-6">
      <PageHeader
        icon={Bell}
        tone="red"
        eyebrow={t('cc.title')}
        title={t('alert.title')}
        subtitle={t('alert.subtitle')}
        actions={
          <>
            <Segmented
              value={tab}
              onChange={setTab}
              options={[
                { value: 'rules', label: `${t('alert.myRules')} (${nf(alertRules.length)})` },
                { value: 'inbox', label: `${t('alert.inbox')} (${nf(unreadCount)})` },
              ]}
            />
            <Button
              size="sm"
              onClick={() => {
                setNote(newNote(vehicles))
                setSendError(null)
                setSendOpen(true)
              }}
              className="bg-linear-to-br from-[#f4634e] to-[#d93a22] text-white hover:from-[#f87a67] hover:to-[#e04b34]"
            >
              <Send size={15} />
              {lang === 'ar' ? 'إرسال تنبيه لسائق' : 'Send to a driver'}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setModalOpen(true)}>
              <Plus size={15} />
              {t('alert.newRule')}
            </Button>
          </>
        }
      />

      {sent !== null && (
        <div className="flex items-center gap-2.5 rounded-xl border border-brand-500/30 bg-brand-500/10 px-4 py-3 text-[13px] font-extrabold text-brand-600 dark:text-brand-400">
          <CheckCheck size={17} />
          {lang === 'ar'
            ? `تم الإرسال — سيظهر على هاتف ${sent} خلال أقل من دقيقة.`
            : `Sent — it reaches ${sent}'s phone within a minute.`}
        </div>
      )}

      {/* summary */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MiniStat icon={Bell} tone="brand" label={t('alert.myRules')} value={nf(alertRules.length)} />
        <MiniStat
          icon={CheckCheck}
          tone="sky"
          label={lang === 'ar' ? 'قواعد نشطة' : 'Active rules'}
          value={nf(activeRules)}
          note={`${nf(alertRules.length - activeRules)} ${lang === 'ar' ? 'متوقفة' : 'paused'}`}
        />
        <MiniStat
          icon={Mail}
          tone="amber"
          label={t('alert.unread')}
          value={nf(unreadCount)}
          note={`${nf(inbox.length)} ${lang === 'ar' ? 'إجمالي' : 'total'}`}
        />
        <MiniStat
          icon={AlertTriangle}
          tone="red"
          label={lang === 'ar' ? 'أهمية عالية' : 'High severity'}
          value={nf(highAlerts)}
        />
      </div>

      {tab === 'rules' ? (
        <Card className="overflow-hidden border-[var(--s-border-strong)] shadow-[var(--s-e2)]">
          <CardHeader
            title={t('alert.myRules')}
            subtitle={t('alert.rulesDesc')}
            icon={Bell}
            tone="red"
            action={
              <span className="rounded-xl border border-[var(--s-border)] bg-[var(--s-panel-2)] px-3 py-1.5 text-[12px] font-bold text-muted">
                <span className="tabular-nums text-[var(--s-text)]">{nf(activeRules)}</span> / {nf(alertRules.length)}{' '}
                {lang === 'ar' ? 'نشطة' : 'active'}
              </span>
            }
          />
          <Table
            columns={[
              { key: 'id', label: '#' },
              { key: 'type', label: t('common.name') },
              { key: 'th', label: t('alert.threshold') },
              { key: 'sev', label: t('alert.severity') },
              { key: 'dev', label: t('alert.devices') },
              { key: 'at', label: lang === 'ar' ? 'تاريخ الإنشاء' : 'Created' },
              { key: 'act', label: t('common.active'), className: 'text-center' },
              { key: 'a', label: t('common.actions'), className: 'text-end' },
            ]}
            rows={alertRules}
            empty={t('alert.noRules')}
            renderRow={(r) => {
              const Icon = ALERT_ICON[r.type] ?? AlertTriangle
              return (
                <>
                  <Td className="tabular-nums text-[12px] font-bold text-muted">{r.id}</Td>
                  <Td>
                    <span className={cn('flex items-center gap-2.5', !r.active && 'opacity-55')}>
                      <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl', ALERT_TONE[r.severity])}>
                        <Icon size={16} />
                      </span>
                      <span className="text-[13.5px] font-extrabold">{t(`alert.t.${r.type}`)}</span>
                    </span>
                  </Td>
                  <Td>
                    {r.threshold == null ? (
                      <span className="text-muted">—</span>
                    ) : (
                      <span className="font-black tabular-nums">
                        {nf(r.threshold)}
                        <span className="ms-1 text-[11px] font-bold text-muted">{thresholdUnit(r.type)}</span>
                      </span>
                    )}
                  </Td>
                  <Td>
                    <Badge tone={SEV_BADGE[r.severity]}>{t(`alert.sev.${r.severity}`)}</Badge>
                  </Td>
                  <Td className="text-[12.5px] font-bold text-muted">
                    {r.vehicles === 'all'
                      ? t('common.all')
                      : `${nf(r.vehicles.length)} ${t('common.vehicles')}`}
                  </Td>
                  {/* when this rule was set up — a fleet with several managers
                      needs to see which rule is the one that was just added */}
                  <Td className="text-[12.5px] font-bold tabular-nums text-muted">
                    {r.createdAt ? formatDateTime(r.createdAt) : <span className="text-muted">—</span>}
                  </Td>
                  <Td className="text-center">
                    <Switch checked={r.active} onChange={(v) => toggleRule(r.id, v)} label={t('common.active')} />
                  </Td>
                  <Td className="text-end">
                    <button
                      onClick={() => dropRule(r.id)}
                      aria-label={t('common.delete')}
                      className="inline-grid size-9 cursor-pointer place-items-center rounded-lg border border-[var(--s-border)] text-muted transition-colors hover:border-[#f4634e]/40 hover:bg-[#f4634e]/12 hover:text-[#f4634e]"
                    >
                      <Trash2 size={15} />
                    </button>
                  </Td>
                </>
              )
            }}
          />
        </Card>
      ) : (
        <Card className="overflow-hidden border-[var(--s-border-strong)] shadow-[var(--s-e2)]">
          <CardHeader
            title={t('alert.inbox')}
            subtitle={`${nf(unreadCount)} ${t('alert.unread')} • ${nf(inbox.length)} ${lang === 'ar' ? 'إجمالي' : 'total'}`}
            icon={Bell}
            tone="red"
            action={
              <Button variant="secondary" size="sm" onClick={markAllRead} disabled={unreadCount === 0}>
                <CheckCheck size={15} />
                {t('alert.markAllRead')}
              </Button>
            }
          />
          {inbox.length === 0 ? (
            <EmptyState icon={Bell} tone="red" title={t('alert.noInbox')} />
          ) : (
            <ul className="divide-y">
              {inbox.map((a) => {
                const v = vehicleById.get(a.vehicleId)
                const Icon = ALERT_ICON[a.type] ?? AlertTriangle
                return (
                  <li
                    key={a.id}
                    className={cn(
                      'flex items-center gap-4 border-s-[3px] px-4 py-4 transition-colors hover:bg-[var(--s-panel-2)]/60',
                      a.read ? 'border-s-transparent' : 'border-s-brand-500 bg-brand-500/5',
                    )}
                  >
                    <span className={cn('grid size-11 shrink-0 place-items-center rounded-xl', ALERT_TONE[a.severity])}>
                      <Icon size={19} />
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="text-[14px] font-black">{t(`alert.t.${a.type}`)}</span>
                        <Badge tone={SEV_BADGE[a.severity]}>{t(`alert.sev.${a.severity}`)}</Badge>
                        {!a.read && (
                          <span className="rounded-full bg-brand-500/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-brand-600 dark:text-brand-400">
                            {lang === 'ar' ? 'جديد' : 'New'}
                          </span>
                        )}
                        {/* a person decided this one, not a sensor — and who,
                            so a driver's "who told me to turn back?" has an answer */}
                        {a.manual && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--s-panel-2)] px-2 py-0.5 text-[10px] font-black text-muted">
                            <User size={10} />
                            {lang === 'ar' ? 'أُرسل يدويًا' : 'Sent by hand'}
                            {a.sentBy && ` — ${lang === 'ar' ? a.sentBy.nameAr : a.sentBy.nameEn}`}
                          </span>
                        )}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 truncate text-[12px] font-bold text-muted">
                        <bdi
                          dir="ltr"
                          className="rounded-md border border-[var(--s-border)] bg-[var(--s-panel-2)] px-1.5 py-px tabular-nums text-[var(--s-text)]"
                        >
                          {v?.plate ?? '—'}
                        </bdi>
                        <span>{v ? (lang === 'ar' ? v.driverAr : v.driverEn) : ''}</span>
                        {a.detail && (
                          <>
                            <span className="text-[var(--s-border-strong)]">•</span>
                            <span>{a.detail}</span>
                          </>
                        )}
                      </p>
                    </div>

                    <span className="hidden shrink-0 tabular-nums text-[12px] font-bold text-muted sm:block">
                      {formatDateTime(a.at)}
                    </span>

                    {!a.read && (
                      <button
                        onClick={() => markRead(a.id)}
                        title={t('alert.markRead')}
                        className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg text-muted transition-colors hover:bg-brand-500/12 hover:text-brand-500"
                      >
                        <CheckCheck size={16} />
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      )}

      {/* send one by hand */}
      <Modal
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        title={lang === 'ar' ? 'إرسال تنبيه لسائق' : 'Send an alert to a driver'}
        /* nudged clear of the page header — dead centre puts the dialog's own
           title right under the site's, and the two read as one stacked bar */
        offsetY={32}
        footer={
          <>
            <Button variant="ghost" onClick={() => setSendOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" form="send-alert-form" disabled={sending || !note.vehicleId}>
              <Send size={15} />
              {sending ? t('common.loading') : lang === 'ar' ? 'إرسال الآن' : 'Send now'}
            </Button>
          </>
        }
      >
        {/* kept short on purpose: four controls and the preview fit without
            scrolling, so sending is one glance rather than a scroll and a hunt
            for the button */}
        <form id="send-alert-form" onSubmit={submitNote} className="space-y-3">
          {sendError && (
            <p className="rounded-lg bg-[#f4634e]/12 px-3 py-2 text-[12.5px] font-bold text-[#e04b34] dark:text-[#f4634e]">
              {sendError}
            </p>
          )}

          <Field label={lang === 'ar' ? 'السائق' : 'Driver'}>
            <Select value={note.vehicleId} onChange={(e) => setNote({ ...note, vehicleId: e.target.value })}>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {(lang === 'ar' ? v.driverAr : v.driverEn) || v.plate} — {v.plate}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('common.type')}>
              <Select value={note.type} onChange={(e) => setNote({ ...note, type: e.target.value })}>
                {ALERT_TYPES.map((ty) => (
                  <option key={ty} value={ty}>
                    {t(`alert.t.${ty}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('alert.severity')}>
              <Select value={note.severity} onChange={(e) => setNote({ ...note, severity: e.target.value })}>
                {['high', 'medium', 'low'].map((s) => (
                  <option key={s} value={s}>
                    {t(`alert.sev.${s}`)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label={lang === 'ar' ? 'الرسالة' : 'Message'}>
            <Input
              value={note.detail}
              maxLength={200}
              onChange={(e) => setNote({ ...note, detail: e.target.value })}
              placeholder={lang === 'ar' ? 'مثال: راجع الورشة قبل نهاية اليوم' : 'e.g. Return to the depot'}
            />
          </Field>

          {/* exactly what will land on the phone, so nobody has to send one to
              find out how it reads */}
          <div>
            <p className="mb-1.5 text-[11px] font-black text-muted">
              {lang === 'ar' ? 'كما سيظهر على هاتف السائق' : 'As it appears on the phone'}
            </p>
            <div className="flex items-center gap-2.5 rounded-xl border border-[var(--s-border-strong)] bg-[var(--s-panel-2)] px-3 py-2.5">
              <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', ALERT_TONE[note.severity])}>
                {(() => {
                  const Icon = ALERT_ICON[note.type] ?? AlertTriangle
                  return <Icon size={16} />
                })()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-black leading-tight">{t(`alert.t.${note.type}`)}</p>
                <p className="mt-0.5 truncate text-[11.5px] font-bold leading-tight text-muted">
                  {note.detail.trim() || (lang === 'ar' ? '— بدون رسالة —' : '— no message —')}
                </p>
              </div>
              <span className="shrink-0 text-[10.5px] font-bold text-muted">
                {lang === 'ar' ? 'الآن' : 'now'}
              </span>
            </div>
          </div>
        </form>
      </Modal>

      {/* new rule modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={t('alert.newRule')}
        offsetY={60}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" form="alert-rule-form" disabled={saving}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <form id="alert-rule-form" onSubmit={submitRule} className="space-y-4">
          {ruleError && (
            <p className="rounded-lg bg-[#f4634e]/12 px-3 py-2 text-[12.5px] font-bold text-[#e04b34] dark:text-[#f4634e]">
              {ruleError}
            </p>
          )}
          <Field label={t('common.type')}>
            <Select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}>
              {ALERT_TYPES.map((ty) => (
                <option key={ty} value={ty}>
                  {t(`alert.t.${ty}`)}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('alert.threshold')} hint={draft.type === 'speed' ? t('common.kmh') : undefined}>
              <Input
                type="number"
                min="0"
                value={draft.threshold}
                onChange={(e) => setDraft({ ...draft, threshold: e.target.value })}
                placeholder="—"
              />
            </Field>
            <Field label={t('alert.severity')}>
              <Select value={draft.severity} onChange={(e) => setDraft({ ...draft, severity: e.target.value })}>
                {['high', 'medium', 'low'].map((s) => (
                  <option key={s} value={s}>
                    {t(`alert.sev.${s}`)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div>
            <p className="mb-2 text-[12.5px] font-extrabold text-[var(--s-text)]">{t('alert.devices')}</p>
            <Checkbox
              checked={draft.allVehicles}
              onChange={(v) => setDraft({ ...draft, allVehicles: v })}
              label={t('common.all')}
            />
            {!draft.allVehicles && (
              <div className="mt-3 grid max-h-40 gap-2 overflow-y-auto rounded-xl border p-3 sm:grid-cols-2">
                {vehicles.map((v) => (
                  <Checkbox
                    key={v.id}
                    checked={draft.vehicles.includes(v.id)}
                    onChange={(on) =>
                      setDraft({
                        ...draft,
                        vehicles: on ? [...draft.vehicles, v.id] : draft.vehicles.filter((x) => x !== v.id),
                      })
                    }
                    label={v.plate}
                  />
                ))}
              </div>
            )}
          </div>
        </form>
      </Modal>
    </div>
  )
}

function newDraft() {
  return { type: 'speed', threshold: '120', severity: 'high', channels: ['web', 'push'], allVehicles: true, vehicles: [] }
}

/** A blank hand-sent alert, aimed at the first vehicle in the registry. */
function newNote(vehicles = []) {
  return { vehicleId: vehicles[0]?.id ?? '', type: 'maintenance', severity: 'medium', detail: '' }
}
