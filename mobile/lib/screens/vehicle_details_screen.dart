import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../i18n.dart';
import '../services/api_client.dart';
import '../theme.dart';
import '../widgets/fleet_widgets.dart';

/// الساعة والتاريخ بتوقيت السعودية — كما يقسم السيرفر الأيام.
DateTime _riyadh(DateTime t) => t.toUtc().add(const Duration(hours: 3));
String _two(int n) => n.toString().padLeft(2, '0');

String _clock(String? iso) {
  final t = iso == null ? null : DateTime.tryParse(iso);
  if (t == null) return '—';
  final r = _riyadh(t);
  return '${_two(r.hour)}:${_two(r.minute)}';
}

String _date(String? iso) {
  final t = iso == null ? null : DateTime.tryParse(iso);
  if (t == null) return '—';
  final r = _riyadh(t);
  return '${r.year}/${_two(r.month)}/${_two(r.day)}';
}

String _pick(Map<String, dynamic>? m, String ar, String en) {
  if (m == null) return '';
  final first = '${m[AppLocale.isArabic ? ar : en] ?? ''}'.trim();
  return first.isNotEmpty ? first : '${m[AppLocale.isArabic ? en : ar] ?? ''}'.trim();
}

/// صفحة المركبة: بطاقة الهوية، ثم تبويبات النظرة العامة والرحلات
/// والتفاصيل. تُحدَّث كل خمس ثوانٍ ما دامت مفتوحة.
class VehicleDetailsScreen extends StatefulWidget {
  const VehicleDetailsScreen({
    super.key,
    required this.vehicleId,
    required this.api,
    required this.token,
    this.onShowOnMap,
    this.onShowHistory,
  });

  final int vehicleId;
  final ApiClient api;
  final String token;
  final VoidCallback? onShowOnMap;
  final VoidCallback? onShowHistory;

  @override
  State<VehicleDetailsScreen> createState() => _VehicleDetailsScreenState();
}

class _VehicleDetailsScreenState extends State<VehicleDetailsScreen> {
  Map<String, dynamic>? _data;
  String? _error;
  Timer? _timer;
  int _tab = 0;

