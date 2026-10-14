import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:latlong2/latlong.dart';

import '../i18n.dart';
import 'api_client.dart';

/// آخر موقع أرسلته مركبة.
class LivePosition {
  LivePosition({
    required this.point,
    required this.speed,
    required this.heading,
    required this.status,
    required this.ageSeconds,
    this.battery,
  });

  factory LivePosition.fromJson(Map<String, dynamic> json) => LivePosition(
        point: LatLng((json['lat'] as num).toDouble(), (json['lng'] as num).toDouble()),
        speed: (json['speed'] as num?)?.toInt() ?? 0,
        heading: (json['heading'] as num?)?.toInt() ?? 0,
        status: '${json['status'] ?? 'offline'}',
        ageSeconds: (json['ageSeconds'] as num?)?.toInt() ?? 0,
        battery: (json['battery'] as num?)?.toInt(),
      );

  final LatLng point;
  final int speed;
  final int heading;

  /// `moving` · `idle` · `stopped` · `offline` — كما يحسبها السيرفر.
  final String status;

  /// عمر النقطة بساعة السيرفر، لا بساعة الهاتف التي قد تكون خاطئة.
  final int ageSeconds;
  final int? battery;
}

/// مركبة من السجلّ، ومعها آخر موقع لها إن وُجد.
class FleetVehicle {
  FleetVehicle({
    required this.id,
    required this.plate,
    required this.modelAr,
    required this.modelEn,
    required this.driverAr,
    required this.driverEn,
    required this.imei,
    this.position,
  });

  factory FleetVehicle.fromJson(Map<String, dynamic> json) => FleetVehicle(
        id: (json['id'] as num).toInt(),
        plate: '${json['plate'] ?? ''}',
        modelAr: '${json['modelAr'] ?? ''}',
        modelEn: '${json['modelEn'] ?? ''}',
        driverAr: '${json['driverAr'] ?? ''}',
        driverEn: '${json['driverEn'] ?? ''}',
        imei: '${json['imei'] ?? ''}',
      );

  final int id;
  final String plate;
  final String modelAr;
  final String modelEn;
  final String driverAr;
  final String driverEn;
  final String imei;
  LivePosition? position;

  String get model => _pick(modelAr, modelEn);
  String get driver => _pick(driverAr, driverEn);

  /// مركبة لم ترسل شيئًا قط تُعامل كغير متصلة، لا كمتوقفة.
  String get status => position?.status ?? 'offline';
  bool get hasPosition => position != null;

  /// اللغة المختارة أولًا، والأخرى بديل — حقل فارغ أسوأ من حقل بلغة أخرى.
  static String _pick(String ar, String en) {
    final first = AppLocale.isArabic ? ar : en;
    return first.trim().isNotEmpty ? first.trim() : (AppLocale.isArabic ? en : ar).trim();
  }
}

/// الأسطول كما تراه الخريطة وقائمة المركبات.
///
/// المواقع تُسأل كل عشر ثوانٍ والسجلّ كل دقيقة: الموقع يتغيّر باستمرار، أما
/// اللوحة والسائق فنادرًا. والسؤال يتوقف كله حين لا توجد جلسة.
class FleetStore extends ChangeNotifier {
  FleetStore({required ApiClient api}) : _api = api;

  final ApiClient _api;

  /// الجلسة انتهت أو أُوقف الحساب — التطبيق يُخرج المستخدم.
  VoidCallback? onAuthFailure;

  static const _positionsEvery = Duration(seconds: 10);
  static const _vehiclesEvery = Duration(seconds: 60);

  String? _token;
  Timer? _positionsTimer;
  Timer? _vehiclesTimer;

  List<FleetVehicle> vehicles = [];

  /// لم يصل أي رد بعد — الشاشات تعرض انتظارًا لا «لا توجد مركبات».
  bool loading = true;

  /// آخر محاولة فشلت. ما وصل قبلها يبقى معروضًا.
  bool offline = false;

  DateTime? updatedAt;

  Map<int, LivePosition> _positions = {};

  void watch(String? token) {
    if (token == _token) return;
    _token = token;
    _positionsTimer?.cancel();
    _vehiclesTimer?.cancel();

    if (token == null) {
      vehicles = [];
      _positions = {};
      loading = true;
      offline = false;
      updatedAt = null;
      notifyListeners();
      return;
    }

    refresh();
    _positionsTimer = Timer.periodic(_positionsEvery, (_) => _loadPositions());
    _vehiclesTimer = Timer.periodic(_vehiclesEvery, (_) => _loadVehicles());
  }

  Future<void> refresh() async {
    await _loadVehicles();
    await _loadPositions();
  }

  FleetVehicle? byId(int id) {
    for (final v in vehicles) {
      if (v.id == id) return v;
    }
    return null;
  }

  int count(String status) => vehicles.where((v) => v.status == status).length;

  Future<void> _loadVehicles() async {
    final token = _token;
    if (token == null) return;
    try {
      final rows = await _api.vehicles(token);
      if (token != _token) return;
      vehicles = rows.map(FleetVehicle.fromJson).toList()
        ..sort((a, b) => a.plate.compareTo(b.plate));
      _attach();
      offline = false;
    } on ApiException catch (e) {
      offline = true;
      if (e.isAuthFailure) onAuthFailure?.call();
    }
    notifyListeners();
  }

  Future<void> _loadPositions() async {
    final token = _token;
    if (token == null) return;
    try {
      final rows = await _api.positions(token);
      if (token != _token) return;
      _positions = {
        for (final row in rows)
          if (row['vehicleId'] != null && row['lat'] != null && row['lng'] != null)
            (row['vehicleId'] as num).toInt(): LivePosition.fromJson(row),
      };
      _attach();
      offline = false;
      updatedAt = DateTime.now();
    } on ApiException catch (e) {
      offline = true;
      if (e.isAuthFailure) onAuthFailure?.call();
    }
    loading = false;
    notifyListeners();
  }

  void _attach() {
    for (final v in vehicles) {
      v.position = _positions[v.id];
    }
  }

  @override
  void dispose() {
    _positionsTimer?.cancel();
    _vehiclesTimer?.cancel();
    super.dispose();
  }
}
