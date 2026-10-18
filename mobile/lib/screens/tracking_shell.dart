import 'package:flutter/material.dart';

import '../i18n.dart';
import '../services/api_client.dart';
import '../services/fleet_store.dart';
import '../services/tracker.dart';
import '../theme.dart';
import '../widgets/fleet_widgets.dart';
import '../widgets/stage_background.dart';
import 'account_tab.dart';
import 'dashboard_tab.dart';
import 'history_tab.dart';
import 'live_map_tab.dart';
import 'vehicles_tab.dart';

/// التطبيق كما يراه من سجّل الدخول: لوحة التحكم، والخريطة، والمركبات، والمسارات، وحسابي.
///
/// شاشات السائق (الوردية وإرسال الموقع) مخفية حاليًا لا محذوفة — ما زالت في
/// `HomeShell`، وإعادتها سطر واحد في main.dart.
class TrackingShell extends StatefulWidget {
  const TrackingShell({
    super.key,
    required this.tracker,
    required this.fleet,
    required this.api,
  });

  final Tracker tracker;
  final FleetStore fleet;
  final ApiClient api;

  @override
  State<TrackingShell> createState() => _TrackingShellState();
}

class _TrackingShellState extends State<TrackingShell> {
  /// يبقى بعد تبديل المظهر، الذي يعيد بناء التطبيق من جديد.
  static int _lastTab = 0;

  int _tab = _lastTab;

  /// مركبة طُلب عرضها على الخريطة من القائمة.
  final _focus = ValueNotifier<int?>(null);

  /// مركبة طُلب فتح مسارها.
  final _history = ValueNotifier<int?>(null);

  @override
  void dispose() {
    _focus.dispose();
    _history.dispose();
    super.dispose();
  }

  void _showOnMap(int vehicleId) {
    setState(() => _tab = _lastTab = 1);
    _focus.value = vehicleId;
  }

  void _showHistory(int vehicleId) {
    setState(() => _tab = _lastTab = 3);
    _history.value = vehicleId;
  }

  @override
  Widget build(BuildContext context) {
    final session = widget.tracker.session!;

    return Scaffold(
      backgroundColor: AppTheme.isDark ? Stage.bg : Palette.bg,
      body: Stack(
        children: [
          /* نفس مسرح شاشة الدخول، أهدأ: خلفية حيّة بلا أن تنافس المحتوى */
          if (AppTheme.isDark) const Positioned.fill(child: StageBackground(intensity: 0.5)),
          SafeArea(
        bottom: false,
        child: Column(
          children: [
            const _TopBar(),
            Expanded(
              child: IndexedStack(
                index: _tab,
                children: [
                  DashboardTab(
                    store: widget.fleet,
                    api: widget.api,
                    token: session.token,
                    onOpenVehicle: (id) => showVehicleSheet(
                      context,
                      store: widget.fleet,
                      vehicleId: id,
                      api: widget.api,
                      token: session.token,
                      onShowOnMap: () => _showOnMap(id),
                      onShowHistory: () => _showHistory(id),
                    ),
                  ),
                  LiveMapTab(
                    store: widget.fleet,
                    api: widget.api,
                    token: session.token,
                    focus: _focus,
                    onShowHistory: _showHistory,
                  ),
                  VehiclesTab(
                    store: widget.fleet,
                    api: widget.api,
                    token: session.token,
                    onShowOnMap: _showOnMap,
                    onShowHistory: _showHistory,
                  ),
                  HistoryTab(
                    store: widget.fleet,
                    api: widget.api,
                    token: session.token,
                    request: _history,
                  ),
                  AccountTab(
                    session: session,
                    onSignOut: () => _confirmSignOut(context),
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
        onChanged: (i) => setState(() => _tab = _lastTab = i),
      ),
    );
  }

  Future<void> _confirmSignOut(BuildContext context) async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: Palette.panel,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text(tr('top.signOut'),
            style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900)),
        content: Text(tr('fleet.signOutConfirm'),
            style: TextStyle(fontSize: 13.5, color: Palette.muted)),
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

class _TopBar extends StatelessWidget {
  const _TopBar();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
      decoration: BoxDecoration(
        color: Palette.bar,
        border: Border(bottom: BorderSide(color: Colors.white.withValues(alpha: 0.06))),
      ),
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
              Text(tr('fleet.subtitle'),
                  style: TextStyle(
                      fontSize: 10.5, fontWeight: FontWeight.w700, color: Palette.muted)),
            ],
          ),
        ],
      ),
    );
  }
}

class _BottomBar extends StatelessWidget {
  const _BottomBar({required this.index, required this.onChanged});

  final int index;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    const items = [
      (Icons.space_dashboard_outlined, Icons.space_dashboard_rounded, 'fleet.tab.dashboard'),
      (Icons.map_outlined, Icons.map_rounded, 'fleet.tab.map'),
      (Icons.local_shipping_outlined, Icons.local_shipping_rounded, 'fleet.tab.vehicles'),
      (Icons.history_rounded, Icons.history_rounded, 'fleet.tab.history'),
      (Icons.person_outline, Icons.person_rounded, 'fleet.tab.account'),
    ];

    return Container(
      decoration: BoxDecoration(
        color: Palette.bar,
        border: Border(top: BorderSide(color: Colors.white.withValues(alpha: 0.06))),
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 58,
          child: Row(
            children: [
              for (var i = 0; i < items.length; i++)
                Expanded(
                  child: InkWell(
                    onTap: () => onChanged(i),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(index == i ? items[i].$2 : items[i].$1,
                            size: 21, color: index == i ? Brand.green : Palette.muted),
                        const SizedBox(height: 3),
                        Text(
                          tr(items[i].$3),
                          style: TextStyle(
                            fontSize: 10.5,
                            fontWeight: index == i ? FontWeight.w900 : FontWeight.w700,
                            color: index == i ? Brand.green : Palette.muted,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