  @override
  void initState() {
    super.initState();
    _load();
    /* خمس ثوانٍ: الخريطة هنا لمركبة واحدة تُتابَع، لا لأسطول يُستعرض */
    _timer = Timer.periodic(const Duration(seconds: 5), (_) => _load());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final data = await widget.api.asset(widget.token, widget.vehicleId);
      if (mounted) {
        setState(() {
          _data = data;
          _error = null;
        });
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.isNetworkFailure ? tr('fleet.offline') : e.message);
    }
  }

  Map<String, dynamic> get _vehicle => (_data?['vehicle'] as Map<String, dynamic>?) ?? {};
  Map<String, dynamic>? get _position => _data?['position'] as Map<String, dynamic>?;

  @override
  Widget build(BuildContext context) {
    final tabs = [
      (Icons.dashboard_rounded, tr('vd.tab.overview')),
      (Icons.route_rounded, tr('vd.tab.trips')),
      (Icons.info_rounded, tr('vd.tab.details')),
    ];

    return Scaffold(
      backgroundColor: Palette.bg,
      appBar: AppBar(
        backgroundColor: Palette.bg,
        surfaceTintColor: Colors.transparent,
        foregroundColor: Palette.text,
        centerTitle: true,
        title: Text(tr('vd.title'),
            style: TextStyle(fontSize: 17, fontWeight: FontWeight.w900, color: Palette.text)),
      ),
      body: _data == null
          ? Center(
              child: _error == null
                  ? const CircularProgressIndicator()
                  : Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text(_error!, textAlign: TextAlign.center),
                    ),
            )
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.only(bottom: 24),
                children: [
                  if (_error != null)
                    Container(
                      color: Brand.danger.withValues(alpha: 0.12),
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 7),
                      child: Text(_error!,
                          style: const TextStyle(
                              fontSize: 11.5, fontWeight: FontWeight.w700, color: Brand.danger)),
                    ),
                  _HeaderCard(vehicle: _vehicle, position: _position),
                  _Tabs(items: tabs, index: _tab, onChanged: (i) => setState(() => _tab = i)),
                  const SizedBox(height: 16),
                  switch (_tab) {
                    0 => _overview(),
                    1 => _trips(),
                    _ => _details(),
                  },
                ],
              ),
            ),
    );
  }

  /* ───────────────────────── نظرة عامة ───────────────────────── */

  Widget _overview() {
    final pos = _position;
    final status = '${pos?['status'] ?? 'offline'}';
    final tone = statusColor(status);
    final point = pos == null ? null : LatLng((pos['lat'] as num).toDouble(), (pos['lng'] as num).toDouble());
    final speed = (pos?['speed'] as num?)?.toInt() ?? 0;
    final heading = (pos?['heading'] as num?)?.toInt() ?? 0;
    final age = (pos?['ageSeconds'] as num?)?.toInt();
    final ignition = pos?['ignition'] as bool?;
    final power = (pos?['power'] as num?)?.toDouble();
    final battery = (pos?['battery'] as num?)?.toInt();
    final stats = ((_data?['today'] as Map<String, dynamic>?)?['stats'] as Map<String, dynamic>?) ?? {};

    /* بلا خطّ إشعال من الجهاز يُستدلّ من الحركة، ويقال ذلك صراحة */
    final ignitionOn = ignition ?? (status == 'moving' || status == 'idle');

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        children: [
          if (point == null)
            _Panel(
              child: Row(
                children: [
                  Icon(Icons.portable_wifi_off_rounded, color: Palette.muted),
                  const SizedBox(width: 10),
                  Expanded(
                    child:
                        Text(tr('fleet.neverReported'), style: TextStyle(fontSize: 13, color: Palette.muted)),
                  ),
                ],
              ),
            )
          else
            _VehicleMap(
              point: point,
              heading: heading,
              tone: tone,
              live: age != null && age < 180,
              onExpand: widget.onShowOnMap == null
                  ? null
                  : () {
                      Navigator.of(context).pop();
                      widget.onShowOnMap!();
                    },
            ),
          const SizedBox(height: 16),

          /* الحالة */
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: tone.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: tone.withValues(alpha: 0.35)),
            ),
            child: Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(color: tone, width: 2),
                  ),
                  child: Center(
                    child: Container(
                      width: 16,
                      height: 16,
                      decoration: BoxDecoration(color: tone, shape: BoxShape.circle),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(tr('fleet.status.$status'),
                          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: tone)),
                      Text(age == null ? tr('fleet.neverReported') : ageLabel(age),
                          style: TextStyle(fontSize: 12, color: Palette.muted)),
                    ],
                  ),
                ),
                if (pos != null) ...[
                  Transform.rotate(
                    angle: heading * math.pi / 180,
                    child: Icon(Icons.navigation_rounded, size: 18, color: tone),
                  ),
                  const SizedBox(width: 4),
                  Text('$heading°',
                      textDirection: TextDirection.ltr,
                      style: TextStyle(fontWeight: FontWeight.w800, color: tone)),
                ],
              ],
            ),
          ),
          const SizedBox(height: 12),

          /* أربع قراءات في بطاقة واحدة مقسومة بالتساوي — الخلايا بالمقاس نفسه
             مهما طال نصّ إحداها */
          _MetricGrid(
            cells: [
              _MetricCell(
                icon: Icons.power_settings_new_rounded,
                label: tr('vd.ignition'),
                value: ignitionOn ? tr('vd.on') : tr('vd.off'),
                tone: ignitionOn ? Brand.green : Brand.danger,
                note: ignition == null && pos != null ? tr('vd.inferred') : null,
              ),
              _MetricCell(
                icon: Icons.speed_rounded,
                label: tr('fleet.speed'),
                value: '$speed ${tr('fleet.kmh')}',
                tone: const Color(0xFF38BDF8),
              ),
              _MetricCell(
                icon: Icons.route_rounded,
                label: tr('vd.todayDistance'),
                value: '${stats['totalDistance'] ?? 0} ${tr('hist.km')}',
                tone: Brand.green,
              ),
              _MetricCell(
                icon: power != null ? Icons.electrical_services_rounded : Icons.battery_std_rounded,
                label: power != null ? tr('vd.power') : tr('fleet.battery'),
                value: power != null
                    ? '${power.toStringAsFixed(1)} V'
                    : battery != null
                        ? '$battery%'
                        : '—',
                tone: Brand.warn,
              ),
            ],
          ),
        ],
      ),
    );
  }

  /* ───────────────────────── الرحلات ───────────────────────── */

  Widget _trips() {
    final today = (_data?['today'] as Map<String, dynamic>?) ?? {};
    final trips = ((today['trips'] as List?) ?? const []).cast<Map<String, dynamic>>();
    final stats = (today['stats'] as Map<String, dynamic>?) ?? {};

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(child: _Mini(label: tr('hist.trips'), value: '${trips.length}')),
              const SizedBox(width: 8),
              Expanded(
                  child: _Mini(
                      label: tr('hist.distance'), value: '${stats['totalDistance'] ?? 0} ${tr('hist.km')}')),
              const SizedBox(width: 8),
              Expanded(child: _Mini(label: tr('hist.maxSpeed'), value: '${stats['maxSpeed'] ?? 0}')),
            ],
          ),
          const SizedBox(height: 12),
          Text(tr('vd.todayTrips'),
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w900, color: Palette.muted)),
          const SizedBox(height: 8),
          if (trips.isEmpty)
            _Panel(
              child:
                  Text(tr('vd.noTrips'), textAlign: TextAlign.center, style: TextStyle(color: Palette.muted)),
            )
          else
            for (final (i, t) in trips.indexed)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _Panel(
                  child: Row(
                    children: [
                      CircleAvatar(
                        radius: 14,
                        backgroundColor: Brand.green.withValues(alpha: 0.15),
                        child: Text('${i + 1}',
                            style: const TextStyle(
                                fontSize: 11.5, fontWeight: FontWeight.w900, color: Brand.green)),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text('${_clock(t['startAt'] as String?)} ← ${_clock(t['endAt'] as String?)}',
                            style: const TextStyle(fontWeight: FontWeight.w800)),
                      ),
                      Text(
                          '${t['distance'] ?? 0} ${tr('hist.km')} · ${t['durationMin'] ?? 0} ${tr('hist.min')}',
                          style: TextStyle(fontSize: 12, color: Palette.muted)),
                    ],
                  ),
                ),
              ),
          if (widget.onShowHistory != null) ...[
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: () {
                Navigator.of(context).pop();
                widget.onShowHistory!();
              },
              style: OutlinedButton.styleFrom(
                foregroundColor: Palette.text,
                side: BorderSide(color: Palette.border),
                minimumSize: const Size.fromHeight(48),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              ),
              icon: const Icon(Icons.history_rounded, size: 19),
              label: Text(tr('vd.fullHistory')),
            ),
          ],
        ],
      ),
    );
  }

  /* ───────────────────────── تفاصيل المركبة ───────────────────────── */

  Widget _details() {
    final v = _vehicle;
    final group = _data?['group'] as Map<String, dynamic>?;
    String val(Object? x) => x == null || '$x'.trim().isEmpty ? '—' : '$x';
    final expiry = v['simExpiry'] as String?;
    final expiryAt = expiry == null ? null : DateTime.tryParse(expiry);
    /* تاريخ قبل 2000 ليس تاريخًا: هو الصفر الذي يُكتب حين لا يُدخَل شيء */
    final expiryKnown = expiryAt != null && expiryAt.year > 2000;
    final expired = expiryKnown && expiryAt.isBefore(DateTime.now());

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        children: [
          _Section(
            icon: Icons.directions_car_filled_rounded,
            title: tr('vd.sec.vehicle'),
            rows: [
              _Row(Icons.pin_rounded, tr('vd.plate'), val(v['plate']), ltr: true),
              _Row(Icons.local_shipping_outlined, tr('fleet.model'), val(_pick(v, 'modelAr', 'modelEn'))),
              _Row(Icons.account_tree_outlined, tr('vd.branch'), val(_pick(group, 'nameAr', 'nameEn'))),
              _Row(Icons.event_available_rounded, tr('vd.createdAt'), _date(v['createdAt'] as String?)),
            ],
          ),
          const SizedBox(height: 14),
          _Section(
            icon: Icons.router_rounded,
            title: tr('vd.sec.device'),
            rows: [
              _Row(Icons.memory_rounded, tr('fleet.imei'), val(v['imei']), ltr: true),
              _Row(Icons.sim_card_outlined, tr('vd.sim'), val(v['sim']), ltr: true),
              _Row(
                Icons.event_busy_rounded,
                tr('vd.simExpiry'),
                expiryKnown ? _date(expiry) : tr('vd.notSet'),
                badge: !expiryKnown
                    ? null
                    : expired
                        ? (tr('vd.expired'), Brand.danger)
                        : (tr('vd.valid'), Brand.green),
              ),
            ],
          ),
          const SizedBox(height: 14),
          _Section(
            icon: Icons.speed_rounded,
            title: tr('vd.sec.usage'),
            rows: [
              _Row(Icons.route_outlined, tr('vd.odometer'), '${val(v['odometer'])} ${tr('hist.km')}'),
              _Row(Icons.timer_outlined, tr('vd.engineHours'), '${val(v['engineHours'])} ${tr('hist.h')}'),
              _Row(Icons.speed_outlined, tr('vd.speedLimit'), '${val(v['speedLimit'])} ${tr('fleet.kmh')}'),
            ],
          ),
        ],
      ),
    );
  }
}

