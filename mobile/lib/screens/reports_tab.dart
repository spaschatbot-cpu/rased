import 'package:flutter/material.dart';

import '../i18n.dart';
import '../services/api_client.dart';
import '../services/fleet_store.dart';
import '../services/report_pdf.dart';
import '../theme.dart';
import '../widgets/fleet_widgets.dart';

String _two(int n) => n.toString().padLeft(2, '0');
String _iso(DateTime d) => '${d.year}-${_two(d.month)}-${_two(d.day)}';
String _fmt(DateTime d) => '${_two(d.day)}/${_two(d.month)}/${d.year}';

/// اليوم بتوقيت السعودية — كما يقسم السيرفر الأيام.
DateTime _today() {
  final r = DateTime.now().toUtc().add(const Duration(hours: 3));
  return DateTime(r.year, r.month, r.day);
}

String _minutes(num m) {
  final total = m.round();
  if (total < 60) return '$total ${tr('hist.min')}';
  return '${total ~/ 60} ${tr('hist.h')} ${total % 60} ${tr('hist.min')}';
}

/// التقارير: نوع التقرير، والفترة، والمركبات — ثم ملخّص الفترة وصفوف التقرير.
///
/// الأرقام كلها من `/api/reports` — نفس ما تعرضه صفحة التقارير في الموقع.
class ReportsTab extends StatefulWidget {
  const ReportsTab({
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
  State<ReportsTab> createState() => _ReportsTabState();
}

class _ReportsTabState extends State<ReportsTab> {
  static const _types = [
    ('general', Icons.summarize_rounded),
    ('driving', Icons.route_rounded),
    ('speed', Icons.speed_rounded),
    /* التبريد (sfda) مخفي حتى يُركَّب جهاز بحساس حرارة — بقيّة الصفحة ما
       زالت تعرف كيف تعرضه، فإعادته سطر واحد */
  ];

  String _type = 'general';
  String _preset = 'week';
  late DateTime _from = _today().subtract(const Duration(days: 6));
  late DateTime _to = _today();
  final Set<int> _vehicles = {};

  Map<String, dynamic>? _data;
  bool _loading = false;
  String? _error;

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
      final data = await widget.api.report(widget.token, _type, _iso(_from), _iso(_to),
          vehicles: _vehicles.toList());
      if (mounted) setState(() => _data = data);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.isNetworkFailure ? tr('fleet.offline') : e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _setPreset(String p) {
    final t = _today();
    setState(() {
      _preset = p;
      switch (p) {
        case 'today':
          _from = _to = t;
        case 'yesterday':
          _from = _to = t.subtract(const Duration(days: 1));
        case 'month':
          _from = t.subtract(const Duration(days: 29));
          _to = t;
        default:
          _from = t.subtract(const Duration(days: 6));
          _to = t;
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
    /* السيرفر يقبل ٩٢ يومًا كحدّ أقصى */
    if (picked.end.difference(start).inDays > 91) start = picked.end.subtract(const Duration(days: 91));
    setState(() {
      _preset = 'custom';
      _from = start;
      _to = picked.end;
    });
    _load();
  }

  Future<void> _openPeriod() async {
    final choice = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Palette.panel,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(22))),
      builder: (context) => SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(tr('dash.range.pick'), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900)),
              const SizedBox(height: 10),
              for (final (p, icon) in [
                ('today', Icons.today_rounded),
                ('yesterday', Icons.history_toggle_off_rounded),
                ('week', Icons.date_range_rounded),
                ('month', Icons.calendar_view_month_rounded),
                ('custom', Icons.edit_calendar_rounded),
              ])
                _SheetOption(
                  icon: icon,
                  label: tr('dash.range.$p'),
                  selected: _preset == p,
                  onTap: () => Navigator.pop(context, p),
                ),
            ],
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

  bool _exporting = false;

  String get _periodText => _from == _to ? _fmt(_from) : '${_fmt(_from)} — ${_fmt(_to)}';

  /// الجدول نفسه الذي تعرضه الصفحة، بأعمدة تناسب نوع التقرير.
  (List<String>, List<List<String>>) _table(List<Map<String, dynamic>> rows) {
    String day(Map<String, dynamic> r) {
      final d = r['day'] == null ? null : DateTime.tryParse('${r['day']}');
      return d == null ? '' : '${_two(d.day)}/${_two(d.month)}/${d.year}';
    }

    return switch (_type) {
      'general' => (
          [tr('vd.plate'), tr('hist.distance'), tr('dash.driving'), tr('hist.maxSpeed'),
            tr('dash.avgSpeed'), tr('hist.stops'), tr('rep.violations')],
          [
            for (final r in rows)
              ['${r['plate']}', '${r['distance']} ${tr('hist.km')}', '${r['engineHours']} ${tr('hist.h')}',
                '${r['maxSpeed']}', '${r['avgSpeed']}', '${r['stops']}', '${r['violations']}'],
          ],
        ),
      'driving' => (
          [tr('vd.plate'), tr('pdf.date'), tr('pdf.from'), tr('pdf.to'), tr('rep.duration'),
            tr('hist.distance'), tr('hist.maxSpeed'), tr('hist.stops')],
          [
            for (final r in rows)
              ['${r['plate']}', day(r), '${r['start']}', '${r['end']}', _minutes((r['durationMin'] as num?) ?? 0),
                '${r['distance']} ${tr('hist.km')}', '${r['maxSpeed']}', '${r['stops']}'],
          ],
        ),
      _ => (
          [tr('vd.plate'), tr('pdf.date'), tr('pdf.time'), tr('rep.peak'), tr('rep.limit'),
            tr('rep.over'), tr('rep.duration'), tr('fleet.address')],
          [
            for (final r in rows)
              ['${r['plate']}', day(r), '${r['at']}', '${r['speed']}', '${r['limit']}',
                '+${((r['speed'] as num?) ?? 0) - ((r['limit'] as num?) ?? 0)}',
                '${r['durationSec']} ${tr('rep.sec')}',
                '${AppLocale.isArabic ? r['addressAr'] : r['addressEn']}'],
          ],
        ),
    };
  }

  Future<void> _exportPdf() async {
    final data = _data;
    if (data == null || _exporting) return;
    setState(() => _exporting = true);
    try {
      final rows = ((data['rows'] as List?) ?? const []).cast<Map<String, dynamic>>();
      final (columns, table) = _table(rows);
      await shareReportPdf(
        ReportDoc(
          title: '${tr('rep.title')} — ${tr('rep.type.$_type')}',
          period: _periodText,
          vehicles: _vehicles.isEmpty ? tr('fleet.allVehicles') : tr1('rep.nVehicles', _vehicles.length),
          summary: [for (final c in _summaryCells(rows)) (c.$3, c.$4)],
          columns: columns,
          rows: table,
        ),
        'autotrack-$_type-${_iso(_from)}_${_iso(_to)}.pdf',
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(tr('pdf.failed'))));
      }
    } finally {
      if (mounted) setState(() => _exporting = false);
    }
  }

