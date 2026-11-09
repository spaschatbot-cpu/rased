import 'dart:convert';

import 'package:flutter/material.dart';

import '../i18n.dart';
import '../services/api_client.dart';
import '../services/fleet_store.dart';
import '../theme.dart';

/// التشغيل في تطبيق المدير: ثلاث بطاقات في الرئيسية — رحلات اليوم، طلبات
/// الإصلاح المفتوحة، والسائقون — وكل بطاقة تفتح صفحتها. الإنشاء نفسه (أمر عمل،
/// مسار، أسعار) يبقى في الموقع: رسم مسار على شاشة هاتف لا يصلح.

String _two(int n) => n.toString().padLeft(2, '0');
String _iso(DateTime d) => '${d.year}-${_two(d.month)}-${_two(d.day)}';

/// اليوم بتوقيت السعودية — كما يقسم السيرفر الأيام.
DateTime _today() {
  final r = DateTime.now().toUtc().add(const Duration(hours: 3));
  return DateTime(r.year, r.month, r.day);
}

bool _canWrite(String role) => role == 'superadmin' || role == 'admin';

/// الأيام الباقية على انتهاء الرخصة؛ `null` إن لم تُسجَّل.
int? _licenceDaysLeft(Map<String, dynamic> u) {
  final s = '${u['licenseExpiry'] ?? ''}';
  final d = DateTime.tryParse(s);
  if (d == null) return null;
  return DateTime(d.year, d.month, d.day).difference(_today()).inDays;
}

String _name(Map<String, dynamic> m, [String ar = 'nameAr', String en = 'nameEn']) =>
    '${(AppLocale.isArabic ? m[ar] : m[en]) ?? m[ar] ?? m[en] ?? '—'}';

const _tripTone = {
  'scheduled': Color(0xFF38BDF8),
  'started': Brand.warn,
  'completed': Brand.green,
  'cancelled': Color(0xFF94A3B8),
};
const _repairTone = {
  'open': Brand.danger,
  'inProgress': Brand.warn,
  'done': Brand.green,
  'rejected': Color(0xFF94A3B8),
};

/* ══ البطاقات الثلاث ═══════════════════════════════════════════════════ */

class OpsCards extends StatefulWidget {
  const OpsCards({super.key, required this.api, required this.token, required this.role, required this.store});

  final ApiClient api;
  final String token;
  final String role;
  final FleetStore store;

  @override
  State<OpsCards> createState() => OpsCardsState();
}

class OpsCardsState extends State<OpsCards> {
  List<Map<String, dynamic>>? _trips;
  List<Map<String, dynamic>>? _repairs;
  List<Map<String, dynamic>>? _drivers;

  @override
  void initState() {
    super.initState();
    refresh();
  }

  /// كل قائمة تُقرأ وحدها: فشل واحدة (حساب مشاهد لا يقرأ الحسابات مثلًا)
  /// لا يُخفي البطاقتين الأخريين.
  Future<void> refresh() async {
    final today = _iso(_today());
    Future<List<Map<String, dynamic>>?> safe(Future<List<Map<String, dynamic>>> f) async {
      try {
        return await f;
      } catch (_) {
        return null;
      }
    }

    final r = await Future.wait([
      safe(widget.api.trips(widget.token, from: today, to: today)),
      safe(widget.api.repairs(widget.token)),
      safe(widget.api.users(widget.token)),
    ]);
    if (!mounted) return;
    setState(() {
      _trips = r[0];
      _repairs = r[1];
      _drivers = r[2]?.where((u) => u['role'] == 'driver').toList();
    });
  }

