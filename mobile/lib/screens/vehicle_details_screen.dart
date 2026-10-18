import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';

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

/// صفحة المركبة: بطاقة الهوية، ثم تبويبات النظرة العامة والرحلات والسائق
/// وسجل التعيينات والتفاصيل. تُحدَّث كل خمس ثوانٍ ما دامت مفتوحة.
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
  Map<String, dynamic>? get _driver => _data?['driver'] as Map<String, dynamic>?;

  @override
  Widget build(BuildContext context) {
    final tabs = [
      tr('vd.tab.overview'),
      tr('vd.tab.trips'),
      tr('vd.tab.driver'),
      tr('vd.tab.assignments'),
      tr('vd.tab.details'),
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
                  _HeaderCard(vehicle: _vehicle, position: _position, driver: _driver),
                  _Tabs(labels: tabs, index: _tab, onChanged: (i) => setState(() => _tab = i)),
                  const SizedBox(height: 12),
                  switch (_tab) {
                    0 => _overview(),
                    1 => _trips(),
                    2 => _driverTab(),
                    3 => _assignments(),
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
    final point = pos == null
        ? null
        : LatLng((pos['lat'] as num).toDouble(), (pos['lng'] as num).toDouble());
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
                    child: Text(tr('fleet.neverReported'),
                        style: TextStyle(fontSize: 13, color: Palette.muted)),
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

          Row(
            children: [
              Expanded(
                child: _Metric(
                  icon: Icons.power_settings_new_rounded,
                  label: tr('vd.ignition'),
                  value: ignitionOn ? tr('vd.on') : tr('vd.off'),
                  tone: ignitionOn ? Brand.green : Brand.danger,
                  note: ignition == null && pos != null ? tr('vd.inferred') : null,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _Metric(
                  icon: Icons.speed_rounded,
                  label: tr('fleet.speed'),
                  value: '$speed ${tr('fleet.kmh')}',
                  tone: const Color(0xFF38BDF8),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _Metric(
                  icon: Icons.route_rounded,
                  label: tr('vd.todayDistance'),
                  value: '${stats['totalDistance'] ?? 0} ${tr('hist.km')}',
                  tone: Brand.green,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _Metric(
                  icon: power != null ? Icons.electrical_services_rounded : Icons.battery_std_rounded,
                  label: power != null ? tr('vd.power') : tr('fleet.battery'),
                  value: power != null
                      ? '${power.toStringAsFixed(1)} V'
                      : battery != null
                          ? '$battery%'
                          : '—',
                  tone: Brand.warn,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Future<void> _open(String url) async {
    final ok = await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    if (!ok && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(tr('vd.cannotOpen'))));
    }
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
                      label: tr('hist.distance'),
                      value: '${stats['totalDistance'] ?? 0} ${tr('hist.km')}')),
              const SizedBox(width: 8),
              Expanded(
                  child: _Mini(label: tr('hist.maxSpeed'), value: '${stats['maxSpeed'] ?? 0}')),
            ],
          ),
          const SizedBox(height: 12),
          Text(tr('vd.todayTrips'),
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w900, color: Palette.muted)),
          const SizedBox(height: 8),
          if (trips.isEmpty)
            _Panel(
              child: Text(tr('vd.noTrips'),
                  textAlign: TextAlign.center, style: TextStyle(color: Palette.muted)),
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
                      Text('${t['distance'] ?? 0} ${tr('hist.km')} · ${t['durationMin'] ?? 0} ${tr('hist.min')}',
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

  /* ───────────────────────── السائق ───────────────────────── */

  Widget _driverTab() {
    final d = _driver;
    if (d == null) {
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: _Panel(
          child: Text(tr('fleet.noDriver'),
              textAlign: TextAlign.center, style: TextStyle(color: Palette.muted)),
        ),
      );
    }
    final name = _pick(d, 'nameAr', 'nameEn');
    final phone = '${d['phone'] ?? ''}'.trim();

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _Panel(
            child: Column(
              children: [
                _Avatar(name: name, size: 64),
                const SizedBox(height: 10),
                Text(name, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900)),
                if (phone.isNotEmpty)
                  Text(phone,
                      textDirection: TextDirection.ltr,
                      style: TextStyle(fontSize: 12.5, color: Palette.muted)),
              ],
            ),
          ),
          const SizedBox(height: 10),
          if ('${d['username'] ?? ''}'.isNotEmpty)
            _Field(label: tr('profile.username'), value: '${d['username']}'),
          if (d['lastLoginAt'] != null)
            _Field(
                label: tr('vd.lastLogin'),
                value: '${_date(d['lastLoginAt'] as String?)}  ${_clock(d['lastLoginAt'] as String?)}'),
          if (phone.isNotEmpty) ...[
            const SizedBox(height: 8),
            FilledButton.icon(
              onPressed: () => _open('tel:$phone'),
              icon: const Icon(Icons.call_rounded, size: 19),
              label: Text(tr('vd.call')),
            ),
          ],
        ],
      ),
    );
  }

  /* ───────────────────────── سجل التعيينات ───────────────────────── */

  Widget _assignments() {
    final rows = ((_data?['assignments'] as List?) ?? const []).cast<Map<String, dynamic>>();
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        children: [
          if (rows.isEmpty)
            _Panel(
              child: Text(tr('vd.noAssignments'),
                  textAlign: TextAlign.center, style: TextStyle(color: Palette.muted)),
            )
          else
            for (final r in rows)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _Panel(
                  child: Row(
                    children: [
                      Icon(
                        r['action'] == 'assigned' ? Icons.person_add_alt_1_rounded : Icons.person_remove_rounded,
                        color: r['action'] == 'assigned' ? Brand.green : Brand.danger,
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(_pick(r, 'nameAr', 'nameEn'),
                                style: const TextStyle(fontWeight: FontWeight.w900)),
                            Text(
                              r['action'] == 'assigned' ? tr('vd.assigned') : tr('vd.unassigned'),
                              style: TextStyle(fontSize: 11.5, color: Palette.muted),
                            ),
                          ],
                        ),
                      ),
                      Text('${_date(r['at'] as String?)}\n${_clock(r['at'] as String?)}',
                          textAlign: TextAlign.end,
                          style: TextStyle(fontSize: 11, color: Palette.muted)),
                    ],
                  ),
                ),
              ),
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
    final expired = expiry != null && (DateTime.tryParse(expiry)?.isBefore(DateTime.now()) ?? false);

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        children: [
          _Field(label: tr('vd.plate'), value: val(v['plate']), ltr: true),
          _Field(label: tr('fleet.model'), value: val(_pick(v, 'modelAr', 'modelEn'))),
          _Field(label: tr('vd.branch'), value: val(_pick(group, 'nameAr', 'nameEn'))),
          _Field(label: tr('fleet.imei'), value: val(v['imei']), ltr: true),
          _Field(label: tr('vd.sim'), value: val(v['sim']), ltr: true),
          _Field(
            label: tr('vd.simExpiry'),
            value: expiry == null ? '—' : _date(expiry),
            tone: expired ? Brand.danger : null,
          ),
          _Field(label: tr('vd.odometer'), value: '${val(v['odometer'])} ${tr('hist.km')}'),
          _Field(label: tr('vd.engineHours'), value: '${val(v['engineHours'])} ${tr('hist.h')}'),
          _Field(label: tr('vd.speedLimit'), value: '${val(v['speedLimit'])} ${tr('fleet.kmh')}'),
          _Field(label: tr('vd.createdAt'), value: _date(v['createdAt'] as String?)),
        ],
      ),
    );
  }
}

