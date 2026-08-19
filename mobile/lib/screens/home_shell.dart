import 'package:flutter/material.dart';

import '../i18n.dart';
import '../services/alerts_store.dart';
import '../services/shifts_store.dart';
import '../services/support_store.dart';
import '../services/tracker.dart';
import '../theme.dart';
import '../widgets/stage_background.dart';
import 'profile_tab.dart';
import 'shift_screen.dart';
import 'shifts_tab.dart';

/// الغلاف: الشريط العلوي، التبويبات الثلاثة، وشريط التنقّل السفلي.
///
/// التبويبات في [IndexedStack] لا في `switch`، فحالة كل تبويب تبقى حيّة حين
/// يغادره السائق: نبضة زرّ الوردية لا تُعاد من الصفر، وموضع قائمة الورديات لا
/// يقفز إلى أعلاها لأنه ذهب ليطمئنّ على شيء في الرئيسية.
class HomeShell extends StatefulWidget {
  const HomeShell({
    super.key,
    required this.tracker,
    required this.alerts,
    required this.shifts,
    required this.support,
  });

  final Tracker tracker;
  final AlertsStore alerts;
  final ShiftsStore shifts;
  final SupportStore support;

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final running = widget.tracker.isRunning;
    final session = widget.tracker.session!;

    /* الخروج ممنوع أثناء الوردية أينما ظهر زرّه — في الشريط أو في الملف
       الشخصي — فالقاعدة تُحسب مرة واحدة هنا بدل أن تتكرّر في الاثنين */
    final onSignOut = running ? null : () => _confirmSignOut(context);

    return Scaffold(
      backgroundColor: Stage.bg,
      body: Stack(
        children: [
          const Positioned.fill(child: StageBackground(intensity: 0.55)),
          SafeArea(
            bottom: false,
            child: Column(
              children: [
                /* الشارة تتغيّر مع صندوق التنبيهات، فيُبنى الشريط وحده */
                AnimatedBuilder(
                  animation: widget.alerts,
                  builder: (context, _) => _TopBar(alerts: widget.alerts),
                ),
                Expanded(
                  child: IndexedStack(
                    index: _tab,
                    children: [
                      ShiftScreen(tracker: widget.tracker),
                      ShiftsTab(store: widget.shifts),
                      ProfileTab(
                        session: session,
                        support: widget.support,
                        onSignOut: onSignOut,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
      bottomNavigationBar: _BottomBar(
        index: _tab,
        onChanged: (i) {
          setState(() => _tab = i);
          /* الورديات تُحدَّث عند دخول تبويبها لا دوريًّا: الوردية الجارية
             عدّادها يتقدّم، والسائق يفتح التبويب ليرى رقمًا الآن */
          if (i == 1) widget.shifts.refresh();
        },
      ),
    );
  }

  Future<void> _confirmSignOut(BuildContext context) async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: Brand.panel,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text(tr('top.signOut'),
            style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900)),
        content: Text(tr('shift.signOutConfirm'),
            style: const TextStyle(fontSize: 13.5, color: Brand.muted)),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false), child: Text(tr('shift.cancel'))),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(tr('top.signOut'), style: const TextStyle(color: Brand.danger)),
          ),
        ],
      ),
    );
    if (yes ?? false) await widget.tracker.signOut();
  }
}

class _BottomBar extends StatelessWidget {
  const _BottomBar({required this.index, required this.onChanged});

  final int index;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    const items = [
      (Icons.home_outlined, Icons.home_rounded, 'tab.home'),
      (Icons.event_note_outlined, Icons.event_note_rounded, 'tab.shifts'),
      (Icons.person_outline, Icons.person_rounded, 'tab.profile'),
    ];

