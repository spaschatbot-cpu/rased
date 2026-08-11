import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config.dart';

/// خطأ قادم من السيرفر — يحمل رمز الحالة لأن التطبيق يتصرّف بناءً عليه:
/// `401` وحده يُخرج السائق، وما عداه يعني «احتفظ بالنقاط وأعد المحاولة».
class ApiException implements Exception {
  ApiException(this.message, this.status);

  final String message;

  /// `0` يعني أن الطلب لم يصل أصلًا (لا شبكة).
  final int status;

  bool get isAuthFailure => status == 401;
  bool get isNetworkFailure => status == 0;

  @override
  String toString() => 'ApiException($status): $message';
}

/// غلاف رفيع حول مسارات `/api`.
///
/// لا يعرف شيئًا عن الشاشات: يستقبل ويعيد بيانات فقط، ويرمي [ApiException]
/// عند أي رد غير ناجح، فتتعامل الطبقة الأعلى مع حالة واحدة بدل تفريعات.
class ApiClient {
  ApiClient({http.Client? client}) : _http = client ?? http.Client();

  final http.Client _http;

  Future<Map<String, dynamic>> _send(
    String method,
    String path, {
    Map<String, dynamic>? body,
    String? token,
  }) async {
    final uri = Uri.parse('${Config.apiBase}$path');
    final headers = <String, String>{
      if (body != null) 'Content-Type': 'application/json; charset=utf-8',
      if (token != null) 'Authorization': 'Bearer $token',
    };

    late http.Response res;
    try {
      final request = http.Request(method, uri)..headers.addAll(headers);
      if (body != null) request.body = jsonEncode(body);
      final streamed = await _http.send(request).timeout(const Duration(seconds: 20));
      res = await http.Response.fromStream(streamed);
    } catch (_) {
      // انقطاع شبكة أو مهلة — ليس ردًا من السيرفر
      throw ApiException('تعذّر الاتصال بالخادم', 0);
    }

    Map<String, dynamic> data;
    try {
      data = jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>;
    } catch (_) {
      data = const {};
    }

    if (res.statusCode >= 200 && res.statusCode < 300) return data;
    throw ApiException(
      (data['error'] as String?) ?? 'فشل الطلب (${res.statusCode})',
      res.statusCode,
    );
  }

  /// تسجيل دخول السائق. `client: 'app'` يجعل السيرفر يعيد توكنًا بدل كوكي.
  Future<Map<String, dynamic>> login(String username, String password) {
    return _send('POST', '/auth/login', body: {
      'username': username,
      'password': password,
      'client': 'app',
    });
  }

  /// التحقق من صلاحية الجلسة المخزَّنة، وقراءة أي تغيير أجرته الإدارة
  /// على الحساب — كتبديل المركبة أو إيقافه.
  Future<Map<String, dynamic>?> me(String token) async {
    final data = await _send('GET', '/auth/me', token: token);
    return data['user'] as Map<String, dynamic>?;
  }

  /// إرسال نقطة أو دفعة. رقم المركبة لا يُرسل — السيرفر يقرأه من الحساب.
  Future<void> sendFixes(List<Map<String, dynamic>> points, String token) {
    if (points.isEmpty) return Future.value();
    final body = points.length == 1 ? points.first : {'points': points};
    return _send('POST', '/track', body: body, token: token);
  }

  /// إنهاء الوردية — تختفي المركبة من الخريطة الحية فورًا.
  Future<void> endShift(String token) => _send('DELETE', '/track', token: token);

  /// تنبيهات مركبة هذا السائق وحدها — السيرفر يرشّحها بالحساب لا التطبيق،
  /// فلا يصل إلى الجهاز ما لا يخصّ صاحبه أصلًا.
  Future<({List<Map<String, dynamic>> alerts, int unread})> alerts(String token) async {
    final data = await _send('GET', '/alerts', token: token);
    final rows = (data['alerts'] as List?) ?? const [];
    return (
      alerts: rows.cast<Map<String, dynamic>>(),
      unread: (data['unread'] as num?)?.toInt() ?? 0,
    );
  }

  /// ورديات هذا السائق — أحدثها أولًا، والجارية على رأسها إن وُجدت.
  Future<List<Map<String, dynamic>>> shifts(String token) async {
    final data = await _send('GET', '/shifts', token: token);
    return ((data['shifts'] as List?) ?? const []).cast<Map<String, dynamic>>();
  }

  /// محادثة الدعم الفني لهذا السائق. لا معرّف يُرسل — السيرفر يعرف صاحب
  /// التوكن، ولا يملك السائق إلا محادثة واحدة.
  Future<({List<Map<String, dynamic>> messages, int unread})> support(String token) async {
    final data = await _send('GET', '/support', token: token);
    final thread = (data['thread'] as Map<String, dynamic>?) ?? const {};
    final rows = (thread['messages'] as List?) ?? const [];
    return (
      messages: rows.cast<Map<String, dynamic>>(),
      unread: (data['unread'] as num?)?.toInt() ?? 0,
    );
  }

  /// إرسال رسالة إلى الإدارة. تعيد المحادثة بعد الإضافة، فلا حاجة لسؤال ثانٍ.
  Future<List<Map<String, dynamic>>> sendSupport(String text, String token) async {
    final data = await _send('POST', '/support', body: {'text': text}, token: token);
    final thread = (data['thread'] as Map<String, dynamic>?) ?? const {};
    return ((thread['messages'] as List?) ?? const []).cast<Map<String, dynamic>>();
  }

  /// تصفير عدّاد ما لم يُقرأ من ردود الإدارة.
  Future<void> markSupportRead(String token) => _send('PATCH', '/support', token: token);

  /// تعليم تنبيه واحد مقروءًا، أو الكلّ حين يكون [id] فارغًا.
  Future<void> markAlertRead(String? id, String token) {
    return _send('PATCH', id == null ? '/alerts' : '/alerts?id=$id', token: token);
  }

  /// اسم المكان عند إحداثيات. يعيد `null` لو تعذّر — الإحداثيات تبقى معروضة.
  ///
  /// البحث يجري على السيرفر لا في التطبيق: هناك ذاكرة مؤقتة يشترك فيها كل
  /// السائقين، وهناك أيضًا حدّ الطلبات الذي تفرضه خدمة الخرائط ولا يمكن
  /// احترامه من عشرات الهواتف كلٌّ يسأل وحده.
  Future<String?> place(double lat, double lng, String token) async {
    try {
      final data = await _send('GET', '/geocode?lat=$lat&lng=$lng', token: token);
      final place = data['place'] as Map<String, dynamic>?;
      return place?['ar'] as String?;
    } on ApiException {
      // اسم المكان تحسين لا أكثر — فشله لا يعني شيئًا للوردية
      return null;
    }
  }
}
