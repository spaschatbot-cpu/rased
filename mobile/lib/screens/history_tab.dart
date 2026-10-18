import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../i18n.dart';
import '../services/api_client.dart';
import '../services/fleet_store.dart';
import '../theme.dart';
import '../widgets/fleet_widgets.dart';

/// اليوم والساعة بتوقيت السعودية — السيرفر يقسم الأيام به، فالتطبيق يتبعه
/// مهما كانت منطقة الهاتف.
DateTime _riyadh(DateTime t) => t.toUtc().add(const Duration(hours: 3));

String _day(DateTime t) {
  final r = _riyadh(t);
  return '${r.year}-${_two(r.month)}-${_two(r.day)}';
}

String _two(int n) => n.toString().padLeft(2, '0');

String _clock(String iso) {
  final t = DateTime.tryParse(iso);
  if (t == null) return '--:--';
  final r = _riyadh(t);
  return '${_two(r.hour)}:${_two(r.minute)}';
}

String _minutes(num m) {
  final total = m.round();
  final h = total ~/ 60;
  final min = total % 60;
  if (h == 0) return '$min ${tr('hist.min')}';
  return '$h ${tr('hist.h')} $min ${tr('hist.min')}';
}

class _Point {
  _Point(this.point, this.speed, this.at);

  final LatLng point;
  final int speed;
  final String at;
}

class _Segment {
  _Segment.fromJson(Map<String, dynamic> j)
      : from = (j['from'] as num).toInt(),
        to = (j['to'] as num).toInt(),
        startAt = '${j['startAt']}',
        endAt = '${j['endAt']}',
        distance = (j['distance'] as num?)?.toDouble() ?? 0,
        durationMin = (j['durationMin'] as num?)?.toInt() ?? 0;

  final int from;
  final int to;
  final String startAt;
  final String endAt;
  final double distance;
  final int durationMin;
}

/// التتبّع المسبق: تختار مركبة ويومًا، فيُرسم الطريق وتُعاد الرحلة.
class HistoryTab extends StatefulWidget {
  const HistoryTab({
    super.key,
    required this.store,
    required this.api,
    required this.token,
    required this.request,
  });

  final FleetStore store;
  final ApiClient api;
  final String token;

  /// مركبة طُلب فتح مسارها من مكان آخر في التطبيق.
  final ValueNotifier<int?> request;

  @override
  State<HistoryTab> createState() => _HistoryTabState();
}

class _HistoryTabState extends State<HistoryTab> {
  final _map = MapController();
  bool _mapReady = false;

  int? _vehicleId;
  String _date = _day(DateTime.now());
  List<String> _days = [];

  bool _loading = false;
  String? _error;
  List<_Point> _points = [];
  List<_Segment> _trips = [];
  List<_Segment> _stops = [];
  Map<String, dynamic> _stats = {};

  bool _showStops = false;

  /* الإعادة */
  int _cursor = 0;
  Timer? _player;
  int _speed = 4;

  @override
  void initState() {
    super.initState();
    widget.request.addListener(_onRequest);
    /* بعد أول رسم: الطلب قد يكون وصل قبل بناء التبويب */
    WidgetsBinding.instance.addPostFrameCallback((_) => _onRequest());
  }

  @override
  void dispose() {
    widget.request.removeListener(_onRequest);
    _player?.cancel();
    super.dispose();
  }

  void _onRequest() {
    final id = widget.request.value;
    if (id == null) return;
    widget.request.value = null;
    _pickVehicle(id);
  }

  Future<void> _pickVehicle(int id) async {
    setState(() {
      _vehicleId = id;
      _days = [];
    });
    try {
      final days = await widget.api.historyDays(widget.token, id);
      if (!mounted || _vehicleId != id) return;
      days.sort((a, b) => b.compareTo(a));
      setState(() => _days = days);
    } on ApiException {
      // قائمة الأيام مساعدة لا أكثر — اليوم يبقى قابلًا للاختيار من التقويم
    }
    await _load();
  }