/* ───────────────────────── بطاقة الهوية ───────────────────────── */

class _HeaderCard extends StatelessWidget {
  const _HeaderCard({required this.vehicle, required this.position});

  final Map<String, dynamic> vehicle;
  final Map<String, dynamic>? position;

  @override
  Widget build(BuildContext context) {
    final status = '${position?['status'] ?? 'offline'}';
    final plate = '${vehicle['plate'] ?? ''}';

    final tone = statusColor(status);
    final model = _pick(vehicle, 'modelAr', 'modelEn');

    return Container(
      margin: const EdgeInsets.fromLTRB(16, 4, 16, 12),
      padding: const EdgeInsets.fromLTRB(10, 10, 14, 10),
      decoration: BoxDecoration(
        color: Palette.panel,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Palette.border),
      ),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: tone.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: tone.withValues(alpha: 0.3)),
            ),
            child: Icon(Icons.directions_car_filled_rounded, size: 22, color: tone),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  plate,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  textDirection: TextDirection.ltr,
                  style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900, letterSpacing: 0.5),
                ),
                if (model.isNotEmpty)
                  Text(model,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 11.5, color: Palette.muted)),
              ],
            ),
          ),
          const SizedBox(width: 8),
          StatusPill(status: status),
        ],
      ),
    );
  }
}

