import 'package:flutter/material.dart';

import '../i18n.dart';
import '../services/api_client.dart';
import '../services/tracker.dart';
import '../theme.dart';

/// «أوامر العمل»: رحلات هذا السائق لليوم والأيام الستة التالية، كما جدولتها
/// الإدارة. رحلة اليوم تُبدأ وتُنهى من هنا؛ بدء الرحلة يبدأ الوردية أيضًا إن
/// لم تكن جارية، فالمركبة تظهر على خريطة الإدارة طوال الرحلة.
class OrdersTab extends StatefulWidget {
  const OrdersTab({super.key, required this.tracker});

  final Tracker tracker;

  @override
  State<OrdersTab> createState() => OrdersTabState();
}

class OrdersTabState extends State<OrdersTab> {
  List<Map<String, dynamic>> _trips = const [];
  Map<int, Map<String, dynamic>> _routes = const {};
  bool _loading = true;
  String? _error;
  String? _busy;

  ApiClient get _api => widget.tracker.api;
  String? get _token => widget.tracker.session?.token;

  @override
  void initState() {
    super.initState();
    refresh();
  }

  Future<void> refresh() async {
    final token = _token;
    if (token == null) return;
    setState(() => _loading = _trips.isEmpty);
    try {
      final results = await Future.wait([_api.trips(token), _api.routes(token)]);
      if (!mounted) return;
      setState(() {
        _trips = results[0];
        _routes = {for (final r in results[1]) (r['id'] as num).toInt(): r};
        _error = null;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _act(Map<String, dynamic> trip, String action) async {
    final token = _token;
    if (token == null) return;
    setState(() => _busy = '${trip['id']}');
    try {
      await _api.tripAction(token, '${trip['id']}', action);
      /* a trip under way is tracked: start the shift if it is not running */
      if (action == 'start' && !widget.tracker.isRunning) await widget.tracker.start();
      await refresh();
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  static String _today() {
    final now = DateTime.now().toUtc().add(const Duration(hours: 3));
    return now.toIso8601String().substring(0, 10);
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());

    final today = _today();
    return RefreshIndicator(
      onRefresh: refresh,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        children: [
          Text(tr('orders.title'), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
          const SizedBox(height: 4),
          Text(tr('orders.subtitle'), style: const TextStyle(fontSize: 12, color: Brand.muted)),
          const SizedBox(height: 14),
          if (_error != null)
            Text(_error!, style: const TextStyle(color: Brand.danger, fontWeight: FontWeight.w700))
          else if (_trips.isEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 40),
              child: Column(
                children: [
                  const Icon(Icons.assignment_outlined, size: 48, color: Brand.muted),
                  const SizedBox(height: 10),
                  Text(tr('orders.none'), textAlign: TextAlign.center, style: const TextStyle(color: Brand.muted)),
                ],
              ),
            )
          else
            for (final t in _trips)
              _TripCard(
                trip: t,
                route: _routes[(t['routeId'] as num?)?.toInt()],
                isToday: t['date'] == today,
                busy: _busy == '${t['id']}',
                onAction: (a) => _act(t, a),
              ),
        ],
      ),
    );
  }
}

class _TripCard extends StatelessWidget {
  const _TripCard({required this.trip, required this.route, required this.isToday, required this.busy, required this.onAction});

  final Map<String, dynamic> trip;
  final Map<String, dynamic>? route;
  final bool isToday;
  final bool busy;
  final ValueChanged<String> onAction;

  static const _tone = {
    'scheduled': Color(0xFF38BDF8),
    'started': Brand.warn,
    'completed': Brand.green,
    'cancelled': Brand.muted,
  };

  @override
  Widget build(BuildContext context) {
    final status = '${trip['status']}';
    final tone = _tone[status] ?? Brand.muted;
    final start = '${trip['plannedStart']}'.split('T').last;
    final end = '${trip['plannedEnd']}'.split('T').last;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Brand.panel,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: isToday && status != 'completed' ? tone.withValues(alpha: 0.5) : Brand.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text('${trip['workOrderName']}',
                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w900)),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(color: tone.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(20)),
                child: Text(tr('orders.status.$status'),
                    style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w900, color: tone)),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text('${tr('orders.type.${trip['type']}')} · ${tr1('orders.execution', trip['execution'])}',
              style: const TextStyle(fontSize: 12, color: Brand.muted)),
          const SizedBox(height: 10),
          _Line(icon: Icons.event_outlined, text: isToday ? tr('orders.today') : '${trip['date']}'),
          _Line(icon: Icons.schedule_rounded, text: tr('orders.window').replaceFirst('{}', start).replaceFirst('{}', end)),
          if (route != null)
            _Line(
              icon: Icons.route_rounded,
              text: '${route!['name']} · ${tr1('orders.km', route!['distanceKm'])} · ${tr1('orders.minutes', route!['durationMin'])}',
            ),
          if (isToday && (status == 'scheduled' || status == 'started')) ...[
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: busy ? null : () => onAction(status == 'scheduled' ? 'start' : 'complete'),
                icon: busy
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                    : Icon(status == 'scheduled' ? Icons.play_arrow_rounded : Icons.flag_rounded),
                label: Text(status == 'scheduled' ? tr('orders.start') : tr('orders.complete')),
                style: FilledButton.styleFrom(
                  backgroundColor: status == 'scheduled' ? Brand.green : Brand.warn,
                  foregroundColor: Brand.onGreen,
                  minimumSize: const Size.fromHeight(46),
                  textStyle: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w900),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _Line extends StatelessWidget {
  const _Line({required this.icon, required this.text, this.ltr = false});

  final IconData icon;
  final String text;
  final bool ltr;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Row(
        children: [
          Icon(icon, size: 16, color: Brand.muted),
          const SizedBox(width: 8),
          Expanded(
            child: Text(text,
                textDirection: ltr ? TextDirection.ltr : null,
                textAlign: ltr && AppLocale.isArabic ? TextAlign.right : null,
                style: const TextStyle(fontSize: 13)),
          ),
        ],
      ),
    );
  }
}