  Future<void> _openVehicles() async {
    final picked = await showModalBottomSheet<Set<int>>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Palette.panel,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(22))),
      builder: (context) => _VehiclePicker(vehicles: widget.store.vehicles, selected: _vehicles),
    );
    if (picked == null) return;
    setState(() {
      _vehicles
        ..clear()
        ..addAll(picked);
    });
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final rows = ((_data?['rows'] as List?) ?? const []).cast<Map<String, dynamic>>();
    final vehiclesLabel = _vehicles.isEmpty ? tr('fleet.allVehicles') : tr1('rep.nVehicles', _vehicles.length);

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.only(bottom: 24),
        children: [
          PageHeader(
            icon: Icons.assessment_rounded,
            title: tr('rep.title'),
            trailing: FilledButton.icon(
              onPressed: _data == null || _loading || _exporting ? null : _exportPdf,
              style: FilledButton.styleFrom(
                minimumSize: const Size(0, 40),
                padding: const EdgeInsets.symmetric(horizontal: 14),
                textStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w900),
              ),
              icon: _exporting
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Brand.onGreen),
                    )
                  : const Icon(Icons.picture_as_pdf_rounded, size: 18),
              label: Text(tr('pdf.export')),
            ),
          ),

          /* نوع التقرير: أربعة أزرار متساوية */
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: Row(
              children: [
                for (final (i, t) in _types.indexed) ...[
                  if (i > 0) const SizedBox(width: 8),
                  Expanded(
                    child: _TypeTile(
                      icon: t.$2,
                      label: tr('rep.type.${t.$1}'),
                      selected: _type == t.$1,
                      onTap: () {
                        if (_type == t.$1) return;
                        setState(() {
                          _type = t.$1;
                          _data = null;
                        });
                        _load();
                      },
                    ),
                  ),
                ],
              ],
            ),
          ),

          /* الفلتر: الفترة والمركبات في بطاقة واحدة */
          Container(
            margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            decoration: BoxDecoration(
              color: Palette.glass,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: Palette.glassEdge),
            ),
            child: Column(
              children: [
                _FilterRow(
                  icon: Icons.calendar_month_rounded,
                  title: _preset == 'custom' ? tr('dash.range.custom') : tr('dash.range.$_preset'),
                  value: _periodText,
                  ltrValue: true,
                  onTap: _openPeriod,
                ),
                Divider(height: 1, color: Palette.glassEdge),
                _FilterRow(
                  icon: Icons.local_shipping_rounded,
                  title: tr('rep.vehicles'),
                  value: vehiclesLabel,
                  onTap: _openVehicles,
                ),
              ],
            ),
          ),

          if (_error != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
              child: Text(_error!, style: const TextStyle(fontSize: 12, color: Brand.danger)),
            ),

          const SizedBox(height: 14),
          if (_loading && _data == null)
            const Padding(
              padding: EdgeInsets.only(top: 40),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (_data != null) ...[
            if (_loading)
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 16),
                child: LinearProgressIndicator(minHeight: 2),
              ),
            _summary(rows),
            const SizedBox(height: 12),
            if (rows.isEmpty)
              _Empty(
                text: _data?['unsupported'] != null ? tr('rep.noSensor') : tr('rep.empty'),
              )
            else
              for (final r in rows)
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                  child: _row(r),
                ),
          ],
        ],
      ),
    );
  }

  /* ───────────────────────── الملخّص ───────────────────────── */

  List<(IconData, Color, String, String)> _summaryCells(List<Map<String, dynamic>> rows) {
    num sum(String k) => rows.fold<num>(0, (s, r) => s + ((r[k] as num?) ?? 0));
    num max(String k) => rows.fold<num>(0, (s, r) => ((r[k] as num?) ?? 0) > s ? (r[k] as num) : s);

    return switch (_type) {
      'general' => [
          (Icons.route_rounded, Brand.green, tr('hist.distance'), '${sum('distance').toStringAsFixed(1)} ${tr('hist.km')}'),
          (Icons.timer_rounded, const Color(0xFF38BDF8), tr('dash.driving'), '${sum('engineHours').toStringAsFixed(1)} ${tr('hist.h')}'),
          (Icons.speed_rounded, Brand.warn, tr('hist.maxSpeed'), '${max('maxSpeed')} ${tr('fleet.kmh')}'),
          (Icons.warning_amber_rounded, Brand.danger, tr('rep.violations'), '${sum('violations')}'),
        ],
      'driving' => [
          (Icons.flag_rounded, Brand.green, tr('hist.trips'), '${rows.length}'),
          (Icons.route_rounded, const Color(0xFF38BDF8), tr('hist.distance'), '${sum('distance').toStringAsFixed(1)} ${tr('hist.km')}'),
          (Icons.timer_rounded, const Color(0xFFA78BFA), tr('dash.driving'), _minutes(sum('durationMin'))),
          (Icons.speed_rounded, Brand.warn, tr('hist.maxSpeed'), '${max('maxSpeed')} ${tr('fleet.kmh')}'),
        ],
      'speed' => [
          (Icons.warning_amber_rounded, Brand.danger, tr('rep.violations'), '${rows.length}'),
          (Icons.speed_rounded, Brand.warn, tr('rep.peak'), '${max('speed')} ${tr('fleet.kmh')}'),
          (Icons.local_shipping_rounded, const Color(0xFF38BDF8), tr('rep.vehiclesInvolved'),
              '${rows.map((r) => r['vehicleId']).toSet().length}'),
          (Icons.timer_rounded, const Color(0xFFA78BFA), tr('rep.totalTime'), '${(sum('durationSec') / 60).round()} ${tr('hist.min')}'),
        ],
      _ => [
          (Icons.thermostat_rounded, const Color(0xFF38BDF8), tr('rep.readings'), '${rows.length}'),
          (Icons.arrow_upward_rounded, Brand.danger, tr('rep.maxTemp'),
              rows.isEmpty ? '—' : '${max('temperature')}°'),
          (Icons.water_drop_rounded, Brand.green, tr('rep.humidity'),
              rows.isEmpty ? '—' : '${max('humidity')}%'),
          (Icons.local_shipping_rounded, Brand.warn, tr('rep.vehiclesInvolved'),
              '${rows.map((r) => r['vehicleId']).toSet().length}'),
        ],
    };
  }

  Widget _summary(List<Map<String, dynamic>> rows) {
    final cells = _summaryCells(rows);

    Widget cell((IconData, Color, String, String) c) => Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(color: c.$2.withValues(alpha: 0.13), shape: BoxShape.circle),
                child: Icon(c.$1, size: 18, color: c.$2),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(c.$4,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: Palette.text)),
                    Text(c.$3,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 10.5, color: Palette.muted)),
                  ],
                ),
              ),
            ],
          ),
        );

    Widget pair(int a) => IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(child: cell(cells[a])),
              VerticalDivider(width: 1, color: Palette.glassEdge),
              Expanded(child: cell(cells[a + 1])),
            ],
          ),
        );

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      decoration: BoxDecoration(
        color: Palette.glass,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Palette.glassEdge),
      ),
      child: Column(children: [pair(0), Divider(height: 1, color: Palette.glassEdge), pair(2)]),
    );
  }

  /* ───────────────────────── الصفوف ───────────────────────── */

  Widget _row(Map<String, dynamic> r) {
    final plate = '${r['plate'] ?? ''}';
    final id = (r['vehicleId'] as num?)?.toInt();
    final day = r['day'] == null ? null : DateTime.tryParse('${r['day']}');
    final dayText = day == null ? '' : '${_two(day.day)}/${_two(day.month)}  ';

    final (String sub, List<(String, String)> facts, Color tone) = switch (_type) {
      'general' => (
          '',
          [
            (tr('hist.distance'), '${r['distance']} ${tr('hist.km')}'),
            (tr('dash.driving'), '${r['engineHours']} ${tr('hist.h')}'),
            (tr('hist.maxSpeed'), '${r['maxSpeed']}'),
            (tr('rep.violations'), '${r['violations']}'),
          ],
          ((r['violations'] as num?) ?? 0) > 0 ? Brand.danger : Brand.green,
        ),
      'driving' => (
          '$dayText${r['start']} ← ${r['end']}',
          [
            (tr('hist.distance'), '${r['distance']} ${tr('hist.km')}'),
            (tr('rep.duration'), _minutes((r['durationMin'] as num?) ?? 0)),
            (tr('hist.maxSpeed'), '${r['maxSpeed']}'),
            (tr('hist.stops'), '${r['stops']}'),
          ],
          const Color(0xFF38BDF8),
        ),
      'speed' => (
          '$dayText${r['at']}  ·  ${AppLocale.isArabic ? r['addressAr'] : r['addressEn']}',
          [
            (tr('rep.peak'), '${r['speed']} ${tr('fleet.kmh')}'),
            (tr('rep.limit'), '${r['limit']}'),
            (tr('rep.over'), '+${((r['speed'] as num?) ?? 0) - ((r['limit'] as num?) ?? 0)}'),
            (tr('rep.duration'), '${r['durationSec']} ${tr('rep.sec')}'),
          ],
          Brand.danger,
        ),
      _ => (
          '${r['at']}',
          [
            (tr('rep.temp'), '${r['temperature']}°'),
            (tr('rep.humidity'), r['humidity'] == null ? '—' : '${r['humidity']}%'),
          ],
          const Color(0xFF38BDF8),
        ),
    };

    return Material(
      color: Palette.glass,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: Palette.glassEdge),
      ),
      child: InkWell(
        onTap: id == null ? null : () => widget.onOpenVehicle(id),
        child: IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(width: 4, color: tone),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(plate,
                          textDirection: TextDirection.ltr,
                          style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w900)),
                      if (sub.isNotEmpty)
                        Text(sub,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 11, color: Palette.muted)),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          for (final f in facts)
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(f.$2,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w900)),
                                  Text(f.$1,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: TextStyle(fontSize: 9.5, color: Palette.muted)),
                                ],
                              ),
                            ),
                        ],
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