/// لوحة سعودية: الأرقام والحروف بالعربية فوق، وباللاتينية تحت، و«KSA» بينهما.
///
/// اللوحة المسجّلة تُقرأ «2990 JUA» — أرقام ثم حروف لاتينية. أيّ صيغة أخرى
/// (لوحات تجريبية مثل TEST-8173) تُعرض نصًّا كما هي.
class SaudiPlate extends StatelessWidget {
  const SaudiPlate({super.key, required this.plate});

  final String plate;

  static const _letters = {
    'A': 'ا',
    'B': 'ب',
    'J': 'ح',
    'D': 'د',
    'R': 'ر',
    'S': 'س',
    'X': 'ص',
    'T': 'ط',
    'E': 'ع',
    'G': 'ق',
    'K': 'ك',
    'L': 'ل',
    'Z': 'م',
    'N': 'ن',
    'H': 'هـ',
    'U': 'و',
    'V': 'ى',
  };

  static String _arabicDigits(String s) =>
      s.split('').map((c) => '0123456789'.contains(c) ? '٠١٢٣٤٥٦٧٨٩'['0123456789'.indexOf(c)] : c).join();

  @override
  Widget build(BuildContext context) {
    final m = RegExp(r'^\s*(\d{1,4})\s*([A-Za-z]{1,3})\s*$').firstMatch(plate);
    if (m == null) {
      return Text(plate,
          textDirection: TextDirection.ltr,
          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900));
    }
    final digits = m.group(1)!;
    final latin = m.group(2)!.toUpperCase();
    final arabic = latin.split('').map((c) => _letters[c] ?? c).join(' ');

