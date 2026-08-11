import 'dart:async';

import 'package:flutter/foundation.dart';

import 'api_client.dart';

/// تنبيه واحد على مركبة السائق.
class DriverAlert {
  DriverAlert({
    required this.id,
    required this.type,
    required this.severity,
    required this.at,
    this.detail,
    this.read = false,
  });

  factory DriverAlert.fromJson(Map<String, dynamic> json) => DriverAlert(
        id: '${json['id']}',
        type: '${json['type']}',
        severity: '${json['severity'] ?? 'low'}',
        detail: json['detail'] as String?,
        read: json['read'] == true,
        /* وقت الحدث لا وقت وصوله: هاتف أرسل دفعة متأخرة يجب ألا يقفز فوق
           تنبيه أحدث منه لمجرّد أن الشبكة عادت عنده لاحقًا */
        at: DateTime.tryParse('${json['at']}')?.toLocal() ?? DateTime.now(),
      );

  final String id;
  final String type;
  final String severity;
  final String? detail;
  final DateTime at;
  final bool read;
}

/// صندوق تنبيهات السائق.
///
/// يُسأل السيرفر دوريًّا لأن المنصّة لا تملك قناة دفع: لا مقبس مفتوح ولا
/// إشعارات سحابية، فالسؤال كل دقيقة هو ما يجعل الجرس يعني شيئًا.
///
/// السؤال يجري خارج الوردية أيضًا. تنبيه صيانة مستحقّة أو انقطاع طاقة يعني
/// السائق قبل أن ينطلق لا بعده، وإخفاؤه حتى يضغط «بدء الوردية» يخفيه في
/// اللحظة الوحيدة التي كان يمكنه التصرّف فيها.
class AlertsStore extends ChangeNotifier {
  AlertsStore({required ApiClient api}) : _api = api;

  final ApiClient _api;

  /// كم يمرّ بين سؤال وآخر. التنبيهات أندر من النقاط بكثير، والبطارية تُحسب.
  static const _pollEvery = Duration(minutes: 1);

  Timer? _timer;
  String? _token;
  bool _busy = false;

  List<DriverAlert> alerts = const [];
  int unread = 0;

  /// تعذّر آخر تحديث. لا يُمسح ما وصل سابقًا — صندوق قديم أنفع من فارغ.
  bool offline = false;

  /// يبدأ المتابعة، أو يوقفها حين تنتهي الجلسة ([token] فارغًا).
  void watch(String? token) {
    if (token == _token) return;
    _token = token;
    _timer?.cancel();

    if (token == null) {
      alerts = const [];
      unread = 0;
      offline = false;
      notifyListeners();
      return;
    }

    refresh();
    _timer = Timer.periodic(_pollEvery, (_) => refresh());
  }

  Future<void> refresh() async {
    final token = _token;
    if (token == null || _busy) return;
    _busy = true;

    try {
      final result = await _api.alerts(token);
      alerts = result.alerts.map(DriverAlert.fromJson).toList();
      unread = result.unread;
      offline = false;
    } on ApiException catch (e) {
      /* انتهاء الجلسة يعالجه المتتبّع — الجرس لا يُخرج أحدًا من التطبيق */
      offline = !e.isAuthFailure;
    } finally {
      _busy = false;
      notifyListeners();
    }
  }

  /// يعلّم الكلّ مقروءًا. العدّاد يصفر فورًا ثم يُثبَّت من ردّ السيرفر: انتظار
  /// الشبكة قبل إطفاء الشارة يجعل الضغطة تبدو بلا أثر.
  Future<void> markAllRead() async {
    final token = _token;
    if (token == null || unread == 0) return;

    alerts = [
      for (final a in alerts)
        DriverAlert(
          id: a.id,
          type: a.type,
          severity: a.severity,
          detail: a.detail,
          at: a.at,
          read: true,
        ),
    ];
    unread = 0;
    notifyListeners();

    try {
      await _api.markAlertRead(null, token);
    } on ApiException {
      /* فشل التعليم يظهر وحده في التحديث التالي، ولا يستحق مقاطعة السائق */
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }
}
