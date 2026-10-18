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
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 10, 14, 0),
                child: TextField(
                  controller: _search,
                  onChanged: (_) => setState(() {}),
                  style: const TextStyle(fontSize: 14),
                  decoration: InputDecoration(
                    fillColor: Palette.glass,
                    hintText: tr('fleet.search'),
                    hintStyle: TextStyle(fontSize: 13, color: Palette.muted),
                    prefixIcon: Icon(Icons.search_rounded, color: Palette.muted),
                    contentPadding: const EdgeInsets.symmetric(vertical: 12),
                  ),
                ),
              ),
              SizedBox(
                height: 52,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  children: [
                    _Chip(
                      label: '${tr('fleet.all')} ${store.vehicles.length}',
                      tone: Palette.text,
                      selected: _status == null,
                      onTap: () => setState(() => _status = null),
                    ),
                    for (final s in fleetStatuses)
                      _Chip(
                        label: '${tr('fleet.status.$s')} ${store.count(s)}',
                        tone: statusColor(s),
                        selected: _status == s,
                        onTap: () => setState(() => _status = _status == s ? null : s),
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

    return Material(
      color: Palette.glass,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: tone.withValues(alpha: 0.13),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(Icons.local_shipping_outlined, size: 20, color: tone),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      v.plate,
                      textDirection: TextDirection.ltr,
                      style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w900),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      [
                        if (v.model.isNotEmpty) v.model,
                        v.driver.isEmpty ? tr('fleet.noDriver') : v.driver,
                      ].join('  ·  '),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 11.5, color: Palette.muted),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  StatusPill(status: v.status),
                  if (pos != null) ...[
                    const SizedBox(height: 4),
                    Text(
                      v.status == 'moving'
                          ? '${pos.speed} ${tr('fleet.kmh')}'
                          : ageLabel(pos.ageSeconds),
                      style: TextStyle(fontSize: 10.5, color: Palette.muted),
                    ),
                  ],
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({
    required this.label,
    required this.tone,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final Color tone;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsetsDirectional.only(end: 8),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: selected ? tone.withValues(alpha: 0.16) : Palette.glass,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: selected ? tone : Palette.border),
          ),
          child: Text(
            label,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w800,
              color: selected ? tone : Palette.muted,
            ),
          ),
        ),
      ),
    );
  }
}