    Widget cell(String top, String bottom) => Expanded(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Column(
              children: [
                Text(top,
                    maxLines: 1,
                    style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: Palette.muted)),
                Text(bottom,
                    maxLines: 1,
                    textDirection: TextDirection.ltr,
                    style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900, letterSpacing: 1)),
              ],
            ),
          ),
        );

    return Container(
      height: 50,
      decoration: BoxDecoration(
        border: Border.all(color: Palette.border, width: 1.5),
        borderRadius: BorderRadius.circular(8),
      ),
      /* اللوحة تُقرأ من اليسار مهما كانت لغة الواجهة: الأرقام يسارًا والحروف يمينًا */
      child: Directionality(
        textDirection: TextDirection.ltr,
        child: Row(
          children: [
            cell(_arabicDigits(digits), digits),
            Container(width: 1, color: Palette.border),
            SizedBox(
              width: 36,
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Container(height: 3, width: 22, color: Brand.green),
                  const SizedBox(height: 4),
                  const Text('KSA', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w900)),
                ],
              ),
            ),
            Container(width: 1, color: Palette.border),
            cell(arabic, latin),
          ],
        ),
      ),
    );
  }
}

/* ───────────────────────── أجزاء صغيرة ───────────────────────── */

/// ثلاثة أجزاء متساوية بعرض الصفحة. المختار يمتلئ بالأخضر، والانتقال بينها
/// ينزلق بدل أن يقفز.
class _Tabs extends StatelessWidget {
  const _Tabs({required this.items, required this.index, required this.onChanged});

  final List<(IconData, String)> items;
  final int index;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: Palette.panel,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Palette.border),
      ),
      child: LayoutBuilder(
        builder: (context, box) {
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
                      boxShadow: [
                        BoxShadow(
                          color: Brand.green.withValues(alpha: 0.3),
                          blurRadius: 12,
                          offset: const Offset(0, 4),
                        ),
                      ],
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
                            borderRadius: BorderRadius.circular(12),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(items[i].$1,
                                    size: 16, color: i == index ? Brand.onGreen : Palette.muted),
                                const SizedBox(width: 6),
                                Flexible(
                                  child: Text(
                                    items[i].$2,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w900,
                                      color: i == index ? Brand.onGreen : Palette.muted,
                                    ),
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
            ),
          );
        },
      ),
    );
  }
}

class _VehicleMap extends StatefulWidget {
  const _VehicleMap({
    required this.point,
    required this.heading,
    required this.tone,
    required this.live,
    this.onExpand,
  });

  final LatLng point;
  final int heading;
  final Color tone;
  final bool live;
  final VoidCallback? onExpand;

  @override
  State<_VehicleMap> createState() => _VehicleMapState();
}

