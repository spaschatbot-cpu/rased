import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../i18n.dart';
import '../services/api_client.dart';
import '../services/fleet_store.dart';
import '../theme.dart';
import '../widgets/fleet_widgets.dart';

/// الخريطة الحيّة: كل مركبة ترسل موقعها، بلون حالتها.
///
/// [focus] تضعه قائمة المركبات حين يُضغط «عرض على الخريطة»: الخريطة تقترب
/// من المركبة وتفتح بطاقتها، ثم تُفرغه.
class LiveMapTab extends StatefulWidget {
  const LiveMapTab({
    super.key,
    required this.store,
    required this.api,
    required this.token,
    required this.focus,
    required this.onShowHistory,
  });

  final FleetStore store;
  final ApiClient api;
  final String token;
  final ValueNotifier<int?> focus;
  final ValueChanged<int> onShowHistory;

  @override
  State<LiveMapTab> createState() => _LiveMapTabState();
}

class _LiveMapTabState extends State<LiveMapTab> {
  final _map = MapController();

  /// الرياض — لحين وصول أول موقع.
  static const _home = LatLng(24.7136, 46.6753);

  bool _ready = false;

  /// الخريطة تُضبط على الأسطول مرة واحدة عند أول بيانات، ثم يتحكّم المستخدم.
  bool _fitted = false;

  int? _selected;

  @override
  void initState() {
    super.initState();
    widget.store.addListener(_onFleet);
    widget.focus.addListener(_onFocus);
  }

  @override
  void dispose() {
    widget.store.removeListener(_onFleet);
    widget.focus.removeListener(_onFocus);
    super.dispose();
  }

  List<FleetVehicle> get _live => widget.store.vehicles.where((v) => v.hasPosition).toList();

  void _onFleet() {
    if (!_fitted && _ready && _live.isNotEmpty) {
      _fitted = true;
      _fitAll();
    }
  }

  void _onFocus() {
    final id = widget.focus.value;
    if (id == null || !_ready) return;
    final v = widget.store.byId(id);
    if (v?.position != null) {
      _fitted = true;
      _map.move(v!.position!.point, 16);
      setState(() => _selected = id);
    }
    widget.focus.value = null;
  }