  Future<void> _open(Widget page) async {
    await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => page));
    refresh();
  }

  @override
  Widget build(BuildContext context) {
    final started = _trips?.where((t) => t['status'] == 'started').length ?? 0;
    final open = _repairs?.where((r) => r['status'] == 'open' || r['status'] == 'inProgress').length;
    final expiring = _drivers?.where((u) {
      final d = _licenceDaysLeft(u);
      return d != null && d <= 30;
    }).length;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: _OpsCard(
            icon: Icons.assignment_rounded,
            tone: const Color(0xFF38BDF8),
            value: _trips == null ? '—' : '${_trips!.length}',
            label: tr('ops.trips'),
            sub: tr1('ops.tripsSub', started),
            onTap: () => _open(TripsScreen(api: widget.api, token: widget.token, role: widget.role, store: widget.store)),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _OpsCard(
            icon: Icons.build_circle_rounded,
            tone: Brand.warn,
            value: open == null ? '—' : '$open',
            label: tr('ops.repairs'),
            sub: tr('ops.repairsSub'),
            onTap: () => _open(RepairsScreen(api: widget.api, token: widget.token, role: widget.role)),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _OpsCard(
            icon: Icons.badge_rounded,
            tone: Brand.green,
            value: _drivers == null ? '—' : '${_drivers!.length}',
            label: tr('ops.drivers'),
            sub: expiring == null ? '' : tr1('ops.driversSub', expiring),
            alert: (expiring ?? 0) > 0,
            onTap: () => _open(DriversScreen(api: widget.api, token: widget.token, store: widget.store)),
          ),
        ),
      ],
    );
  }
}

class _OpsCard extends StatelessWidget {
  const _OpsCard({
    required this.icon,
    required this.tone,
    required this.value,
    required this.label,
    required this.sub,
    required this.onTap,
    this.alert = false,
  });

  final IconData icon;
  final Color tone;
  final String value;
  final String label;
  final String sub;
  final VoidCallback onTap;
  final bool alert;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Palette.glass,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: alert ? Brand.danger.withValues(alpha: 0.5) : Palette.glassEdge),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 32,
                    height: 32,
                    decoration: BoxDecoration(color: tone.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(10)),
                    child: Icon(icon, size: 18, color: tone),
                  ),
                  const Spacer(),
                  Icon(AppLocale.isArabic ? Icons.chevron_left_rounded : Icons.chevron_right_rounded, size: 18, color: Palette.muted),
                ],
              ),
              const SizedBox(height: 10),
              Text(value, style: TextStyle(fontSize: 24, fontWeight: FontWeight.w900, color: Palette.text)),
              Text(label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: Palette.text)),
              const SizedBox(height: 2),
              Text(sub,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 10.5, color: alert ? Brand.danger : Palette.muted)),
            ],
          ),
        ),
      ),
    );
  }
}

/* ══ هيكل الصفحة ═════════════════════════════════════════════════════ */

class _Page extends StatelessWidget {
  const _Page({required this.title, required this.onRefresh, required this.children, this.header});

  final String title;
  final Future<void> Function() onRefresh;
  final List<Widget> children;
  final Widget? header;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Palette.bg,
      appBar: AppBar(
        backgroundColor: Palette.bg,
        surfaceTintColor: Colors.transparent,
        foregroundColor: Palette.text,
        title: Text(title, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900)),
      ),
      body: RefreshIndicator(
        onRefresh: onRefresh,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
          children: [if (header != null) header!, ...children],
        ),
      ),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty(this.text, {this.error = false});

  final String text;
  final bool error;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 60),
      child: Text(text,
          textAlign: TextAlign.center,
          style: TextStyle(color: error ? Brand.danger : Palette.muted, fontWeight: FontWeight.w700)),
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill(this.text, this.tone);

  final String text;
  final Color tone;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: tone.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(20)),
      child: Text(text, style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w900, color: tone)),
    );
  }
}

BoxDecoration _box([Color? edge]) => BoxDecoration(
      color: Palette.glass,
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: edge ?? Palette.glassEdge),
    );

Widget _line(IconData icon, String text) => Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Row(
        children: [
          Icon(icon, size: 15, color: Palette.muted),
          const SizedBox(width: 6),
          Expanded(child: Text(text, style: TextStyle(fontSize: 12.5, color: Palette.text))),
        ],
      ),
    );

/* ══ الرحلات ═════════════════════════════════════════════════════════ */

class TripsScreen extends StatefulWidget {
  const TripsScreen({super.key, required this.api, required this.token, required this.role, required this.store});

  final ApiClient api;
  final String token;
  final String role;
  final FleetStore store;

  @override
  State<TripsScreen> createState() => _TripsScreenState();
}

class _TripsScreenState extends State<TripsScreen> {
  DateTime _day = _today();
  List<Map<String, dynamic>>? _trips;
  Map<int, String> _drivers = const {};
  String? _error;
  String? _busy;