class _VehicleMapState extends State<_VehicleMap> {
  final _map = MapController();
  bool _ready = false;

  /// الخريطة تلحق بالمركبة مع كل تحديث، حتى يحرّكها المستخدم بيده.
  bool _following = true;

  @override
  void didUpdateWidget(_VehicleMap old) {
    super.didUpdateWidget(old);
    if (_ready && _following && widget.point != old.point) {
      _map.move(widget.point, _map.camera.zoom);
    }
  }

  void _follow() {
    setState(() => _following = true);
    _map.move(widget.point, 16);
  }

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(20),
      child: SizedBox(
        height: 280,
        child: Stack(
          fit: StackFit.expand,
          children: [
            FlutterMap(
              mapController: _map,
              options: MapOptions(
                initialCenter: widget.point,
                initialZoom: 16,
                interactionOptions: const InteractionOptions(
                  flags: InteractiveFlag.all & ~InteractiveFlag.rotate,
                ),
                onMapReady: () => _ready = true,
                onPositionChanged: (_, hasGesture) {
                  if (hasGesture && _following) setState(() => _following = false);
                },
              ),
              children: [
                TileLayer(
                  urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                  userAgentPackageName: 'sa.mirsad.mirsad_driver',
                  maxNativeZoom: 19,
                  errorTileCallback: (_, __, ___) {},
                ),
                MarkerLayer(
                  markers: [
                    Marker(
                      point: widget.point,
                      width: 44,
                      height: 44,
                      child: Transform.rotate(
                        angle: widget.heading * math.pi / 180,
                        child: Container(
                          decoration: BoxDecoration(
                            color: widget.tone,
                            shape: BoxShape.circle,
                            border: Border.all(color: Colors.white, width: 3),
                            boxShadow: [BoxShadow(color: widget.tone.withValues(alpha: 0.5), blurRadius: 14)],
                          ),
                          child: const Icon(Icons.navigation_rounded, color: Colors.white, size: 22),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
            PositionedDirectional(
              top: 10,
              start: 10,
              child: Column(
                children: [
                  if (widget.onExpand != null) ...[
                    _MapBtn(icon: Icons.open_in_full_rounded, onTap: widget.onExpand!),
                    const SizedBox(height: 8),
                  ],
                  _MapBtn(
                    icon: _following ? Icons.gps_fixed_rounded : Icons.my_location_rounded,
                    onTap: _follow,
                  ),
                ],
              ),
            ),
            PositionedDirectional(
              bottom: 10,
              start: 10,
              child: _Chip(
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 8,
                      height: 8,
                      decoration: BoxDecoration(
                        color: widget.live ? Brand.green : Palette.muted,
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text(widget.live ? tr('vd.live') : tr('vd.lastKnown'),
                        style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800)),
                  ],
                ),
              ),
            ),
            PositionedDirectional(
              bottom: 10,
              end: 10,
              child: _Chip(
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.place_outlined, size: 14, color: Palette.muted),
                    const SizedBox(width: 4),
                    Text(
                      '${widget.point.latitude.toStringAsFixed(5)}, ${widget.point.longitude.toStringAsFixed(5)}',
                      textDirection: TextDirection.ltr,
                      style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MapBtn extends StatelessWidget {
  const _MapBtn({required this.icon, required this.onTap});

  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Palette.panel,
      borderRadius: BorderRadius.circular(12),
      elevation: 2,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: SizedBox(width: 42, height: 42, child: Icon(icon, size: 20, color: Palette.text)),
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: Palette.panel,
        borderRadius: BorderRadius.circular(12),
        boxShadow: const [BoxShadow(color: Color(0x22000000), blurRadius: 8)],
      ),
      child: DefaultTextStyle.merge(style: TextStyle(color: Palette.text), child: child),
    );
  }
}

class _MetricCell {
  const _MetricCell({
    required this.icon,
    required this.label,
    required this.value,
    required this.tone,
    this.note,
  });

  final IconData icon;
  final String label;
  final String value;
  final Color tone;
  final String? note;
}

/// شبكة ٢×٢ داخل بطاقة واحدة، تفصل خلاياها خطوط رفيعة.
class _MetricGrid extends StatelessWidget {
  const _MetricGrid({required this.cells});

  final List<_MetricCell> cells;

  @override
  Widget build(BuildContext context) {
    Widget cell(_MetricCell c) => Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: c.tone.withValues(alpha: 0.13),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(c.icon, size: 20, color: c.tone),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(c.label,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 11, color: Palette.muted)),
                    const SizedBox(height: 2),
                    Text(c.value,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: c.tone)),
                    /* السطر محجوز دائمًا، فلا تطول خلية عن جارتها حين يظهر */
                    Text(c.note ?? ' ',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 9.5, color: Palette.muted)),
                  ],
                ),
              ),
            ],
          ),
        );