  void _fitAll() {
    final points = _live.map((v) => v.position!.point).toList();
    if (points.isEmpty) return;
    if (points.length == 1) {
      _map.move(points.first, 15);
      return;
    }
    _map.fitCamera(
      CameraFit.bounds(
        bounds: LatLngBounds.fromPoints(points),
        padding: const EdgeInsets.fromLTRB(60, 110, 60, 180),
        maxZoom: 16,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: widget.store,
      builder: (context, _) {
        final store = widget.store;
        final live = _live;
        final selected = _selected == null ? null : store.byId(_selected!);

        return Stack(
          fit: StackFit.expand,
          children: [
            FlutterMap(
              mapController: _map,
              options: MapOptions(
                initialCenter: _home,
                initialZoom: 5.5,
                minZoom: 3,
                maxZoom: 18,
                interactionOptions: const InteractionOptions(
                  flags: InteractiveFlag.all & ~InteractiveFlag.rotate,
                ),
                onMapReady: () {
                  _ready = true;
                  _onFleet();
                  _onFocus();
                },
                onTap: (_, __) => setState(() => _selected = null),
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
                    for (final v in live)
                      Marker(
                        point: v.position!.point,
                        width: 120,
                        height: 80,
                        child: _VehicleMarker(
                          vehicle: v,
                          selected: v.id == _selected,
                          onTap: () => setState(() => _selected = v.id),
                        ),
                      ),
                  ],
                ),
              ],
            ),

            /* حقوق OSM — شرط في رخصة البلاطات */
            const Positioned(left: 6, bottom: 4, child: _Attribution()),

            /* عدّاد الحالات أعلى الخريطة */
            Positioned(
              top: 10,
              left: 12,
              right: 12,
              child: Column(
                children: [
                  _Counts(store: store),
                  if (store.offline) ...[
                    const SizedBox(height: 8),
                    _Banner(text: tr('fleet.offline')),
                  ],
                ],
              ),
            ),

            /* زرّ عرض الأسطول كله */
            if (live.isNotEmpty)
              PositionedDirectional(
                end: 12,
                top: store.offline ? 104 : 64,
                child: _MapButton(
                  icon: Icons.zoom_out_map_rounded,
                  tooltip: tr('fleet.fitAll'),
                  onTap: () {
                    setState(() => _selected = null);
                    _fitAll();
                  },
                ),
              ),

            if (store.loading)
              const Center(child: CircularProgressIndicator())
            else if (live.isEmpty)
              const Center(child: _EmptyCard()),

            if (selected != null)
              Positioned(
                left: 12,
                right: 12,
                bottom: 14,
                child: _SelectedCard(
                  vehicle: selected,
                  onClose: () => setState(() => _selected = null),
                  onOpen: () => showVehicleSheet(
                    context,
                    store: store,
                    vehicleId: selected.id,
                    api: widget.api,
                    token: widget.token,
                    onShowHistory: () => widget.onShowHistory(selected.id),
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}

/// علامة المركبة: دائرة بلون الحالة فيها سهم الاتجاه، وتحتها اللوحة.
class _VehicleMarker extends StatelessWidget {
  const _VehicleMarker({required this.vehicle, required this.selected, required this.onTap});

  final FleetVehicle vehicle;
  final bool selected;
  final VoidCallback onTap;

  static const _labelBlock = 21.0;

  @override
  Widget build(BuildContext context) {
    final tone = statusColor(vehicle.status);
    final pos = vehicle.position!;
    final size = selected ? 34.0 : 28.0;

    return GestureDetector(
      onTap: onTap,
      /* اللوحة تحت الدائرة، وفراغ بارتفاعها فوقها: هكذا يقع مركز الدائرة
         على مركز العلامة، أي على الموقع نفسه */
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const SizedBox(height: _labelBlock),
          Container(
            width: size,
            height: size,
            decoration: BoxDecoration(
              color: tone,
              shape: BoxShape.circle,
              border: Border.all(color: Colors.white, width: selected ? 3.5 : 2.5),
              boxShadow: [
                BoxShadow(color: tone.withValues(alpha: 0.55), blurRadius: 12),
              ],
            ),
            child: vehicle.status == 'moving'
                ? Transform.rotate(
                    angle: pos.heading * math.pi / 180,
                    child: const Icon(Icons.navigation_rounded, size: 16, color: Colors.white),
                  )
                : const Icon(Icons.local_shipping_rounded, size: 14, color: Colors.white),
          ),
          const SizedBox(height: 3),
          Container(
            height: _labelBlock - 3,
            alignment: Alignment.center,
            padding: const EdgeInsets.symmetric(horizontal: 6),
            decoration: BoxDecoration(
              color: Brand.bg.withValues(alpha: 0.88),
              borderRadius: BorderRadius.circular(6),
              border: Border.all(color: tone.withValues(alpha: 0.6)),
            ),
            child: Text(
              vehicle.plate,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textDirection: TextDirection.ltr,
              style: const TextStyle(
                  fontSize: 10, fontWeight: FontWeight.w900, color: Brand.text),
            ),
          ),
        ],
      ),
    );
  }
}

class _Counts extends StatelessWidget {
  const _Counts({required this.store});

  final FleetStore store;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
      decoration: glassSurface(radius: 14),
      child: Row(
        children: [
          for (final s in fleetStatuses)
            Expanded(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    '${store.count(s)}',
                    style: TextStyle(
                        fontSize: 15, fontWeight: FontWeight.w900, color: statusColor(s)),
                  ),
                  Text(
                    tr('fleet.status.$s'),
                    style: const TextStyle(
                        fontSize: 10, fontWeight: FontWeight.w700, color: Brand.muted),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _SelectedCard extends StatelessWidget {
  const _SelectedCard({required this.vehicle, required this.onClose, required this.onOpen});

  final FleetVehicle vehicle;
  final VoidCallback onClose;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final pos = vehicle.position;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onOpen,
        borderRadius: BorderRadius.circular(18),
        child: Container(
          padding: const EdgeInsets.fromLTRB(14, 12, 6, 12),
          decoration: BoxDecoration(
            color: Brand.panel,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: Brand.border),
            boxShadow: const [
              BoxShadow(color: Color(0x66000000), blurRadius: 24, offset: Offset(0, 10)),
            ],
          ),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(
                          vehicle.plate,
                          textDirection: TextDirection.ltr,
                          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900),
                        ),
                        const SizedBox(width: 8),
                        StatusPill(status: vehicle.status),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      [
                        if (pos != null) '${pos.speed} ${tr('fleet.kmh')}',
                        vehicle.driver.isEmpty ? tr('fleet.noDriver') : vehicle.driver,
                        if (pos != null) ageLabel(pos.ageSeconds),
                      ].join('  ·  '),
                      style: const TextStyle(fontSize: 12, color: Brand.muted),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right_rounded, color: Brand.muted),
              IconButton(
                onPressed: onClose,
                icon: const Icon(Icons.close_rounded, size: 19, color: Brand.muted),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _EmptyCard extends StatelessWidget {
  const _EmptyCard();

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 32),
      padding: const EdgeInsets.all(20),
      decoration: glassSurface(radius: 18),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.satellite_alt_outlined, size: 30, color: Brand.muted),
          const SizedBox(height: 10),
          Text(tr('fleet.noLive'),
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800)),
          const SizedBox(height: 6),
          Text(tr('fleet.noLiveHint'),
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 12, height: 1.5, color: Brand.muted)),
        ],
      ),
    );
  }
}

class _Banner extends StatelessWidget {
  const _Banner({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: Brand.danger.withValues(alpha: 0.9),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(text,
          textAlign: TextAlign.center,
          style: const TextStyle(
              fontSize: 11.5, fontWeight: FontWeight.w800, color: Colors.white)),
    );
  }
}

class _MapButton extends StatelessWidget {
  const _MapButton({required this.icon, required this.tooltip, required this.onTap});

  final IconData icon;
  final String tooltip;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: Material(
        color: Brand.panel,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: const BorderSide(color: Brand.border),
        ),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: SizedBox(
            width: 42,
            height: 42,
            child: Icon(icon, size: 20, color: Brand.text),
          ),
        ),
      ),
    );
  }
}

class _Attribution extends StatelessWidget {
  const _Attribution();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
      color: Colors.white.withValues(alpha: 0.7),
      child: const Text(
        '© OpenStreetMap',
        textDirection: TextDirection.ltr,
        style: TextStyle(fontSize: 9, color: Color(0xFF333333)),
      ),
    );
  }
}
