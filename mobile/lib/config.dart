import 'package:flutter/foundation.dart';

/// إعدادات الاتصال بالسيرفر.
///
///   flutter build apk --dart-define=API_BASE=https://mirsad.sa/api
class Config {
  static const _configured = String.fromEnvironment('API_BASE');

  /// عنوان الـAPI.
  ///
  /// على الويب — حيث يُخدَم التطبيق من الموقع نفسه — يُشتقّ العنوان من الصفحة
  /// الحالية. تثبيته وقت البناء يكسر الأمر: نسخة مبنية على عنوان الشبكة
  /// المحلية تُرفض حين تُفتح من `localhost` لأن المتصفح يعتبرهما أصلين
  /// مختلفين ويمنع الطلب.
  static String get apiBase {
    if (_configured.isNotEmpty) return _configured;
    if (kIsWeb) return '${Uri.base.origin}/api';
    /// `10.0.2.2` هو المنفذ الذي يرى به محاكي أندرويد جهازك.
    /// على جهاز حقيقي مرّر عنوان الشبكة المحلية عبر `--dart-define`.
    return 'http://10.0.2.2:5180/api';
  }

  /// كل كم يُرسل ما تجمّع. أطول = بطارية أطول وتكلفة أقل،
  /// وأقصر = حركة أنعم على خريطة الإدارة.
  static const sendEvery = Duration(seconds: 30);

  /// أقل مسافة (متر) تستحق قراءة جديدة — تمنع الاهتزاز والمركبة واقفة.
  static const distanceFilterMetres = 10;

  /// سقف ما تحتفظ به قائمة الانتظار عند انقطاع الشبكة.
  /// السيرفر يقبل 200 نقطة في الطلب الواحد.
  static const maxQueued = 200;
}
