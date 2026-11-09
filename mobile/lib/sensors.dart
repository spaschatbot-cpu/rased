/// The optional sensors a tracker may report — the app's copy of
/// shared/sensors.js on the web side. Keep the two lists in step: a key the
/// server sends that is missing here is simply not shown.
///
/// A vehicle shows only the sensors its device actually reported, so a fuel
/// probe or a door switch fitted later appears on its own.
import 'package:flutter/material.dart';

import 'i18n.dart';

enum SensorKind { number, flag, choice, text }

class SensorSpec {
  const SensorSpec(this.key, this.kind, this.ar, this.en, this.icon,
      {this.unit = '', this.decimals = 0, this.on, this.off, this.values, this.alarm = false, this.extra = false});

  final String key;
  final SensorKind kind;
  final String ar;
  final String en;
  final IconData icon;
  final String unit;
  final int decimals;
  final (String, String)? on;
  final (String, String)? off;
  final Map<String, (String, String)>? values;

  /// A flag that means trouble when it is on — shown in red.
  final bool alarm;

  /// Few vehicles have it (a second to fourth probe) — listed only once reported.
  final bool extra;

  String get label => AppLocale.isArabic ? ar : en;

  /// «—» when the device does not report this sensor.
  String format(Object? value) {
    if (value == null) return '—';
    String pick((String, String) p) => AppLocale.isArabic ? p.$1 : p.$2;
    switch (kind) {
      case SensorKind.flag:
        return value == true ? pick(on!) : pick(off!);
      case SensorKind.choice:
        final v = values?[value];
        return v == null ? '$value' : pick(v);
      case SensorKind.text:
        return '$value';
      case SensorKind.number:
        final n = (value as num).toDouble();
        return '${n.toStringAsFixed(decimals)} $unit'.trim();
    }
  }

  bool isAlarm(Object? value) => alarm && value == true;
}

/// Shown in the fixed tiles above the sensor list, not repeated in it.
const fixedSensors = {'ignition', 'power'};

const sensorSpecs = <SensorSpec>[
  SensorSpec('ignition', SensorKind.flag, 'المحرك', 'Ignition', Icons.power_settings_new_rounded,
      on: ('يعمل', 'On'), off: ('متوقف', 'Off')),
  SensorSpec('power', SensorKind.number, 'فولت الطاقة', 'Supply voltage', Icons.electrical_services_rounded,
      unit: 'V', decimals: 1),
  SensorSpec('fuel', SensorKind.number, 'مستوى الوقود', 'Fuel level', Icons.local_gas_station_rounded, unit: '%'),
  SensorSpec('fuelLiters', SensorKind.number, 'الوقود باللتر', 'Fuel', Icons.local_gas_station_outlined,
      unit: 'L', decimals: 1),
  SensorSpec('fuelUsed', SensorKind.number, 'الوقود المستهلك', 'Fuel used', Icons.opacity_rounded,
      unit: 'L', decimals: 1),
  SensorSpec('temperature', SensorKind.number, 'الحرارة', 'Temperature', Icons.thermostat_rounded,
      unit: '°C', decimals: 1),
  SensorSpec('temperature2', SensorKind.number, 'الحرارة ٢', 'Temperature 2', Icons.thermostat_rounded,
      unit: '°C', decimals: 1, extra: true),
  SensorSpec('temperature3', SensorKind.number, 'الحرارة ٣', 'Temperature 3', Icons.thermostat_rounded,
      unit: '°C', decimals: 1, extra: true),
  SensorSpec('temperature4', SensorKind.number, 'الحرارة ٤', 'Temperature 4', Icons.thermostat_rounded,
      unit: '°C', decimals: 1, extra: true),
  SensorSpec('humidity', SensorKind.number, 'الرطوبة', 'Humidity', Icons.water_drop_outlined, unit: '%'),
  SensorSpec('weight', SensorKind.number, 'الحمولة', 'Load weight', Icons.scale_rounded, unit: 'kg'),
  SensorSpec('door', SensorKind.flag, 'الباب', 'Door', Icons.door_front_door_outlined,
      on: ('مفتوح', 'Open'), off: ('مغلق', 'Closed'), alarm: true),
  SensorSpec('tank', SensorKind.flag, 'غطاء الخزان', 'Tank lid', Icons.local_gas_station_rounded,
      on: ('مفتوح', 'Open'), off: ('مغلق', 'Closed'), alarm: true),
  SensorSpec('mixer', SensorKind.flag, 'الخلاطة', 'Mixer drum', Icons.autorenew_rounded,
      on: ('تدور', 'Rotating'), off: ('متوقفة', 'Stopped')),
  SensorSpec('crash', SensorKind.flag, 'تصادم', 'Crash', Icons.car_crash_rounded,
      on: ('تم رصد تصادم', 'Detected'), off: ('لا', 'No'), alarm: true),
  SensorSpec('towing', SensorKind.flag, 'سحب المركبة', 'Towing', Icons.rv_hookup_rounded,
      on: ('يتم سحبها', 'Being towed'), off: ('لا', 'No'), alarm: true),
  SensorSpec('unplugged', SensorKind.flag, 'فصل الجهاز', 'Device unplugged', Icons.power_off_rounded,
      on: ('مفصول', 'Unplugged'), off: ('متصل', 'Connected'), alarm: true),
  SensorSpec('harsh', SensorKind.choice, 'قيادة عنيفة', 'Harsh driving', Icons.warning_amber_rounded, values: {
    'accel': ('تسارع مفاجئ', 'Harsh acceleration'),
    'brake': ('فرملة مفاجئة', 'Harsh braking'),
    'corner': ('انعطاف حاد', 'Harsh cornering'),
  }),
  SensorSpec('driverKey', SensorKind.text, 'بطاقة السائق', 'Driver ID card', Icons.badge_outlined),
];

/// Every sensor, in display order, with this fix's reading — `null` (shown
/// as «—») for one the device does not send, so the screen shows what a
/// fitted device would add.
List<(SensorSpec, Object?)> allSensors(Map<String, dynamic>? fix) => [
      for (final s in sensorSpecs)
        if (!fixedSensors.contains(s.key) && (!s.extra || fix?[s.key] != null)) (s, fix?[s.key] as Object?),
    ];
