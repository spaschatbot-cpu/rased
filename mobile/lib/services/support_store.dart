import 'dart:async';

import 'package:flutter/foundation.dart';

import 'api_client.dart';

/// رسالة واحدة في محادثة الدعم.
class SupportMessage {
  SupportMessage({
    required this.id,
    required this.fromDriver,
    required this.text,
    required this.at,
    this.authorAr = '',
    this.authorEn = '',
    this.pending = false,
  });

  factory SupportMessage.fromJson(Map<String, dynamic> json) => SupportMessage(
        id: '${json['id']}',
        fromDriver: json['from'] == 'driver',
        text: '${json['text'] ?? ''}',
        authorAr: '${json['authorAr'] ?? ''}',
        authorEn: '${json['authorEn'] ?? ''}',
        at: DateTime.tryParse('${json['at']}')?.toLocal() ?? DateTime.now(),
      );

  final String id;

  /// من كتبها: السائق أم الإدارة. الجهة تُقرأ من السيرفر لا من الشاشة.
  final bool fromDriver;

  final String text;
  final String authorAr;
  final String authorEn;
  final DateTime at;

  /// رسالة كُتبت ولم يؤكّدها السيرفر بعد — تظهر باهتة بدل أن تختفي.
  final bool pending;
}

/// محادثة الدعم الفني بين السائق والإدارة.
///
/// السؤال دوريّ كصندوق التنبيهات وللسبب نفسه: لا قناة دفع في المنصّة، وردّ
/// الإدارة الذي لا يصل إلا بفتح الشاشة ليس ردًّا. الفارق أن المدّة هنا أقصر
/// حين تكون الشاشة مفتوحة — من ينتظر جوابًا ينتظره الآن.
class SupportStore extends ChangeNotifier {
  SupportStore({required ApiClient api}) : _api = api;

  final ApiClient _api;

  /// خارج الشاشة: يكفي أن تصل الشارة خلال دقيقة.
  static const _idlePoll = Duration(minutes: 1);

  /// داخل الشاشة: الجواب يُنتظر، لا يُكتشف لاحقًا.
  static const _activePoll = Duration(seconds: 10);

  Timer? _timer;
  String? _token;
  bool _busy = false;
  bool _watching = false;

  List<SupportMessage> messages = const [];
  int unread = 0;
  bool offline = false;

  /// آخر إرسال فشل — تُعرض تحت الحقل ولا تُفقد الرسالة معها.
  String? sendError;

  /// يبدأ المتابعة، أو يوقفها حين تنتهي الجلسة ([token] فارغًا).
  void watch(String? token) {
    if (token == _token) return;
    _token = token;
    _timer?.cancel();

    if (token == null) {
      messages = const [];
      unread = 0;
      offline = false;
      sendError = null;
      _watching = false;
      notifyListeners();
      return;
    }

    _restartTimer();
    refresh();
  }

  void _restartTimer() {
    _timer?.cancel();
    if (_token == null) return;
    _timer = Timer.periodic(_watching ? _activePoll : _idlePoll, (_) => refresh());
  }

  /// تُستدعى عند فتح شاشة المحادثة وإغلاقها: تسرّع السؤال أثناء القراءة فقط،
  /// فالبطارية لا تُدفع ثمنًا لشاشة مغلقة.
  void setActive(bool active) {
    if (_watching == active) return;
    _watching = active;
    _restartTimer();
    if (active) refresh();
  }

  Future<void> refresh() async {
    final token = _token;
    if (token == null || _busy) return;
    _busy = true;

    try {
      final result = await _api.support(token);
      messages = result.messages.map(SupportMessage.fromJson).toList();
      unread = result.unread;
      offline = false;
    } on ApiException catch (e) {
      /* انتهاء الجلسة يعالجه المتتبّع — الدعم لا يُخرج أحدًا من التطبيق */
      offline = !e.isAuthFailure;
    } finally {
      _busy = false;
      notifyListeners();
    }
  }

  /// تصفير الشارة. يجري عند فتح الشاشة: الفتح هو القراءة.
  Future<void> markRead() async {
    final token = _token;
    if (token == null || unread == 0) return;

    unread = 0;
    notifyListeners();

    try {
      await _api.markSupportRead(token);
    } on ApiException {
      /* يظهر الرقم من جديد في التحديث التالي — لا يستحق مقاطعة السائق */
    }
  }

  /// إرسال رسالة.
  ///
  /// تظهر في القائمة قبل أن يردّ السيرفر: من ضغط «إرسال» يريد أن يرى ما كتبه
  /// في مكانه، لا حقلًا فارغًا وانتظارًا. وحين يفشل الإرسال تبقى الرسالة
  /// معلّمة كمعلّقة ويُقال السبب، فلا يظنّ أن الإدارة قرأت ما لم يصلها.
  Future<bool> send(String text) async {
    final token = _token;
    final body = text.trim();
    if (token == null || body.isEmpty) return false;

    final optimistic = SupportMessage(
      id: 'local-${DateTime.now().microsecondsSinceEpoch}',
      fromDriver: true,
      text: body,
      at: DateTime.now(),
      pending: true,
    );
    messages = [...messages, optimistic];
    sendError = null;
    notifyListeners();

    try {
      final rows = await _api.sendSupport(body, token);
      messages = rows.map(SupportMessage.fromJson).toList();
      offline = false;
      notifyListeners();
      return true;
    } on ApiException catch (e) {
      sendError = e.message;
      notifyListeners();
      return false;
    }
  }

  /// إزالة رسالة معلّقة فشل إرسالها — يستدعيها زرّ «إعادة المحاولة» بعد نجاحه.
  void dropPending() {
    if (!messages.any((m) => m.pending)) return;
    messages = messages.where((m) => !m.pending).toList();
    sendError = null;
    notifyListeners();
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }
}
