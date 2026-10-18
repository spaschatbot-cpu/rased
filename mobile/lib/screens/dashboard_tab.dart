import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../i18n.dart';
import '../services/api_client.dart';
import '../services/fleet_store.dart';
import '../theme.dart';
import '../widgets/fleet_widgets.dart';

String _two(int n) => n.toString().padLeft(2, '0');
String _iso(DateTime d) => '${d.year}-${_two(d.month)}-${_two(d.day)}';

/// اليوم بتوقيت السعودية — كما يقسم السيرفر الأيام.
DateTime _today() {
  final r = DateTime.now().toUtc().add(const Duration(hours: 3));
  return DateTime(r.year, r.month, r.day);
}

String _hours(num minutes) {
  final m = minutes.round();
  if (m < 60) return '$m ${tr('hist.min')}';
  return '${m ~/ 60} ${tr('hist.h')} ${m % 60} ${tr('hist.min')}';
}

/// لون الدرجة ووصفها — نفس العتبات في البطاقة والأعمدة اليومية.
(Color, String) _grade(int? score) {
  if (score == null) return (Palette.muted, tr('dash.noData'));
  if (score >= 85) return (Brand.green, tr('dash.grade.excellent'));
  if (score >= 70) return (const Color(0xFF38BDF8), tr('dash.grade.good'));
  if (score >= 50) return (const Color(0xFFF59E0B), tr('dash.grade.fair'));
  return (Brand.danger, tr('dash.grade.poor'));
}

/// لوحة التحكم: مؤشرات الفترة، ثم ثلاثة أقسام — نظرة عامة، الأحداث، الأسطول.
class DashboardTab extends StatefulWidget {
  const DashboardTab({
    super.key,
    required this.store,
    required this.api,
    required this.token,
    required this.onOpenVehicle,
  });

  final FleetStore store;
  final ApiClient api;
  final String token;
  final ValueChanged<int> onOpenVehicle;

  @override
  State<DashboardTab> createState() => _DashboardTabState();
}

class _DashboardTabState extends State<DashboardTab> {
  late DateTime _from = _today();
  late DateTime _to = _today();
  String _preset = 'today';

  Map<String, dynamic>? _data;
  bool _loading = false;
  String? _error;
  int _section = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await widget.api.dashboard(widget.token, _iso(_from), _iso(_to));
      if (mounted) setState(() => _data = data);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.isNetworkFailure ? tr('fleet.offline') : e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _setPreset(String preset) {
    final t = _today();
    setState(() {
      _preset = preset;
      switch (preset) {
        case 'yesterday':
          _from = _to = t.subtract(const Duration(days: 1));
        case 'week':
          _from = t.subtract(const Duration(days: 6));
          _to = t;
        case 'month':
          _from = t.subtract(const Duration(days: 29));
          _to = t;
        default:
          _from = _to = t;
      }
    });
    _load();
  }

  Future<void> _pickRange() async {
    final t = _today();
    final picked = await showDateRangePicker(
      context: context,
      firstDate: t.subtract(const Duration(days: 365)),
      lastDate: t,
      initialDateRange: DateTimeRange(start: _from, end: _to),
    );
    if (picked == null) return;
    var start = picked.start;
    /* السيرفر يقبل ٣١ يومًا كحدّ أقصى — نقصّ من البداية بدل أن نرفض */
    if (picked.end.difference(start).inDays > 30) start = picked.end.subtract(const Duration(days: 30));
    setState(() {
      _preset = 'custom';
      _from = start;
      _to = picked.end;
    });
    _load();
  }

  String _fmt(DateTime d) => '${_two(d.day)}/${_two(d.month)}/${d.year}';

