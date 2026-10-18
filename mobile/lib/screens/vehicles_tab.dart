import 'package:flutter/material.dart';

import '../i18n.dart';
import '../services/api_client.dart';
import '../services/fleet_store.dart';
import '../theme.dart';
import '../widgets/fleet_widgets.dart';

/// قائمة المركبات: بحث، وتصفية بالحالة، ولمسة تفتح التفاصيل.
class VehiclesTab extends StatefulWidget {
  const VehiclesTab({
    super.key,
    required this.store,
    required this.api,
    required this.token,
    required this.onShowOnMap,
    required this.onShowHistory,
  });

  final FleetStore store;
  final ApiClient api;
  final String token;
  final ValueChanged<int> onShowOnMap;
  final ValueChanged<int> onShowHistory;

  @override
  State<VehiclesTab> createState() => _VehiclesTabState();
}

class _VehiclesTabState extends State<VehiclesTab> {
  final _search = TextEditingController();

  /// `null` = الكل.
  String? _status;

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  List<FleetVehicle> _filter(List<FleetVehicle> all) {
    final q = _search.text.trim().toLowerCase();
    return all.where((v) {
      if (_status != null && v.status != _status) return false;
      if (q.isEmpty) return true;
      return [v.plate, v.driverAr, v.driverEn, v.modelAr, v.modelEn, v.imei]
          .any((f) => f.toLowerCase().contains(q));
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: widget.store,
      builder: (context, _) {
        final store = widget.store;
        final rows = _filter(store.vehicles);

        /* صفحة واحدة تتمرّر كلها: العنوان والبحث والتصفية تصعد مع القائمة */
        return RefreshIndicator(
          onRefresh: store.refresh,
          child: ListView(
            padding: const EdgeInsets.only(bottom: 20),
            children: [
              PageHeader(
                icon: Icons.local_shipping_rounded,
                title: tr('fleet.tab.vehicles'),
                trailing: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: Palette.glass,
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(color: Palette.glassEdge),
                  ),
                  child: Text(
                    tr1('fleet.count', store.vehicles.length),
                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: Palette.muted),
                  ),
                ),
              ),

              /* أربع بطاقات للحالات: العدد بنظرة، واللمس يصفّي، واللمس ثانيةً يلغي */
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 12, 14, 0),
                child: Row(
                  children: [
                    for (final (i, st) in fleetStatuses.indexed) ...[
                      if (i > 0) const SizedBox(width: 8),
                      Expanded(
                        child: _StatusTile(
                          status: st,
                          count: store.count(st),
                          selected: _status == st,
                          onTap: () => setState(() => _status = _status == st ? null : st),
                        ),
                      ),
                    ],
                  ],
                ),
              ),

              Padding(
                padding: const EdgeInsets.fromLTRB(14, 12, 14, 0),
                child: SizedBox(
                  height: 46,
                  child: TextField(
                    controller: _search,
                    onChanged: (_) => setState(() {}),
                    style: const TextStyle(fontSize: 13.5),
                    decoration: InputDecoration(
                      fillColor: Palette.glass,
                      hintText: tr('fleet.search'),
                      hintStyle: TextStyle(fontSize: 12.5, color: Palette.muted),
                      prefixIcon: Icon(Icons.search_rounded, size: 20, color: Palette.muted),
                      suffixIcon: _search.text.isEmpty
                          ? null
                          : IconButton(
                              onPressed: () => setState(_search.clear),
                              icon: Icon(Icons.close_rounded, size: 18, color: Palette.muted),
                            ),
                      contentPadding: EdgeInsets.zero,
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide: BorderSide(color: Palette.glassEdge),
                      ),
                    ),
                  ),
                ),
              ),

              /* سطر النتيجة: كم مركبة معروضة، وإلغاء التصفية إن وُجدت */
              Padding(
                padding: const EdgeInsets.fromLTRB(18, 14, 18, 6),
                child: Row(
                  children: [
                    Text(
                      _status == null
                          ? tr('fleet.allVehicles')
                          : tr('fleet.status.$_status'),
                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w900),
                    ),
                    const SizedBox(width: 6),
                    Text('(${rows.length})', style: TextStyle(fontSize: 12, color: Palette.muted)),
                    const Spacer(),
                    if (_status != null || _search.text.isNotEmpty)
                      InkWell(
                        onTap: () => setState(() {
                          _status = null;
                          _search.clear();
                        }),
                        child: Text(tr('fleet.clear'),
                            style: const TextStyle(
                                fontSize: 12, fontWeight: FontWeight.w800, color: Brand.green)),
                      ),
                  ],
                ),
              ),
              if (store.offline)
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                  color: Brand.danger.withValues(alpha: 0.12),
                  child: Text(tr('fleet.offline'),
                      style: const TextStyle(
                          fontSize: 11.5, fontWeight: FontWeight.w700, color: Brand.danger)),
                ),
              ..._body(store, rows),
            ],
          ),
        );
      },
    );
  }

  List<Widget> _body(FleetStore store, List<FleetVehicle> rows) {
    if (store.loading && store.vehicles.isEmpty) {
      return [
        const SizedBox(height: 80),
        const Center(child: CircularProgressIndicator()),
      ];
    }
    if (rows.isEmpty) {
      final none = store.vehicles.isEmpty;
      return [
        const SizedBox(height: 60),
        Icon(none ? Icons.local_shipping_outlined : Icons.search_off_rounded,
            size: 36, color: Palette.muted),
        const SizedBox(height: 12),
        Text(none ? tr('fleet.empty') : tr('fleet.noMatch'),
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800)),
        if (none) ...[
          const SizedBox(height: 6),
          Text(tr('fleet.emptyHint'),
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 12, color: Palette.muted)),
        ],
      ];
    }

    return [
      for (final v in rows)
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 4, 14, 4),
          child: _VehicleTile(
            vehicle: v,
            onTap: () => showVehicleSheet(
              context,
              store: store,
              vehicleId: v.id,
              api: widget.api,
              token: widget.token,
              onShowOnMap: () => widget.onShowOnMap(v.id),
              onShowHistory: () => widget.onShowHistory(v.id),
            ),
          ),
        ),
    ];
  }
}