/* ───────────────────────── بطاقة الهوية ───────────────────────── */

class _HeaderCard extends StatelessWidget {
  const _HeaderCard({required this.vehicle, required this.position, required this.driver});

  final Map<String, dynamic> vehicle;
  final Map<String, dynamic>? position;
  final Map<String, dynamic>? driver;

  @override
  Widget build(BuildContext context) {
    final status = '${position?['status'] ?? 'offline'}';
    final plate = '${vehicle['plate'] ?? ''}';
    final name = _pick(driver, 'nameAr', 'nameEn');
    final phone = '${driver?['phone'] ?? ''}'.trim();

    return Container(
      margin: const EdgeInsets.fromLTRB(16, 4, 16, 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Palette.panel,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Palette.border),
      ),
      child: Row(
        children: [
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              color: statusColor(status).withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Icon(Icons.directions_car_filled_rounded, size: 34, color: statusColor(status)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                StatusPill(status: status),
                const SizedBox(height: 8),
                SaudiPlate(plate: plate),
              ],
            ),
          ),
          if (name.isNotEmpty) ...[
            const SizedBox(width: 10),
            SizedBox(
              width: 82,
              child: Column(
                children: [
                  _Avatar(name: name, size: 40),
                  const SizedBox(height: 4),
                  Text(name,
                      maxLines: 2,
                      textAlign: TextAlign.center,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800)),
                  if (phone.isNotEmpty)
                    Text(phone,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        textDirection: TextDirection.ltr,
                        style: TextStyle(fontSize: 9.5, color: Palette.muted)),
                ],
              ),
            ),
          ],
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
    'A': 'ا', 'B': 'ب', 'J': 'ح', 'D': 'د', 'R': 'ر', 'S': 'س', 'X': 'ص', 'T': 'ط',
    'E': 'ع', 'G': 'ق', 'K': 'ك', 'L': 'ل', 'Z': 'م', 'N': 'ن', 'H': 'هـ', 'U': 'و', 'V': 'ى',
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

class _Avatar extends StatelessWidget {
  const _Avatar({required this.name, required this.size});

