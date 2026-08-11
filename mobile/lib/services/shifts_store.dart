import 'package:flutter/foundation.dart';

import 'api_client.dart';

/// وردية واحدة كما سجّلها السيرفر.
class Shift {
  Shift({
    required this.id,
    required this.startedAt,
    required this.minutes,
    required this.reason,
    this.endedAt,
    this.maxSpeed = 0,
  });

  factory Shift.fromJson(Map<String, dynamic> json) => Shift(
        id: '${json['id']}',
        startedAt: DateTime.tryParse('${json['startedAt']}')?.toLocal() ?? DateTime.now(),
        endedAt: json['endedAt'] == null
            ? null
            : DateTime.tryParse('${json['endedAt']}')?.toLocal(),
        minutes: (json['minutes'] as num?)?.toInt() ?? 0,
        maxSpeed: (json['maxSpeed'] as num?)?.toInt() ?? 0,
        reason: '${json['reason'] ?? 'ended'}',
      );

  final String id;
  final DateTime startedAt;

  /// `null` للوردية الجارية الآن.
  final DateTime? endedAt;

  final int minutes;
  final int maxSpeed;

  /// `open` جارية، `ended` أنهاها السائق، `stale` انقطع الإرسال فأُغلقت.
  final String reason;

  bool get isOpen => endedAt == null;

  /// أُغلقت لانقطاع الإرسال لا بضغطة زر — تُعرض بعلامة، فساعات هذه الوردية
  /// تنتهي عند آخر دليل على أن السائق كان يعمل، لا عند لحظة عودته.
  bool get wasCutOff => reason == 'stale';
}

/// سجلّ ورديات السائق.
///
/// يُسأل عند فتح التبويب لا دوريًّا: الورديات لا تتغيّر إلا مرتين في اليوم،
/// وسؤال دوري عنها إنفاق للبطارية على إجابة معروفة.
class ShiftsStore extends ChangeNotifier {
  ShiftsStore({required ApiClient api}) : _api = api;

  final ApiClient _api;

  String? _token;
  bool _busy = false;

  List<Shift> shifts = const [];

  /// لم يُسأل السيرفر بعد — تفرّق بين «لا ورديات» و«لم نعرف بعد»، والشاشة
  /// تعرض في الأولى رسالة وفي الثانية دوّارة.
  bool loaded = false;
  bool offline = false;

  void watch(String? token) {
    if (token == _token) return;
    _token = token;
    shifts = const [];
    loaded = false;
    offline = false;
    notifyListeners();
  }

  Future<void> refresh() async {
    final token = _token;
    if (token == null || _busy) return;
    _busy = true;

    try {
      shifts = (await _api.shifts(token)).map(Shift.fromJson).toList();
      offline = false;
    } on ApiException catch (e) {
      offline = !e.isAuthFailure;
    } finally {
      _busy = false;
      loaded = true;
      notifyListeners();
    }
  }
}