class _VehicleTile extends StatelessWidget {
  const _VehicleTile({required this.vehicle, required this.onTap});

  final FleetVehicle vehicle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final v = vehicle;
    final pos = v.position;
    final tone = statusColor(v.status);
    final sub = [if (v.model.isNotEmpty) v.model, if (v.driver.isNotEmpty) v.driver].join('  ·  ');

    return Material(
      color: Palette.glass,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: Palette.glassEdge),
      ),
      child: InkWell(
        onTap: onTap,
        child: IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              /* شريط بلون الحالة على طرف البطاقة — يُقرأ قبل أي نص */
              Container(width: 4, color: tone),
              Expanded(
                child: Padding(
                  padding: const EdgeInsetsDirectional.fromSTEB(12, 12, 8, 12),
                  child: Row(
                    children: [
                      Container(
                        width: 42,
                        height: 42,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: tone.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Icon(Icons.local_shipping_rounded, size: 21, color: tone),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              v.plate,
                              textDirection: TextDirection.ltr,
                              style: const TextStyle(
                                  fontSize: 15.5, fontWeight: FontWeight.w900, letterSpacing: 0.4),
                            ),
                            if (sub.isNotEmpty) ...[
                              const SizedBox(height: 3),
                              Text(
                                sub,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(fontSize: 11.5, color: Palette.muted),
                              ),
                            ],
                          ],
                        ),
                      ),
                      const SizedBox(width: 8),
                      Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          StatusPill(status: v.status),
                          const SizedBox(height: 5),
                          Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                v.status == 'moving' ? Icons.speed_rounded : Icons.schedule_rounded,
                                size: 12,
                                color: Palette.muted,
                              ),
                              const SizedBox(width: 3),
                              Text(
                                pos == null
                                    ? tr('fleet.noSignal')
                                    : v.status == 'moving'
                                        ? '${pos.speed} ${tr('fleet.kmh')}'
                                        : ageLabel(pos.ageSeconds),
                                style: TextStyle(fontSize: 10.5, color: Palette.muted),
                              ),
                            ],
                          ),
                        ],
                      ),
                      const SizedBox(width: 2),
                      Icon(
                        Directionality.of(context) == TextDirection.rtl
                            ? Icons.chevron_left_rounded
                            : Icons.chevron_right_rounded,
                        color: Palette.muted,
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

/// بطاقة حالة: العدد كبيرًا بلونها، واسمها تحته.
class _StatusTile extends StatelessWidget {
  const _StatusTile({
    required this.status,
    required this.count,
    required this.selected,
    required this.onTap,
  });

  final String status;
  final int count;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final tone = statusColor(status);
    return Material(
      color: selected ? tone.withValues(alpha: 0.14) : Palette.glass,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: selected ? tone : Palette.glassEdge, width: selected ? 1.5 : 1),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: Column(
            children: [
              Text('$count',
                  style: TextStyle(fontSize: 19, fontWeight: FontWeight.w900, color: tone)),
              const SizedBox(height: 2),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Container(
                    width: 6,
                    height: 6,
                    decoration: BoxDecoration(color: tone, shape: BoxShape.circle),
                  ),
                  const SizedBox(width: 4),
                  Flexible(
                    child: Text(
                      tr('fleet.status.$status'),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: Palette.muted),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