/* ───────────────────────── أجزاء ───────────────────────── */

class _TypeTile extends StatelessWidget {
  const _TypeTile({required this.icon, required this.label, required this.selected, required this.onTap});

  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? Brand.green.withValues(alpha: 0.15) : Palette.glass,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: selected ? Brand.green : Palette.glassEdge, width: selected ? 1.5 : 1),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: Column(
            children: [
              Icon(icon, size: 20, color: selected ? Brand.green : Palette.muted),
              const SizedBox(height: 4),
              Text(label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w900,
                    color: selected ? Brand.green : Palette.muted,
                  )),
            ],
          ),
        ),
      ),
    );
  }
}

class _FilterRow extends StatelessWidget {
  const _FilterRow({
    required this.icon,
    required this.title,
    required this.value,
    required this.onTap,
    this.ltrValue = false,
  });

  final IconData icon;
  final String title;
  final String value;
  final VoidCallback onTap;
  final bool ltrValue;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        child: Row(
          children: [
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                color: Brand.green.withValues(alpha: 0.13),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(icon, size: 18, color: Brand.green),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w900)),
                  Text(value,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      textDirection: ltrValue ? TextDirection.ltr : null,
                      style: TextStyle(fontSize: 11, color: Palette.muted)),
                ],
              ),
            ),
            Icon(Icons.unfold_more_rounded, size: 18, color: Palette.muted),
          ],
        ),
      ),
    );
  }
}