  @override
  void initState() {
    super.initState();
    widget.api
        .users(widget.token)
        .then((list) => mounted ? setState(() => _drivers = {for (final u in list) (u['id'] as num).toInt(): _name(u)}) : null)
        .catchError((_) => null);
    _load();
  }

  Future<void> _load() async {
    final d = _iso(_day);
    try {
      final list = await widget.api.trips(widget.token, from: d, to: d);
      if (!mounted) return;
      setState(() {
        _trips = list;
        _error = null;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  void _shift(int days) {
    setState(() {
      _day = _day.add(Duration(days: days));
      _trips = null;
    });
    _load();
  }

  Future<void> _cancel(Map<String, dynamic> t) async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(tr('ops.cancelTrip')),
        content: Text('${t['workOrderName']}'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(tr('ops.back'))),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Brand.danger),
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(tr('ops.cancelTrip')),
          ),
        ],
      ),
    );
    if (yes != true) return;
    setState(() => _busy = '${t['id']}');
    try {
      await widget.api.tripAction(widget.token, '${t['id']}', 'cancel');
      await _load();
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  String _plate(Object? id) {
    for (final v in widget.store.vehicles) {
      if (v.id == (id as num?)?.toInt()) return v.plate;
    }
    return '—';
  }

  @override
  Widget build(BuildContext context) {
    final isToday = _day == _today();
    final canWrite = _canWrite(widget.role);
    return _Page(
      title: tr('ops.trips.title'),
      onRefresh: _load,
      header: Container(
        margin: const EdgeInsets.only(bottom: 12),
        decoration: _box(),
        child: Row(
          children: [
            IconButton(onPressed: () => _shift(-1), icon: Icon(AppLocale.isArabic ? Icons.chevron_right_rounded : Icons.chevron_left_rounded)),
            Expanded(
              child: Text(isToday ? tr('orders.today') : _iso(_day),
                  textAlign: TextAlign.center, style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w900)),
            ),
            IconButton(onPressed: () => _shift(1), icon: Icon(AppLocale.isArabic ? Icons.chevron_left_rounded : Icons.chevron_right_rounded)),
          ],
        ),
      ),
      children: [
        if (_error != null)
          _Empty(_error!, error: true)
        else if (_trips == null)
          const Padding(padding: EdgeInsets.only(top: 60), child: Center(child: CircularProgressIndicator()))
        else if (_trips!.isEmpty)
          _Empty(tr('ops.noTrips'))
        else
          for (final t in _trips!)
            Container(
              margin: const EdgeInsets.only(bottom: 10),
              padding: const EdgeInsets.all(14),
              decoration: _box(),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(child: Text('${t['workOrderName']}', style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w900))),
                      _Pill(tr('orders.status.${t['status']}'), _tripTone[t['status']] ?? Palette.muted),
                    ],
                  ),
                  const SizedBox(height: 6),
                  _line(Icons.person_rounded, _drivers[(t['driverId'] as num?)?.toInt()] ?? '—'),
                  _line(Icons.local_shipping_rounded, _plate(t['vehicleId'])),
                  _line(Icons.schedule_rounded,
                      '${'${t['plannedStart']}'.split('T').last} – ${'${t['plannedEnd']}'.split('T').last}'),
                  if ((t['price'] as num? ?? 0) > 0) _line(Icons.sell_rounded, tr1('ops.price', t['price'])),
                  if (canWrite && (t['status'] == 'scheduled' || t['status'] == 'started')) ...[
                    const SizedBox(height: 10),
                    Align(
                      alignment: AlignmentDirectional.centerEnd,
                      child: OutlinedButton.icon(
                        onPressed: _busy == '${t['id']}' ? null : () => _cancel(t),
                        icon: const Icon(Icons.block_rounded, size: 18),
                        label: Text(tr('ops.cancelTrip')),
                        style: OutlinedButton.styleFrom(foregroundColor: Brand.danger, side: const BorderSide(color: Brand.danger)),
                      ),
                    ),
                  ],
                ],
              ),
            ),
      ],
    );
  }
}

/* ══ طلبات الإصلاح ═══════════════════════════════════════════════════ */

class RepairsScreen extends StatefulWidget {
  const RepairsScreen({super.key, required this.api, required this.token, required this.role});