    Widget row(int a, int b) => IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(child: cell(cells[a])),
              VerticalDivider(width: 1, thickness: 1, color: Palette.border),
              Expanded(child: cell(cells[b])),
            ],
          ),
        );

    return Container(
      decoration: BoxDecoration(
        color: Palette.panel,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Palette.border),
      ),
      child: Column(
        children: [
          row(0, 1),
          Divider(height: 1, thickness: 1, color: Palette.border),
          row(2, 3),
        ],
      ),
    );
  }
}

class _Mini extends StatelessWidget {
  const _Mini({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return _Panel(
      child: Column(
        children: [
          Text(value, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w900)),
          Text(label, style: TextStyle(fontSize: 11, color: Palette.muted)),
        ],
      ),
    );
  }
}

/// صفّ في بطاقة التفاصيل: أيقونة، ثم العنوان، ثم القيمة وشارة اختيارية.
class _Row {
  const _Row(this.icon, this.label, this.value, {this.ltr = false, this.badge});

  final IconData icon;
  final String label;
  final String value;
  final bool ltr;
  final (String, Color)? badge;
}

/// بطاقة مجموعة: عنوان بأيقونة، وصفوف بفواصل رفيعة بينها.
class _Section extends StatelessWidget {
  const _Section({required this.icon, required this.title, required this.rows});

  final IconData icon;
  final String title;
  final List<_Row> rows;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Palette.panel,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Palette.border),
      ),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 14, 14, 10),
            child: Row(
              children: [
                Container(
                  width: 30,
                  height: 30,
                  decoration: BoxDecoration(
                    color: Brand.green.withValues(alpha: 0.13),
                    borderRadius: BorderRadius.circular(9),
                  ),
                  child: Icon(icon, size: 17, color: Brand.green),
                ),
                const SizedBox(width: 10),
                Text(title, style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w900)),
              ],
            ),
          ),
          for (var i = 0; i < rows.length; i++) ...[
            Divider(height: 1, thickness: 1, color: Palette.border, indent: 14, endIndent: 14),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
              child: Row(
                children: [
                  Icon(rows[i].icon, size: 18, color: Palette.muted),
                  const SizedBox(width: 10),
                  Text(rows[i].label, style: TextStyle(fontSize: 12.5, color: Palette.muted)),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      rows[i].value,
                      textAlign: TextAlign.end,
                      textDirection: rows[i].ltr ? TextDirection.ltr : null,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800),
                    ),
                  ),
                  if (rows[i].badge != null) ...[
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: rows[i].badge!.$2.withValues(alpha: 0.13),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(rows[i].badge!.$1,
                          style: TextStyle(
                              fontSize: 10.5, fontWeight: FontWeight.w900, color: rows[i].badge!.$2)),
                    ),
                  ],
                ],
              ),
            ),
          ],
          const SizedBox(height: 4),
        ],
      ),
    );
  }
}

class _Panel extends StatelessWidget {
  const _Panel({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Palette.panel,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Palette.border),
      ),
      child: child,
    );
  }
}