  Future<void> _load() async {
    final id = _vehicleId;
    if (id == null) return;
    _stop();
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final day = await widget.api.historyDay(widget.token, id, _date);
      if (!mounted || _vehicleId != id) return;
      final pts = ((day['points'] as List?) ?? []).cast<Map<String, dynamic>>();
      setState(() {
        _points = [
          for (final p in pts)
            _Point(
              LatLng((p['lat'] as num).toDouble(), (p['lng'] as num).toDouble()),
              (p['speed'] as num?)?.toInt() ?? 0,
              '${p['at']}',
            ),
        ];
        _trips = ((day['trips'] as List?) ?? [])
            .cast<Map<String, dynamic>>()
            .map(_Segment.fromJson)
            .toList();
        _stops = ((day['stops'] as List?) ?? [])
            .cast<Map<String, dynamic>>()
            .map(_Segment.fromJson)
            .toList();
        _stats = (day['stats'] as Map<String, dynamic>?) ?? {};
        _cursor = 0;
      });
      _fitTo(0, _points.length - 1);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.isNetworkFailure ? tr('fleet.offline') : e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _fitTo(int from, int to) {
    if (!_mapReady || _points.isEmpty) return;
    final slice = _points.sublist(from.clamp(0, _points.length - 1), (to + 1).clamp(1, _points.length));
    final pts = slice.map((p) => p.point).toList();
    if (pts.length == 1 || pts.every((p) => p == pts.first)) {
      _map.move(pts.first, 16);
      return;
    }
    _map.fitCamera(CameraFit.bounds(
      bounds: LatLngBounds.fromPoints(pts),
      padding: const EdgeInsets.all(40),
      maxZoom: 17,
    ));
  }

  void _togglePlay() {
    if (_player != null) {
      _stop();
      return;
    }
    if (_points.length < 2) return;
    if (_cursor >= _points.length - 1) _cursor = 0;
    _player = Timer.periodic(const Duration(milliseconds: 250), (_) {
      if (!mounted) return;
      setState(() => _cursor = (_cursor + _speed).clamp(0, _points.length - 1));
      if (_mapReady) _map.move(_points[_cursor].point, _map.camera.zoom);
      if (_cursor >= _points.length - 1) _stop();
    });
    setState(() {});
  }

  void _stop() {
    _player?.cancel();
    _player = null;
    if (mounted) setState(() {});
  }

  Future<void> _chooseVehicle() async {
    final vehicles = widget.store.vehicles;
    final id = await showModalBottomSheet<int>(
      context: context,
      backgroundColor: Palette.panel,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (context) => SafeArea(
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.7),
          child: ListView(
            shrinkWrap: true,
            padding: const EdgeInsets.fromLTRB(14, 16, 14, 16),
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(6, 0, 6, 10),
                child: Text(tr('hist.pickVehicle'),
                    style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w900)),
              ),
              for (final v in vehicles)
                ListTile(
                  onTap: () => Navigator.pop(context, v.id),
                  leading: Icon(Icons.local_shipping_outlined, color: statusColor(v.status)),
                  title: Text(v.plate,
                      textDirection: TextDirection.ltr,
                      style: const TextStyle(fontWeight: FontWeight.w900)),
                  subtitle: Text(
                    [if (v.model.isNotEmpty) v.model, if (v.driver.isNotEmpty) v.driver]
                        .join('  ·  '),
                    style: TextStyle(fontSize: 11.5, color: Palette.muted),
                  ),
                  trailing: v.id == _vehicleId
                      ? const Icon(Icons.check_rounded, color: Brand.green)
                      : null,
                ),
            ],
          ),
        ),
      ),
    );
    if (id != null) await _pickVehicle(id);
  }

  Future<void> _setDate(String date) async {
    if (date == _date) return;
    setState(() => _date = date);
    await _load();
  }

  Future<void> _chooseDate() async {
    final current = DateTime.tryParse(_date) ?? DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: current,
      firstDate: DateTime.now().subtract(const Duration(days: 365)),
      lastDate: DateTime.now().add(const Duration(days: 1)),
    );
    if (picked == null) return;
    await _setDate('${picked.year}-${_two(picked.month)}-${_two(picked.day)}');
  }

  @override
  Widget build(BuildContext context) {
    final vehicle = _vehicleId == null ? null : widget.store.byId(_vehicleId!);

    return ListView(
      padding: EdgeInsets.zero,
      children: [
        PageHeader(
          icon: Icons.history_rounded,
          title: tr('fleet.tab.history'),
          subtitle: tr('fleet.header.history'),
        ),
        _FilterBar(
          vehicle: vehicle,
          date: _date,
          today: _day(DateTime.now()),
          days: _days,
          onVehicle: _chooseVehicle,
          onCalendar: _chooseDate,
          onDate: _setDate,
        ),
        if (_vehicleId == null)
          Padding(
            padding: const EdgeInsets.only(top: 60),
            child: _Empty(icon: Icons.history_rounded, text: tr('hist.start')),
          )
        else ...[
          /* ارتفاع ثابت: داخل التمرير لا يوجد ارتفاع تملؤه الخريطة */
          SizedBox(height: 300, child: _mapView()),
          _panel(),
        ],
      ],
    );
  }

  Widget _mapView() {
    final line = _points.map((p) => p.point).toList();
    final played = _player != null || _cursor > 0;

    return Stack(
      fit: StackFit.expand,
      children: [
        FlutterMap(
          mapController: _map,
          options: MapOptions(
            initialCenter: const LatLng(24.7136, 46.6753),
            initialZoom: 6,
            interactionOptions: const InteractionOptions(
              flags: InteractiveFlag.all & ~InteractiveFlag.rotate,
            ),
            onMapReady: () {
              _mapReady = true;
              if (_points.isNotEmpty) _fitTo(0, _points.length - 1);
            },
          ),
          children: [
            TileLayer(
              urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
              userAgentPackageName: 'sa.mirsad.mirsad_driver',
              maxNativeZoom: 19,
              errorTileCallback: (_, __, ___) {},
            ),
            if (line.length > 1)
              PolylineLayer(
                polylines: [
                  Polyline(points: line, strokeWidth: 5, color: Brand.green.withValues(alpha: 0.85)),
                  if (played && _cursor > 0)
                    Polyline(
                      points: line.sublist(0, _cursor + 1),
                      strokeWidth: 5,
                      color: const Color(0xFF38BDF8),
                    ),
                ],
              ),
            MarkerLayer(
              markers: [
                for (final s in _stops)
                  Marker(
                    point: _points[s.from].point,
                    width: 24,
                    height: 24,
                    child: const _Badge(color: Brand.warn, icon: Icons.local_parking_rounded),
                  ),
                if (line.isNotEmpty)
                  Marker(
                    point: line.first,
                    width: 26,
                    height: 26,
                    child: const _Badge(color: Brand.green, icon: Icons.play_arrow_rounded),
                  ),
                if (line.length > 1)
                  Marker(
                    point: line.last,
                    width: 26,
                    height: 26,
                    child: const _Badge(color: Brand.danger, icon: Icons.flag_rounded),
                  ),
                if (played && line.isNotEmpty)
                  Marker(
                    point: line[_cursor],
                    width: 34,
                    height: 34,
                    child: const _Badge(
                        color: Color(0xFF38BDF8), icon: Icons.local_shipping_rounded, size: 34),
                  ),
              ],
            ),
          ],
        ),
        if (_loading) const Center(child: CircularProgressIndicator()),
        if (!_loading && _error == null && _points.isEmpty)
          _Empty(icon: Icons.route_outlined, text: tr('hist.noTrail'), boxed: true),
        if (_error != null) _Empty(icon: Icons.cloud_off_rounded, text: _error!, boxed: true),
      ],
    );
  }

  Widget _panel() {
    final stats = _stats;
    final current = _points.isEmpty ? null : _points[_cursor];

    return Container(
      color: Colors.transparent,
      child: Column(
        children: [
          /* الإجماليات */
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 4),
            child: Row(
              children: [
                _Stat(label: tr('hist.distance'), value: '${stats['totalDistance'] ?? 0} ${tr('hist.km')}'),
                _Stat(label: tr('hist.driving'), value: _minutes((stats['drivingMin'] as num?) ?? 0)),
                _Stat(label: tr('hist.idle'), value: _minutes((stats['idleMin'] as num?) ?? 0)),
                _Stat(label: tr('hist.maxSpeed'), value: '${stats['maxSpeed'] ?? 0}'),
              ],
            ),
          ),

          /* الإعادة */
          if (_points.length > 1)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 6),
              child: Row(
                children: [
                  IconButton(
                    onPressed: _togglePlay,
                    icon: Icon(
                      _player == null ? Icons.play_circle_fill_rounded : Icons.pause_circle_filled_rounded,
                      size: 34,
                      color: Brand.green,
                    ),
                  ),
                  Expanded(
                    child: Slider(
                      value: _cursor.toDouble(),
                      max: (_points.length - 1).toDouble(),
                      activeColor: const Color(0xFF38BDF8),
                      onChanged: (v) {
                        setState(() => _cursor = v.round());
                        if (_mapReady) _map.move(_points[_cursor].point, _map.camera.zoom);
                      },
                    ),
                  ),
                  InkWell(
                    onTap: () => setState(() => _speed = switch (_speed) { 1 => 4, 4 => 16, _ => 1 }),
                    borderRadius: BorderRadius.circular(8),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
                      decoration: BoxDecoration(
                        border: Border.all(color: Palette.border),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text('${_speed}x',
                          textDirection: TextDirection.ltr,
                          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w900)),
                    ),
                  ),
                  const SizedBox(width: 8),
                ],
              ),
            ),
          if (current != null && _points.length > 1)
            Text(
              '${_clock(current.at)}  ·  ${current.speed} ${tr('fleet.kmh')}',
              style: TextStyle(fontSize: 11.5, color: Palette.muted),
            ),

          /* الرحلات والوقفات */
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 6, 12, 4),
            child: SegmentedButton<bool>(
              segments: [
                ButtonSegment(value: false, label: Text('${tr('hist.trips')} ${_trips.length}')),
                ButtonSegment(value: true, label: Text('${tr('hist.stops')} ${_stops.length}')),
              ],
              selected: {_showStops},
              showSelectedIcon: false,
              onSelectionChanged: (s) => setState(() => _showStops = s.first),
              style: const ButtonStyle(visualDensity: VisualDensity.compact),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 2, 12, 16),
            child: Column(
              children: [
                for (final (i, s) in (_showStops ? _stops : _trips).indexed)
                  _SegmentTile(
                    index: i + 1,
                    segment: s,
                    stop: _showStops,
                    onTap: () {
                      _stop();
                      setState(() => _cursor = s.from);
                      _fitTo(s.from, s.to);
                    },
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// الفلتر: المركبة في سطر، واليوم في سطر بأسهم للتنقّل واختصارات سريعة.
class _FilterBar extends StatelessWidget {
  const _FilterBar({
    required this.vehicle,
    required this.date,
    required this.today,
    required this.days,
    required this.onVehicle,
    required this.onCalendar,
    required this.onDate,
  });

  final FleetVehicle? vehicle;
  final String date;
  final String today;
  final List<String> days;
  final VoidCallback onVehicle;
  final VoidCallback onCalendar;
  final ValueChanged<String> onDate;

  static String _shift(String day, int by) {
    final d = DateTime.parse(day).add(Duration(days: by));
    return '${d.year}-${_two(d.month)}-${_two(d.day)}';
  }

  @override
  Widget build(BuildContext context) {
    final yesterday = _shift(today, -1);
    final loc = MaterialLocalizations.of(context);
    final label = date == today
        ? tr('hist.today')
        : date == yesterday
            ? tr('hist.yesterday')
            : loc.formatMediumDate(DateTime.parse(date));
    final v = vehicle;
    final tone = v == null ? Palette.muted : statusColor(v.status);

    return Container(
      margin: const EdgeInsets.fromLTRB(12, 8, 12, 8),
      padding: const EdgeInsets.all(8),
      decoration: glassSurface(radius: 16),
      child: Column(
        children: [
          /* المركبة */
          InkWell(
            onTap: onVehicle,
            borderRadius: BorderRadius.circular(12),
            child: Container(
              height: 42,
              padding: const EdgeInsets.symmetric(horizontal: 8),
              decoration: BoxDecoration(
                color: Palette.bg,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  Container(
                    width: 28,
                    height: 28,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: tone.withValues(alpha: 0.14),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(Icons.local_shipping_outlined, size: 16, color: tone),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      v?.plate ?? tr('hist.pickVehicle'),
                      textDirection: v == null ? null : TextDirection.ltr,
                      textAlign: TextAlign.start,
                      style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w900),
                    ),
                  ),
                  if (v != null && v.driver.isNotEmpty)
                    Flexible(
                      child: Text(v.driver,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 11.5, color: Palette.muted)),
                    ),
                  const SizedBox(width: 4),
                  Icon(Icons.unfold_more_rounded, size: 18, color: Palette.muted),
                ],
              ),
            ),
          ),
          const SizedBox(height: 6),

          /* اليوم: سهم للأقدم، والتاريخ يفتح التقويم، وسهم للأحدث حتى اليوم */
          Row(
            children: [
              _ArrowButton(
                back: true,
                onTap: () => onDate(_shift(date, -1)),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: InkWell(
                  onTap: onCalendar,
                  borderRadius: BorderRadius.circular(12),
                  child: Container(
                    height: 42,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: Palette.bg,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.calendar_month_rounded, size: 17, color: Brand.green),
                        const SizedBox(width: 8),
                        Flexible(
                          child: Text(label,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w900)),
                        ),
                        if (days.contains(date)) ...[
                          const SizedBox(width: 6),
                          Container(
                            width: 7,
                            height: 7,
                            decoration:
                                const BoxDecoration(color: Brand.green, shape: BoxShape.circle),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 6),
              _ArrowButton(
                back: false,
                onTap: date.compareTo(today) >= 0 ? null : () => onDate(_shift(date, 1)),
              ),
            ],
          ),

        ],
      ),
    );
  }
}

/// سهم التنقّل بين الأيام. [back] يرجع للأقدم، واتجاهه يتبع لغة الواجهة.
class _ArrowButton extends StatelessWidget {
  const _ArrowButton({required this.back, required this.onTap});

  final bool back;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final rtl = Directionality.of(context) == TextDirection.rtl;
    final icon = back == rtl ? Icons.chevron_right_rounded : Icons.chevron_left_rounded;
    return Material(
      color: Palette.bg,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: SizedBox(
          width: 42,
          height: 42,
          child: Icon(icon, color: onTap == null ? Palette.border : Palette.text),
        ),
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        children: [
          Text(value,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w900)),
          Text(label, style: TextStyle(fontSize: 10, color: Palette.muted)),
        ],
      ),
    );
  }
}