    return Container(
      decoration: BoxDecoration(
        color: Brand.panel.withValues(alpha: 0.96),
        border: Border(top: BorderSide(color: Brand.border.withValues(alpha: 0.7))),
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 58,
          child: Row(
            children: [
              for (var i = 0; i < items.length; i++)
                Expanded(
                  child: _Tab(
                    icon: index == i ? items[i].$2 : items[i].$1,
                    label: tr(items[i].$3),
                    selected: index == i,
                    onTap: () => onChanged(i),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Tab extends StatelessWidget {
  const _Tab({
    required this.icon,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final tone = selected ? Brand.green : Brand.muted;

    return InkWell(
      onTap: onTap,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, size: 21, color: tone),
          const SizedBox(height: 3),
          Text(
            label,
            style: TextStyle(
              fontSize: 10.5,
              fontWeight: selected ? FontWeight.w900 : FontWeight.w700,
              color: tone,
            ),
          ),
        ],
      ),
    );
  }
}

/// الشريط العلوي: الهوية والجرس، ولا شيء غيرهما.
///
/// اللغة والخروج انتقلا إلى الملف الشخصي. الإعداد الذي يُضبط مرة كل أشهر لا
/// يستحق مكانًا دائمًا في أعلى كل شاشة، والجرس يستحقه لأنه يتغيّر وحده وينتظر
/// أن يُرى. تكرار الزرّ في المكانين كان يشغل الشريط بما لا يُضغط.
class _TopBar extends StatelessWidget {
  const _TopBar({required this.alerts});

  /// صندوق التنبيهات — يُبنى الشريط من جديد كلّما تغيّر العدّاد.
  final AlertsStore alerts;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      child: Row(
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Brand.green, Color(0xFF00A87C)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(11),
              boxShadow: [
                BoxShadow(
                    color: Brand.green.withValues(alpha: 0.35),
                    blurRadius: 14,
                    offset: const Offset(0, 5)),
              ],
            ),
            child: const Icon(Icons.location_on, size: 18, color: Brand.onGreen),
          ),
          const SizedBox(width: 10),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(tr('app.title'),
                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w900)),
              Text(tr('app.subtitle'),
                  style: const TextStyle(
                      fontSize: 10.5, fontWeight: FontWeight.w700, color: Brand.muted)),
            ],
          ),
          const Spacer(),

          /* الجرس: الشارة تحمل الرقم لا نقطة صمّاء — «ثلاثة تنبيهات» قرار،
             و«يوجد شيء» فضول */
          _BarButton(
            onPressed: () => _openAlerts(context, alerts),
            tooltip: tr('top.notifications'),
            badge: alerts.unread,
            child: const Icon(Icons.notifications_none_rounded, size: 19, color: Brand.muted),
          ),
        ],
      ),
    );
  }
}

/// زرّ في الشريط العلوي، بشارة اختيارية فوقه.
class _BarButton extends StatelessWidget {
  const _BarButton({
    required this.child,
    required this.tooltip,
    this.onPressed,
    this.badge = 0,
  });

  final Widget child;
  final String tooltip;
  final VoidCallback? onPressed;
  final int badge;