  final ApiClient api;
  final String token;
  final String role;

  @override
  State<RepairsScreen> createState() => _RepairsScreenState();
}

class _RepairsScreenState extends State<RepairsScreen> {
  List<Map<String, dynamic>>? _list;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final list = await widget.api.repairs(widget.token);
      if (!mounted) return;
      setState(() {
        _list = list;
        _error = null;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  Future<void> _open(Map<String, dynamic> r) async {
    final changed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Palette.panel,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(22))),
      builder: (_) => _RepairSheet(api: widget.api, token: widget.token, repair: r, canWrite: _canWrite(widget.role)),
    );
    if (changed == true) _load();
  }

  @override
  Widget build(BuildContext context) {
    return _Page(
      title: tr('ops.repairs'),
      onRefresh: _load,
      children: [
        if (_error != null)
          _Empty(_error!, error: true)
        else if (_list == null)
          const Padding(padding: EdgeInsets.only(top: 60), child: Center(child: CircularProgressIndicator()))
        else if (_list!.isEmpty)
          _Empty(tr('ops.noRepairs'))
        else
          for (final r in _list!)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Material(
                color: Palette.glass,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16), side: BorderSide(color: Palette.glassEdge)),
                child: InkWell(
                  borderRadius: BorderRadius.circular(16),
                  onTap: () => _open(r),
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(tr('repair.cat.${r['category']}'),
                                  style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w900)),
                            ),
                            if (r['hasPhoto'] == true) ...[
                              Icon(Icons.photo_camera_rounded, size: 16, color: Palette.muted),
                              const SizedBox(width: 8),
                            ],
                            _Pill(tr('repair.status.${r['status']}'), _repairTone[r['status']] ?? Palette.muted),
                          ],
                        ),
                        const SizedBox(height: 6),
                        Text('${r['description']}',
                            maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12.5, color: Palette.muted)),
                        _line(Icons.person_rounded, _name(r, 'driverNameAr', 'driverNameEn')),
                        _line(Icons.local_shipping_rounded, '${r['plate'] ?? '—'}'),
                        _line(Icons.event_rounded, '${r['createdAt']}'.replaceFirst('T', ' ').substring(0, 16)),
                      ],
                    ),
                  ),
                ),
              ),
            ),
      ],
    );
  }
}

class _RepairSheet extends StatefulWidget {
  const _RepairSheet({required this.api, required this.token, required this.repair, required this.canWrite});

  final ApiClient api;
  final String token;
  final Map<String, dynamic> repair;
  final bool canWrite;

  @override
  State<_RepairSheet> createState() => _RepairSheetState();
}