class _SegmentTile extends StatelessWidget {
  const _SegmentTile({
    required this.index,
    required this.segment,
    required this.stop,
    required this.onTap,
  });

  final int index;
  final _Segment segment;
  final bool stop;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final tone = stop ? Brand.warn : Brand.green;
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Material(
        color: Palette.glass,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 13,
                  backgroundColor: tone.withValues(alpha: 0.15),
                  child: Text('$index',
                      style: TextStyle(fontSize: 11, fontWeight: FontWeight.w900, color: tone)),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    '${_clock(segment.startAt)} ← ${_clock(segment.endAt)}',
                    style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800),
                  ),
                ),
                Text(
                  stop
                      ? _minutes(segment.durationMin)
                      : '${segment.distance} ${tr('hist.km')}  ·  ${_minutes(segment.durationMin)}',
                  style: TextStyle(fontSize: 11.5, color: Palette.muted),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge({required this.color, required this.icon, this.size = 24});

  final Color color;
  final IconData icon;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: color,
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white, width: 2),
      ),
      child: Icon(icon, size: size * 0.55, color: Colors.white),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty({required this.icon, required this.text, this.boxed = false});

  final IconData icon;
  final String text;
  final bool boxed;

  @override
  Widget build(BuildContext context) {
    final body = Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 32, color: Palette.muted),
        const SizedBox(height: 10),
        Text(text,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 13, height: 1.5, fontWeight: FontWeight.w700)),
      ],
    );
    return Center(
      child: boxed
          ? Container(
              margin: const EdgeInsets.symmetric(horizontal: 30),
              padding: const EdgeInsets.all(16),
              decoration: glassSurface(radius: 16),
              child: body,
            )
          : Padding(padding: const EdgeInsets.all(30), child: body),
    );
  }
}