class _SheetOption extends StatelessWidget {
  const _SheetOption({required this.icon, required this.label, required this.selected, required this.onTap});

  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Material(
        color: selected ? Brand.green.withValues(alpha: 0.12) : Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: BorderSide(color: selected ? Brand.green : Palette.border),
        ),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(14),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
            child: Row(
              children: [
                Icon(icon, size: 20, color: selected ? Brand.green : Palette.muted),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(label,
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w800,
                        color: selected ? Brand.green : Palette.text,
                      )),
                ),
                if (selected) const Icon(Icons.check_circle_rounded, size: 20, color: Brand.green),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// اختيار المركبات: «الكل» أو مجموعة منها، ثم «تطبيق».
class _VehiclePicker extends StatefulWidget {
  const _VehiclePicker({required this.vehicles, required this.selected});

  final List<FleetVehicle> vehicles;
  final Set<int> selected;

  @override
  State<_VehiclePicker> createState() => _VehiclePickerState();
}

class _VehiclePickerState extends State<_VehiclePicker> {
  late final Set<int> _picked = {...widget.selected};

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 8, 6),
              child: Row(
                children: [
                  Text(tr('rep.vehicles'), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900)),
                  const Spacer(),
                  TextButton(
                    onPressed: () => setState(_picked.clear),
                    child: Text(tr('fleet.allVehicles')),
                  ),
                ],
              ),
            ),
            Flexible(
              child: ListView(
                shrinkWrap: true,
                children: [
                  for (final v in widget.vehicles)
                    CheckboxListTile(
                      value: _picked.contains(v.id),
                      activeColor: Brand.green,
                      onChanged: (on) => setState(() => on == true ? _picked.add(v.id) : _picked.remove(v.id)),
                      title: Text(v.plate,
                          textDirection: TextDirection.ltr,
                          textAlign: TextAlign.start,
                          style: const TextStyle(fontWeight: FontWeight.w900)),
                      subtitle: v.model.isEmpty
                          ? null
                          : Text(v.model, style: TextStyle(fontSize: 11.5, color: Palette.muted)),
                    ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
              child: FilledButton(
                onPressed: () => Navigator.pop(context, _picked),
                child: Text(_picked.isEmpty ? tr('fleet.allVehicles') : tr1('rep.apply', _picked.length)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(32, 30, 32, 0),
      child: Column(
        children: [
          Icon(Icons.inbox_rounded, size: 36, color: Palette.muted),
          const SizedBox(height: 10),
          Text(text,
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 13, height: 1.5, fontWeight: FontWeight.w700, color: Palette.muted)),
        ],
      ),
    );
  }
}
