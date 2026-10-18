import 'package:flutter/material.dart';

import '../i18n.dart';
import '../services/api_client.dart';
import '../services/fleet_store.dart';
import '../screens/vehicle_details_screen.dart';
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

/// يفتح صفحة المركبة. [store] لم يعد مستخدمًا لكنه باقٍ في التوقيع لأن
/// الخريطة والقائمة تمرّرانه.
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
  return Navigator.of(context).push<void>(
    MaterialPageRoute(
      builder: (_) => VehicleDetailsScreen(
        vehicleId: vehicleId,
        api: api,
        token: token,
        onShowOnMap: onShowOnMap,
        onShowHistory: onShowHistory,
      ),
    ),
  );
}
