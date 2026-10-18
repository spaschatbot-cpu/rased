import 'package:flutter/material.dart';

import '../i18n.dart';
import '../services/api_client.dart';
import '../services/fleet_store.dart';
import '../theme.dart';

/// لون كل حالة — نفس ألوان الخريطة الحيّة في الموقع.
Color statusColor(String status) => switch (status) {
      'moving' => Brand.green,
      'idle' => Brand.warn,
      'stopped' => Brand.danger,
      _ => Palette.muted,
    };

const fleetStatuses = ['moving', 'idle', 'stopped', 'offline'];

/// «منذ ٣ دقائق» — المدير يريد أن يعرف إن كان الموقع حديثًا، لا الساعة بالثانية.
String ageLabel(int seconds) {
  if (seconds < 10) return tr('time.now');
  if (seconds < 60) return tr1('fleet.seconds', seconds);
  if (seconds < 3600) return tr1('time.minutes', seconds ~/ 60);
  if (seconds < 86400) return tr1('time.hours', seconds ~/ 3600);
  return tr1('time.days', seconds ~/ 86400);
}

/// عنوان الصفحة: أيقونة في مربّع، والعنوان، وسطر يصف ما فيها.
class PageHeader extends StatelessWidget {
  const PageHeader({
    super.key,
    required this.icon,
    required this.title,
    this.subtitle,
    this.trailing,
  });

  final IconData icon;
  final String title;
  final String? subtitle;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 4),
      child: Row(
        children: [
          Container(
            width: 42,
            height: 42,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: Brand.green.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(13),
              border: Border.all(color: Brand.green.withValues(alpha: 0.25)),
            ),
            child: Icon(icon, size: 21, color: Brand.green),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
                if (subtitle != null) ...[
                  const SizedBox(height: 1),
                  Text(subtitle!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 11.5, color: Palette.muted)),
                ],
              ],
            ),
          ),
          if (trailing != null) trailing!,
        ],
      ),
    );
  }
}

/// شارة الحالة: نقطة ملوّنة ونصّها.
class StatusPill extends StatelessWidget {
  const StatusPill({super.key, required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    final tone = statusColor(status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: tone.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: tone.withValues(alpha: 0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 7,
            height: 7,
            decoration: BoxDecoration(color: tone, shape: BoxShape.circle),
          ),
          const SizedBox(width: 6),
          Text(
            tr('fleet.status.$status'),
            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: tone),
          ),
        ],
      ),
    );
  }
}

/// تفاصيل مركبة في لوحة من أسفل الشاشة.
///
/// [onShowOnMap] يظهر زرًّا ينقل إلى الخريطة — يُمرَّر من قائمة المركبات،
/// ويُترك فارغًا حين تُفتح اللوحة من الخريطة نفسها.
Future<void> showVehicleSheet(
  BuildContext context, {
  required FleetStore store,
  required int vehicleId,
  required ApiClient api,
  required String token,
  VoidCallback? onShowOnMap,
  VoidCallback? onShowHistory,
}) {
  return showModalBottomSheet<void>(
    context: context,
    backgroundColor: Palette.panel,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
    ),
    builder: (context) => AnimatedBuilder(
      animation: store,
      builder: (context, _) {
        final vehicle = store.byId(vehicleId);
        if (vehicle == null) return const SizedBox(height: 120);
        return _VehicleSheet(
          vehicle: vehicle,
          api: api,
          token: token,
          onShowOnMap: onShowOnMap,
          onShowHistory: onShowHistory,
        );
      },
    ),
  );
}

class _VehicleSheet extends StatefulWidget {
  const _VehicleSheet({
    required this.vehicle,
    required this.api,
    required this.token,
    this.onShowOnMap,
    this.onShowHistory,
  });

  final FleetVehicle vehicle;
  final ApiClient api;
  final String token;
  final VoidCallback? onShowOnMap;
  final VoidCallback? onShowHistory;

  @override
  State<_VehicleSheet> createState() => _VehicleSheetState();
}

class _VehicleSheetState extends State<_VehicleSheet> {
  String? _place;

  @override
  void initState() {
    super.initState();
    _lookUp();
  }

