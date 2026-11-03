import 'dart:js_interop';
import 'dart:typed_data';

import 'package:web/web.dart' as web;

/// في المتصفح: تنزيل مباشر للملف.
///
/// لا يمرّ عبر إضافة printing: تسجيلها في نسخة الويب لم يكن مضمونًا، وحين
/// غاب انتهى التصدير بـ MissingPluginException. التنزيل نفسه سطران في المتصفح
/// ولا يحتاج إضافة أصلًا.
Future<void> savePdf(Uint8List bytes, String fileName) async {
  final blob = web.Blob([bytes.toJS].toJS, web.BlobPropertyBag(type: 'application/pdf'));
  final url = web.URL.createObjectURL(blob);
  final link = web.HTMLAnchorElement()
    ..href = url
    ..download = fileName;
  web.document.body?.append(link);
  link.click();
  link.remove();
  /* بعد لحظة: الإلغاء الفوري قد يسبق بدء التنزيل في بعض المتصفحات */
  Future<void>.delayed(const Duration(seconds: 30), () => web.URL.revokeObjectURL(url));
}