  @override
  Widget build(BuildContext context) {
    final button = Tooltip(
      message: tooltip,
      child: InkWell(
        onTap: onPressed,
        borderRadius: BorderRadius.circular(11),
        child: Container(
          width: 38,
          height: 38,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.04),
            borderRadius: BorderRadius.circular(11),
          ),
          child: child,
        ),
      ),
    );

    if (badge <= 0) return button;

    return Stack(
      clipBehavior: Clip.none,
      children: [
        button,
        /* الشارة على جهة البداية: في العربية يبدأ السطر يمينًا، وتثبيتها
           يسارًا دائمًا يضعها في زاوية لا تقع عليها العين أولًا */
        PositionedDirectional(
          top: -3,
          start: -3,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1.5),
            constraints: const BoxConstraints(minWidth: 18),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: Brand.danger,
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: Stage.bg, width: 1.5),
            ),
            child: Text(
              badge > 99 ? '99+' : '$badge',
              textDirection: TextDirection.ltr,
              style: const TextStyle(
                fontSize: 10,
                height: 1.1,
                fontWeight: FontWeight.w900,
                color: Colors.white,
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// يفتح صندوق التنبيهات، ويسأل السيرفر عند الفتح.
///
/// السؤال هنا مقصود رغم السؤال الدوري: السائق يفتح الجرس لأنه يريد أن يعرف
/// **الآن**، وعرض صندوق عمره دقيقة على من يبحث عن جديد هو أسوأ ما يمكن.
void _openAlerts(BuildContext context, AlertsStore store) {
  store.refresh();
  store.markAllRead();

  showModalBottomSheet<void>(
    context: context,
    backgroundColor: Brand.panel,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
    ),
    builder: (context) => AnimatedBuilder(
      animation: store,
      builder: (context, _) => _AlertsSheet(store: store),
    ),
  );
}

class _AlertsSheet extends StatelessWidget {
  const _AlertsSheet({required this.store});

  final AlertsStore store;

  @override
  Widget build(BuildContext context) {
    final alerts = store.alerts;

    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.7),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 12, 10),
              child: Row(
                children: [
                  const Icon(Icons.notifications_none_rounded, size: 19, color: Brand.green),
                  const SizedBox(width: 9),
                  Text(tr('alerts.title'),
                      style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w900)),
                  const Spacer(),
                  IconButton(
                    onPressed: () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.close, size: 19, color: Brand.muted),
                  ),
                ],
              ),
            ),

            /* تعذّر التحديث لا يخفي ما وصل سابقًا — يُقال فوقه وحسب */
            if (store.offline)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
                color: Brand.danger.withValues(alpha: 0.10),
                child: Text(
                  tr('alerts.offline'),
                  style: const TextStyle(
                      fontSize: 11.5, fontWeight: FontWeight.w700, color: Brand.danger),
                ),
              ),

            if (alerts.isEmpty)
              Padding(
                padding: const EdgeInsets.fromLTRB(24, 18, 24, 40),
                child: Column(
                  children: [
                    const Icon(Icons.check_circle_outline, size: 34, color: Brand.muted),
                    const SizedBox(height: 12),
                    Text(tr('alerts.empty'),
                        textAlign: TextAlign.center,
                        style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 6),
                    Text(
                      tr('alerts.emptyHint'),
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                          fontSize: 11.5, height: 1.5, color: Brand.muted),
                    ),
                  ],
                ),
              )
            else
              Flexible(
                child: ListView.separated(
                  shrinkWrap: true,
                  padding: const EdgeInsets.fromLTRB(14, 4, 14, 18),
                  itemCount: alerts.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 8),
                  itemBuilder: (context, i) => _AlertTile(alert: alerts[i]),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _AlertTile extends StatelessWidget {
  const _AlertTile({required this.alert});

  final DriverAlert alert;

  /// اللون يقول درجة الإلحاح قبل أن يُقرأ النصّ.
  Color get _tone => switch (alert.severity) {
        'high' => Brand.danger,
        'medium' => Brand.warn,
        _ => Brand.green,
      };

  IconData get _icon => switch (alert.type) {
        'speed' => Icons.speed_rounded,
        'geofenceIn' => Icons.login_rounded,
        'geofenceOut' => Icons.logout_rounded,
        'ignitionOn' => Icons.play_circle_outline,
        'ignitionOff' => Icons.pause_circle_outline,
        'idle' => Icons.hourglass_empty_rounded,
        'lowBattery' => Icons.battery_alert_rounded,
        'power' => Icons.power_off_rounded,
        'sos' => Icons.sos_rounded,
        'maintenance' => Icons.build_outlined,
        _ => Icons.info_outline,
      };

  /// «منذ ١٢ دقيقة» أوضح من طابع زمني كامل: السائق يريد أن يعرف إن كان هذا
  /// حدث الآن أم صباحًا، لا الساعة بالثانية.
  String get _ago {
    final gap = DateTime.now().difference(alert.at);
    if (gap.inMinutes < 1) return tr('time.now');
    if (gap.inMinutes < 60) return tr1('time.minutes', gap.inMinutes);
    if (gap.inHours < 24) return tr1('time.hours', gap.inHours);
    return tr1('time.days', gap.inDays);
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.035),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: _tone.withValues(alpha: 0.22)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 32,
            height: 32,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: _tone.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(_icon, size: 17, color: _tone),
          ),
          const SizedBox(width: 11),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  tr('alert.${alert.type}'),
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800),
                ),
                if (alert.detail != null && alert.detail!.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    alert.detail!,
                    style: const TextStyle(fontSize: 11.5, color: Brand.muted),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(_ago, style: const TextStyle(fontSize: 10.5, color: Brand.muted)),
        ],
      ),
    );
  }
}