  Future<void> _openRangeSheet() async {
    final choice = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Palette.panel,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (context) => SafeArea(
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.85),
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(color: Palette.border, borderRadius: BorderRadius.circular(99)),
                  ),
                ),
                const SizedBox(height: 14),
                Text(tr('dash.range.pick'),
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900)),
                const SizedBox(height: 10),
                for (final (p, icon) in [
                  ('today', Icons.today_rounded),
                  ('yesterday', Icons.history_toggle_off_rounded),
                  ('week', Icons.date_range_rounded),
                  ('month', Icons.calendar_view_month_rounded),
                  ('custom', Icons.edit_calendar_rounded),
                ])
                  Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: Material(
                      color: _preset == p ? Brand.green.withValues(alpha: 0.12) : Colors.transparent,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                        side: BorderSide(color: _preset == p ? Brand.green : Palette.border),
                      ),
                      child: InkWell(
                        onTap: () => Navigator.pop(context, p),
                        borderRadius: BorderRadius.circular(14),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
                          child: Row(
                            children: [
                              Icon(icon, size: 20, color: _preset == p ? Brand.green : Palette.muted),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Text(tr('dash.range.$p'),
                                    style: TextStyle(
                                      fontSize: 14,
                                      fontWeight: FontWeight.w800,
                                      color: _preset == p ? Brand.green : Palette.text,
                                    )),
                              ),
                              if (_preset == p)
                                const Icon(Icons.check_circle_rounded, size: 20, color: Brand.green),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
    if (choice == null) return;
    if (choice == 'custom') {
      await _pickRange();
    } else {
      _setPreset(choice);
    }
  }

  String get _greeting {
    final h = DateTime.now().toUtc().add(const Duration(hours: 3)).hour;
    return h < 12 ? tr('dash.morning') : tr('dash.evening');
  }

  @override
  Widget build(BuildContext context) {
    final d = _data;
    final kpis = (d?['kpis'] as Map<String, dynamic>?) ?? {};

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.only(bottom: 24),
        children: [
          /* التحية والعنوان وزرّ التحديث */
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(_greeting, style: TextStyle(fontSize: 12, color: Palette.muted)),
                      const SizedBox(height: 2),
                      Text(tr('dash.title'),
                          style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
                    ],
                  ),
                ),
                Material(
                  color: Palette.glass,
                  shape: CircleBorder(side: BorderSide(color: Palette.glassEdge)),
                  child: InkWell(
                    customBorder: const CircleBorder(),
                    onTap: _loading ? null : _load,
                    child: SizedBox(
                      width: 44,
                      height: 44,
                      child: _loading
                          ? const Padding(
                              padding: EdgeInsets.all(12),
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : Icon(Icons.refresh_rounded, color: Palette.text),
                    ),
                  ),
                ),
              ],
            ),
          ),

          /* الفترة: مربّع واحد يفتح قائمة الخيارات */
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
            child: _RangeBox(
              title: _preset == 'custom' ? tr('dash.range.custom') : tr('dash.range.$_preset'),
              dates: _from == _to ? _fmt(_from) : '${_fmt(_from)}  —  ${_fmt(_to)}',
              onTap: _openRangeSheet,
            ),
          ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
              child: Text(_error!, style: const TextStyle(fontSize: 12, color: Brand.danger)),
            ),

          /* المؤشرات الثلاثة */
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
            child: Row(
              children: [
                Expanded(
                  child: _Kpi(
                    icon: Icons.directions_car_filled_rounded,
                    tone: const Color(0xFF38BDF8),
                    value: '${kpis['vehicles'] ?? '—'}',
                    label: tr('dash.kpi.vehicles'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _Kpi(
                    icon: Icons.check_circle_rounded,
                    tone: Brand.green,
                    value: '${kpis['active'] ?? '—'}',
                    label: tr('dash.kpi.active'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _Kpi(
                    icon: Icons.build_rounded,
                    tone: Brand.warn,
                    value: '${kpis['maintenanceDue'] ?? '—'}',
                    label: tr('dash.kpi.maintenance'),
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 14),
            child: _Segments(
              items: [
                (Icons.dashboard_rounded, tr('dash.sec.overview')),
                (Icons.warning_amber_rounded, tr('dash.sec.events')),
                (Icons.local_shipping_rounded, tr('dash.sec.fleet')),
              ],
              index: _section,
              onChanged: (i) => setState(() => _section = i),
            ),
          ),
          if (d == null)
            const Padding(
              padding: EdgeInsets.only(top: 40),
              child: Center(child: CircularProgressIndicator()),
            )
          else
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: switch (_section) {
                0 => _overview(d),
                1 => _events(d),
                _ => _fleet(d),
              },
            ),
        ],
      ),
    );
  }

  /* ───────────────────────── نظرة عامة ───────────────────────── */

  Widget _overview(Map<String, dynamic> d) {
    final score = ((d['safety'] as Map<String, dynamic>?)?['score'] as num?)?.toInt();
    final (tone, grade) = _grade(score);
    final totals = (d['totals'] as Map<String, dynamic>?) ?? {};
    final e = (d['events'] as Map<String, dynamic>?) ?? {};
    int n(String k) => (e[k] as num?)?.toInt() ?? 0;

    return Column(
      children: [
        /* درجة السلامة: نصف دائرة فوق، والدرجة والوصف تحتها، ثم ما أثّر فيها */
        _SafetyCard(
          score: score,
          tone: tone,
          grade: grade,
          factors: [
            (Icons.speed_rounded, tr('alert.speed'), n('speed')),
            (Icons.hourglass_bottom_rounded, tr('alert.idle'), n('idle')),
            (Icons.logout_rounded, tr('alert.geofenceOut'), n('geofenceOut')),
            (Icons.sos_rounded, tr('alert.sos'), n('sos')),
          ],
        ),
        const SizedBox(height: 12),

        /* إجماليات الفترة */
        _Grid(cells: [
          _Cell(Icons.route_rounded, Brand.green, tr('hist.distance'), '${totals['distanceKm'] ?? 0}',
              tr('hist.km')),
          _Cell(Icons.timer_rounded, const Color(0xFF38BDF8), tr('dash.driving'),
              _hours((totals['drivingMin'] as num?) ?? 0), ''),
          _Cell(Icons.flag_rounded, const Color(0xFFA78BFA), tr('hist.trips'), '${totals['trips'] ?? 0}', ''),
          _Cell(Icons.speed_rounded, Brand.warn, tr('hist.maxSpeed'), '${totals['maxSpeed'] ?? 0}',
              tr('fleet.kmh')),
        ]),
      ],
    );
  }

  /* ───────────────────────── الأحداث ───────────────────────── */

  Widget _events(Map<String, dynamic> d) {
    final e = (d['events'] as Map<String, dynamic>?) ?? {};
    final totals = (d['totals'] as Map<String, dynamic>?) ?? {};
    int n(String k) => (e[k] as num?)?.toInt() ?? 0;

    return Column(
      children: [
        _Grid(cells: [
          _Cell(Icons.speed_rounded, Brand.danger, tr('alert.speed'), '${n('speed')}', tr('dash.events')),
          _Cell(Icons.hourglass_bottom_rounded, Brand.warn, tr('alert.idle'), '${n('idle')}',
              tr('dash.events')),
          _Cell(Icons.logout_rounded, const Color(0xFFF97316), tr('alert.geofenceOut'), '${n('geofenceOut')}',
              tr('dash.events')),
          _Cell(Icons.login_rounded, const Color(0xFF38BDF8), tr('alert.geofenceIn'), '${n('geofenceIn')}',
              tr('dash.events')),
          _Cell(Icons.sos_rounded, Brand.danger, tr('alert.sos'), '${n('sos')}', tr('dash.events')),
          _Cell(Icons.battery_alert_rounded, Brand.warn, tr('dash.battery'),
              '${n('lowBattery') + n('power')}', tr('dash.events')),
          _Cell(Icons.local_parking_rounded, const Color(0xFFA78BFA), tr('dash.stopTime'),
              _hours((totals['idleMin'] as num?) ?? 0), ''),
          _Cell(Icons.trending_up_rounded, Brand.green, tr('dash.avgSpeed'), '${totals['avgSpeed'] ?? 0}',
              tr('fleet.kmh')),
        ]),
        const SizedBox(height: 12),
        _Card(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.info_outline_rounded, size: 18, color: Palette.muted),
              const SizedBox(width: 10),
              Expanded(
                child: Text(tr('dash.eventsNote'),
                    style: TextStyle(fontSize: 11.5, height: 1.6, color: Palette.muted)),
              ),
            ],
          ),
        ),
      ],
    );
  }

  /* ───────────────────────── الأسطول ───────────────────────── */

  Widget _fleet(Map<String, dynamic> d) {
    final status = (d['status'] as Map<String, dynamic>?) ?? {};
    final total = fleetStatuses.fold<int>(0, (s, k) => s + ((status[k] as num?)?.toInt() ?? 0));
    final m = (d['maintenance'] as Map<String, dynamic>?) ?? {};
    final top = ((d['top'] as List?) ?? const []).cast<Map<String, dynamic>>();
    final maxKm = top.fold<double>(0, (s, r) => math.max(s, (r['km'] as num).toDouble()));

    return Column(
      children: [
        /* توزيع الحالات الآن */
        _Card(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _CardTitle(icon: Icons.sensors_rounded, title: tr('dash.liveStatus')),
              const SizedBox(height: 14),
              ClipRRect(
                borderRadius: BorderRadius.circular(999),
                child: SizedBox(
                  height: 12,
                  child: total == 0
                      ? Container(color: Palette.border)
                      : Row(
                          children: [
                            for (final k in fleetStatuses)
                              if (((status[k] as num?)?.toInt() ?? 0) > 0)
                                Expanded(
                                  flex: (status[k] as num).toInt(),
                                  child: Container(color: statusColor(k)),
                                ),
                          ],
                        ),
                ),
              ),
              const SizedBox(height: 14),
              Row(
                children: [
                  for (final k in fleetStatuses)
                    Expanded(
                      child: Column(
                        children: [
                          Text('${status[k] ?? 0}',
                              style: TextStyle(
                                  fontSize: 18, fontWeight: FontWeight.w900, color: statusColor(k))),
                          Text(tr('fleet.status.$k'), style: TextStyle(fontSize: 10.5, color: Palette.muted)),
                        ],
                      ),
                    ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),

        /* الصيانة */
        _Card(
          child: Row(
            children: [
              Expanded(
                child: _MaintBox(
                  tone: Brand.danger,
                  value: '${m['overdue'] ?? 0}',
                  label: tr('dash.maint.overdue'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _MaintBox(
                  tone: Brand.warn,
                  value: '${m['soon'] ?? 0}',
                  label: tr('dash.maint.soon'),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),

        /* الأكثر قطعًا للمسافة */
        _Card(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _CardTitle(icon: Icons.emoji_events_rounded, title: tr('dash.top')),
              const SizedBox(height: 10),
              if (top.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  child: Text(tr('dash.noTrips'), style: TextStyle(fontSize: 12, color: Palette.muted)),
                )
              else
                for (final (i, r) in top.indexed)
                  InkWell(
                    onTap: () => widget.onOpenVehicle((r['id'] as num).toInt()),
                    borderRadius: BorderRadius.circular(10),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      child: Row(
                        children: [
                          CircleAvatar(
                            radius: 13,
                            backgroundColor: Brand.green.withValues(alpha: 0.14),
                            child: Text('${i + 1}',
                                style: const TextStyle(
                                    fontSize: 11.5, fontWeight: FontWeight.w900, color: Brand.green)),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Text('${r['plate']}',
                                        textDirection: TextDirection.ltr,
                                        style: const TextStyle(fontWeight: FontWeight.w900)),
                                    const Spacer(),
                                    Text('${r['km']} ${tr('hist.km')}',
                                        style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800)),
                                  ],
                                ),
                                const SizedBox(height: 5),
                                ClipRRect(
                                  borderRadius: BorderRadius.circular(999),
                                  child: LinearProgressIndicator(
                                    value: maxKm == 0 ? 0 : (r['km'] as num).toDouble() / maxKm,
                                    minHeight: 6,
                                    color: Brand.green,
                                    backgroundColor: Palette.border,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
            ],
          ),
        ),
      ],
    );
  }
}

/* ───────────────────────── أجزاء ───────────────────────── */

/// نصف دائرة من اليسار إلى اليمين، تمتلئ بنسبة الدرجة.
class _HalfGauge extends CustomPainter {
  _HalfGauge({required this.value, required this.tone, required this.track});

  final double value;
  final Color tone;
  final Color track;

  @override
  void paint(Canvas canvas, Size size) {
    const stroke = 14.0;
    final radius = math.min(size.width / 2, size.height) - stroke / 2;
    final center = Offset(size.width / 2, size.height - stroke / 2);
    final arc = Rect.fromCircle(center: center, radius: radius);
    Paint pen(Color c) => Paint()
      ..color = c
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.round;
    canvas.drawArc(arc, math.pi, math.pi, false, pen(track));
    if (value > 0) canvas.drawArc(arc, math.pi, math.pi * value.clamp(0, 1), false, pen(tone));
  }

  @override
  bool shouldRepaint(_HalfGauge old) => old.value != value || old.tone != tone || old.track != track;
}

class _SafetyCard extends StatelessWidget {
  const _SafetyCard({required this.score, required this.tone, required this.grade, required this.factors});

  final int? score;
  final Color tone;
  final String grade;
  final List<(IconData, String, int)> factors;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: AlignmentDirectional.centerStart,
          end: AlignmentDirectional.centerEnd,
          colors: [tone.withValues(alpha: 0.16), Palette.glass],
        ),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: tone.withValues(alpha: 0.35)),
      ),
      child: Column(
        children: [
          Row(
            children: [
              /* نصف الدائرة صغيرة على الطرف، والرقم داخلها */
              SizedBox(
                width: 112,
                height: 62,
                child: CustomPaint(
                  painter: _HalfGauge(value: (score ?? 0) / 100, tone: tone, track: Palette.border),
                  child: Align(
                    alignment: Alignment.bottomCenter,
                    child: Text(score == null ? '—' : '$score',
                        style: TextStyle(
                            fontSize: 26, height: 1, fontWeight: FontWeight.w900, color: Palette.text)),
                  ),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(Icons.shield_rounded, size: 16, color: tone),
                        const SizedBox(width: 6),
                        Text(tr('dash.safety'),
                            style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w900)),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                      decoration: BoxDecoration(
                        color: tone.withValues(alpha: 0.16),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(grade,
                          style: TextStyle(fontSize: 11, fontWeight: FontWeight.w900, color: tone)),
                    ),
                    const SizedBox(height: 4),
                    Text(tr('dash.outOf'), style: TextStyle(fontSize: 10.5, color: Palette.muted)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),

          /* ما أثّر في الدرجة: سطر واحد */
          Container(
            padding: const EdgeInsets.symmetric(vertical: 7),
            decoration: BoxDecoration(
              color: Palette.bg.withValues(alpha: 0.5),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                for (final (i, f) in factors.indexed) ...[
                  if (i > 0) Container(width: 1, height: 26, color: Palette.border),
                  Expanded(
                    child: Column(
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(f.$1, size: 13, color: f.$3 > 0 ? Brand.danger : Palette.muted),
                            const SizedBox(width: 4),
                            Text('${f.$3}',
                                style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w900)),
                          ],
                        ),
                        Text(f.$2,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 9.5, color: Palette.muted)),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Palette.glass,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Palette.glassEdge),
      ),
      child: child,
    );
  }
}

class _CardTitle extends StatelessWidget {
  const _CardTitle({required this.icon, required this.title});

  final IconData icon;
  final String title;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 18, color: Brand.green),
        const SizedBox(width: 8),
        Text(title, style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w900)),
      ],
    );
  }
}

class _Kpi extends StatelessWidget {
  const _Kpi({required this.icon, required this.tone, required this.value, required this.label});

  final IconData icon;
  final Color tone;
  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
      decoration: BoxDecoration(
        color: Palette.glass,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Palette.glassEdge),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 30,
            height: 30,
            decoration: BoxDecoration(
              color: tone.withValues(alpha: 0.14),
              borderRadius: BorderRadius.circular(9),
            ),
            child: Icon(icon, size: 17, color: tone),
          ),
          const SizedBox(height: 10),
          Text(value, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: Palette.text)),
          Text(label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 10.5, color: Palette.muted)),
        ],
      ),
    );
  }
}