  /// اسم المكان مرة واحدة عند الفتح — الإحداثيات تكفي إن تعذّر.
  Future<void> _lookUp() async {
    final pos = widget.vehicle.position;
    if (pos == null) return;
    final place = await widget.api.place(pos.point.latitude, pos.point.longitude, widget.token);
    if (mounted && place != null) setState(() => _place = place);
  }

  @override
  Widget build(BuildContext context) {
    final v = widget.vehicle;
    final pos = v.position;

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 10, 20, 18),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: Palette.border,
                  borderRadius: BorderRadius.circular(99),
                ),
              ),
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                Container(
                  width: 42,
                  height: 42,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: statusColor(v.status).withValues(alpha: 0.14),
                    borderRadius: BorderRadius.circular(13),
                  ),
                  child: Icon(Icons.local_shipping_outlined,
                      size: 21, color: statusColor(v.status)),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        v.plate,
                        textDirection: TextDirection.ltr,
                        style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
                      ),
                      if (v.model.isNotEmpty)
                        Text(v.model,
                            style: TextStyle(fontSize: 12, color: Palette.muted)),
                    ],
                  ),
                ),
                StatusPill(status: v.status),
              ],
            ),
            const SizedBox(height: 16),

            if (pos == null)
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.035),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Row(
                  children: [
                    Icon(Icons.portable_wifi_off_rounded, size: 18, color: Palette.muted),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(tr('fleet.neverReported'),
                          style: TextStyle(fontSize: 12.5, color: Palette.muted)),
                    ),
                  ],
                ),
              )
            else
              Row(
                children: [
                  Expanded(
                    child: _Stat(
                      icon: Icons.speed_rounded,
                      label: tr('fleet.speed'),
                      value: '${pos.speed} ${tr('fleet.kmh')}',
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _Stat(
                      icon: Icons.schedule_rounded,
                      label: tr('fleet.lastUpdate'),
                      value: ageLabel(pos.ageSeconds),
                    ),
                  ),
                ],
              ),
            const SizedBox(height: 12),

            if (pos != null)
              _Line(
                icon: Icons.place_outlined,
                label: tr('fleet.address'),
                value: _place ??
                    '${pos.point.latitude.toStringAsFixed(5)}, '
                        '${pos.point.longitude.toStringAsFixed(5)}',
              ),
            _Line(
              icon: Icons.person_outline,
              label: tr('fleet.driver'),
              value: v.driver.isEmpty ? tr('fleet.noDriver') : v.driver,
            ),
            if (v.imei.isNotEmpty)
              _Line(icon: Icons.memory_rounded, label: tr('fleet.imei'), value: v.imei),
            if (pos?.battery != null)
              _Line(
                icon: Icons.battery_std_rounded,
                label: tr('fleet.battery'),
                value: '${pos!.battery}%',
              ),

            const SizedBox(height: 14),
            Row(
              children: [
                if (widget.onShowOnMap != null && pos != null) ...[
                  Expanded(
                    child: FilledButton.icon(
                      onPressed: () {
                        Navigator.of(context).pop();
                        widget.onShowOnMap!();
                      },
                      icon: const Icon(Icons.map_outlined, size: 19),
                      label: Text(tr('fleet.showOnMap')),
                    ),
                  ),
                  const SizedBox(width: 10),
                ],
                if (widget.onShowHistory != null)
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () {
                        Navigator.of(context).pop();
                        widget.onShowHistory!();
                      },
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Palette.text,
                        side: BorderSide(color: Palette.border),
                        minimumSize: const Size.fromHeight(54),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                      ),
                      icon: const Icon(Icons.history_rounded, size: 19),
                      label: Text(tr('fleet.history')),
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.icon, required this.label, required this.value});

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.035),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Palette.border.withValues(alpha: 0.6)),
      ),
      child: Row(
        children: [
          Icon(icon, size: 18, color: Brand.green),
          const SizedBox(width: 9),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: TextStyle(fontSize: 10.5, color: Palette.muted)),
                Text(value,
                    style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w900)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Line extends StatelessWidget {
  const _Line({required this.icon, required this.label, required this.value});

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 17, color: Palette.muted),
          const SizedBox(width: 10),
          SizedBox(
            width: 82,
            child: Text(label, style: TextStyle(fontSize: 12, color: Palette.muted)),
          ),
          Expanded(
            child: Text(value,
                style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );
  }
}