class _RepairSheetState extends State<_RepairSheet> {
  late String _status = '${widget.repair['status']}';
  late final _note = TextEditingController(text: '${widget.repair['note'] ?? ''}');
  Future<String?>? _photo;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    if (widget.repair['hasPhoto'] == true) _photo = widget.api.repairPhoto(widget.token, '${widget.repair['id']}');
  }

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _busy = true);
    try {
      await widget.api.updateRepair(widget.token, '${widget.repair['id']}', status: _status, note: _note.text.trim());
      if (mounted) Navigator.pop(context, true);
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final r = widget.repair;
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(color: Palette.border, borderRadius: BorderRadius.circular(99)),
                ),
              ),
              const SizedBox(height: 12),
              Text(tr('repair.cat.${r['category']}'), style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900)),
              const SizedBox(height: 6),
              Text('${r['description']}', style: TextStyle(fontSize: 13.5, color: Palette.text, height: 1.5)),
              _line(Icons.person_rounded, _name(r, 'driverNameAr', 'driverNameEn')),
              _line(Icons.local_shipping_rounded, '${r['plate'] ?? '—'}'),
              if (_photo != null) ...[
                const SizedBox(height: 12),
                FutureBuilder<String?>(
                  future: _photo,
                  builder: (context, snap) {
                    if (snap.connectionState != ConnectionState.done) {
                      return const SizedBox(height: 160, child: Center(child: CircularProgressIndicator()));
                    }
                    final data = snap.data;
                    final comma = data?.indexOf(',') ?? -1;
                    if (data == null || comma < 0) return Text(tr('ops.noPhoto'), style: TextStyle(color: Palette.muted));
                    return ClipRRect(
                      borderRadius: BorderRadius.circular(14),
                      child: Image.memory(base64Decode(data.substring(comma + 1)), fit: BoxFit.cover),
                    );
                  },
                ),
              ],
              const SizedBox(height: 16),
              Text(tr('ops.status'), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w900)),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final s in const ['open', 'inProgress', 'done', 'rejected'])
                    ChoiceChip(
                      label: Text(tr('repair.status.$s')),
                      selected: _status == s,
                      onSelected: widget.canWrite ? (_) => setState(() => _status = s) : null,
                      selectedColor: (_repairTone[s] ?? Brand.green).withValues(alpha: 0.2),
                    ),
                ],
              ),
              const SizedBox(height: 14),
              TextField(
                controller: _note,
                enabled: widget.canWrite,
                maxLines: 2,
                decoration: InputDecoration(labelText: tr('repair.reply'), border: const OutlineInputBorder()),
              ),
              if (widget.canWrite) ...[
                const SizedBox(height: 14),
                FilledButton(
                  onPressed: _busy ? null : _save,
                  style: FilledButton.styleFrom(
                    backgroundColor: Brand.green,
                    foregroundColor: Brand.onGreen,
                    minimumSize: const Size.fromHeight(46),
                  ),
                  child: _busy
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      : Text(tr('ops.save'), style: const TextStyle(fontWeight: FontWeight.w900)),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/* ══ السائقون ════════════════════════════════════════════════════════ */

class DriversScreen extends StatefulWidget {
  const DriversScreen({super.key, required this.api, required this.token, required this.store});

  final ApiClient api;
  final String token;
  final FleetStore store;

  @override
  State<DriversScreen> createState() => _DriversScreenState();
}

class _DriversScreenState extends State<DriversScreen> {
  List<Map<String, dynamic>>? _list;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final all = await widget.api.users(widget.token);
      final drivers = all.where((u) => u['role'] == 'driver').toList()
        /* الأقرب انتهاءً أولًا؛ من بلا تاريخ في الآخر */
        ..sort((a, b) => (_licenceDaysLeft(a) ?? 1 << 30).compareTo(_licenceDaysLeft(b) ?? 1 << 30));
      if (!mounted) return;
      setState(() {
        _list = drivers;
        _error = null;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  String _plate(Object? id) {
    for (final v in widget.store.vehicles) {
      if (v.id == (id as num?)?.toInt()) return v.plate;
    }
    return '—';
  }

  @override
  Widget build(BuildContext context) {
    return _Page(
      title: tr('ops.drivers'),
      onRefresh: _load,
      children: [
        if (_error != null)
          _Empty(_error!, error: true)
        else if (_list == null)
          const Padding(padding: EdgeInsets.only(top: 60), child: Center(child: CircularProgressIndicator()))
        else if (_list!.isEmpty)
          _Empty(tr('ops.noDrivers'))
        else
          for (final u in _list!) _driverCard(u),
      ],
    );
  }

  Widget _driverCard(Map<String, dynamic> u) {
    final days = _licenceDaysLeft(u);
    final (tone, label) = days == null
        ? (Palette.muted, tr('ops.noLicence'))
        : days < 0
            ? (Brand.danger, tr('ops.expired'))
            : days <= 30
                ? (Brand.warn, tr1('ops.daysLeft', days))
                : (Brand.green, tr1('ops.daysLeft', days));
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: _box(days != null && days <= 30 ? tone.withValues(alpha: 0.5) : null),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text(_name(u), style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w900))),
              if (u['active'] == false) ...[_Pill(tr('ops.inactive'), Palette.muted), const SizedBox(width: 6)],
              _Pill(label, tone),
            ],
          ),
          const SizedBox(height: 4),
          if ('${u['phone'] ?? ''}'.isNotEmpty) _line(Icons.phone_rounded, '${u['phone']}'),
          _line(Icons.local_shipping_rounded, _plate(u['vehicleId'])),
          if ('${u['licenseNumber'] ?? ''}'.isNotEmpty) _line(Icons.badge_rounded, '${u['licenseNumber']}'),
          if (days != null) _line(Icons.event_rounded, '${u['licenseExpiry']}'),
        ],
      ),
    );
  }
}