/// مربّع الفترة: أيقونة التقويم، واسم الفترة وتواريخها، وسهم يدلّ أنه يُفتح.
class _RangeBox extends StatelessWidget {
  const _RangeBox({required this.title, required this.dates, required this.onTap});

  final String title;
  final String dates;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Palette.glass,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: Brand.green.withValues(alpha: 0.45), width: 1.2),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
          child: Row(
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: Brand.green.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(11),
                ),
                child: const Icon(Icons.calendar_month_rounded, size: 19, color: Brand.green),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w900)),
                    const SizedBox(height: 2),
                    Text(dates,
                        textDirection: TextDirection.ltr,
                        style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: Palette.muted)),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: Palette.bg.withValues(alpha: 0.6),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.tune_rounded, size: 15, color: Palette.muted),
                    const SizedBox(width: 4),
                    Text(tr('dash.range.change'),
                        style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, color: Palette.muted)),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// نفس شريط التبويبات في صفحة المركبة: ثلاثة أجزاء متساوية والمختار ينزلق.
class _Segments extends StatelessWidget {
  const _Segments({required this.items, required this.index, required this.onChanged});

  final List<(IconData, String)> items;
  final int index;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: Palette.glass,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Palette.glassEdge),
      ),
      child: LayoutBuilder(builder: (context, box) {
        final width = box.maxWidth / items.length;
        final rtl = Directionality.of(context) == TextDirection.rtl;
        return SizedBox(
          height: 38,
          child: Stack(
            children: [
              AnimatedPositioned(
                duration: const Duration(milliseconds: 220),
                curve: Curves.easeOutCubic,
                top: 0,
                bottom: 0,
                left: rtl ? null : width * index,
                right: rtl ? width * index : null,
                width: width,
                child: Container(
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(colors: [Brand.green, Color(0xFF00A87C)]),
                    borderRadius: BorderRadius.circular(10),
                  ),
                ),
              ),
              Positioned.fill(
                child: Row(
                  children: [
                    for (var i = 0; i < items.length; i++)
                      Expanded(
                        child: InkWell(
                          onTap: () => onChanged(i),
                          borderRadius: BorderRadius.circular(10),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(items[i].$1, size: 16, color: i == index ? Brand.onGreen : Palette.muted),
                              const SizedBox(width: 6),
                              Flexible(
                                child: Text(items[i].$2,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w900,
                                      color: i == index ? Brand.onGreen : Palette.muted,
                                    )),
                              ),
                            ],
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        );
      }),
    );
  }
}

class _Cell {
  const _Cell(this.icon, this.tone, this.label, this.value, this.unit);

  final IconData icon;
  final Color tone;
  final String label;
  final String value;
  final String unit;
}

/// شبكة عمودين في بطاقة واحدة، خلاياها بمقاس واحد وتفصلها خطوط رفيعة.
class _Grid extends StatelessWidget {
  const _Grid({required this.cells});

  final List<_Cell> cells;

  @override
  Widget build(BuildContext context) {
    Widget cell(_Cell c) => Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: c.tone.withValues(alpha: 0.13),
                  shape: BoxShape.circle,
                ),
                child: Icon(c.icon, size: 19, color: c.tone),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.baseline,
                      textBaseline: TextBaseline.alphabetic,
                      children: [
                        Flexible(
                          child: Text(c.value,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style:
                                  TextStyle(fontSize: 17, fontWeight: FontWeight.w900, color: Palette.text)),
                        ),
                        if (c.unit.isNotEmpty) ...[
                          const SizedBox(width: 4),
                          Text(c.unit, style: TextStyle(fontSize: 10.5, color: Palette.muted)),
                        ],
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(c.label,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 11, height: 1.3, color: Palette.muted)),
                  ],
                ),
              ),
            ],
          ),
        );

    final rows = <Widget>[];
    for (var i = 0; i < cells.length; i += 2) {
      if (i > 0) rows.add(Divider(height: 1, thickness: 1, color: Palette.glassEdge));
      rows.add(IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(child: cell(cells[i])),
            VerticalDivider(width: 1, thickness: 1, color: Palette.glassEdge),
            Expanded(child: i + 1 < cells.length ? cell(cells[i + 1]) : const SizedBox()),
          ],
        ),
      ));
    }

    return Container(
      decoration: BoxDecoration(
        color: Palette.glass,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Palette.glassEdge),
      ),
      child: Column(children: rows),
    );
  }
}

class _MaintBox extends StatelessWidget {
  const _MaintBox({required this.tone, required this.value, required this.label});

  final Color tone;
  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      decoration: BoxDecoration(
        color: tone.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: tone.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          Icon(Icons.build_circle_rounded, color: tone),
          const SizedBox(width: 10),
          Text(value, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: tone)),
          const SizedBox(width: 8),
          Expanded(
            child: Text(label,
                maxLines: 2,
                style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: Palette.text)),
          ),
        ],
      ),
    );
  }
}