  final String name;
  final double size;

  @override
  Widget build(BuildContext context) {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty);
    final initials = parts.isEmpty ? '؟' : parts.take(2).map((p) => p.substring(0, 1)).join();
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: const BoxDecoration(
        gradient: LinearGradient(colors: [Brand.green, Color(0xFF00A87C)]),
        shape: BoxShape.circle,
      ),
      child: Text(initials,
          style: TextStyle(fontSize: size * 0.34, fontWeight: FontWeight.w900, color: Brand.onGreen)),
    );
  }
}

/* ───────────────────────── أجزاء صغيرة ───────────────────────── */

class _Tabs extends StatelessWidget {
  const _Tabs({required this.labels, required this.index, required this.onChanged});

  final List<String> labels;
  final int index;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 46,
      decoration: BoxDecoration(border: Border(bottom: BorderSide(color: Palette.border))),
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 10),
        children: [
          for (var i = 0; i < labels.length; i++)
            InkWell(
              onTap: () => onChanged(i),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  border: Border(
                    bottom: BorderSide(
                      color: i == index ? Brand.green : Colors.transparent,
                      width: 2.5,
                    ),
                  ),
                ),
                child: Text(
                  labels[i],
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: i == index ? FontWeight.w900 : FontWeight.w700,
                    color: i == index ? Palette.text : Palette.muted,
                  ),
                ),
              ),
            ),
        ],
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

class _Metric extends StatelessWidget {
  const _Metric({
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

  @override
  Widget build(BuildContext context) {
    return _Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: tone.withValues(alpha: 0.13),
                  shape: BoxShape.circle,
                ),
                child: Icon(icon, size: 17, color: tone),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 12, color: Palette.muted)),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(value, style: TextStyle(fontSize: 19, fontWeight: FontWeight.w900, color: tone)),
          if (note != null)
            Text(note!, style: TextStyle(fontSize: 10, color: Palette.muted)),
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

class _Field extends StatelessWidget {
  const _Field({required this.label, required this.value, this.ltr = false, this.tone});

  final String label;
  final String value;
  final bool ltr;
  final Color? tone;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
      decoration: BoxDecoration(
        color: Palette.panel,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Palette.border),
      ),
      child: Row(
        children: [
          Text(label, style: TextStyle(fontSize: 12.5, color: Palette.muted)),
          const Spacer(),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.end,
              textDirection: ltr ? TextDirection.ltr : null,
              style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: tone ?? Palette.text),
            ),
          ),
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
