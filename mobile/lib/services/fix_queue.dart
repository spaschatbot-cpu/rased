import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../config.dart';

/// النقاط التي لم تصل بعد.
///
/// تُحفظ على القرص لا في الذاكرة: النظام قد يقتل التطبيق في أي لحظة، وسائق
/// عبر منطقة بلا تغطية يجب أن تصل رحلته كاملة حين تعود الشبكة — لا أن تبدأ
/// من نقطة استيقاظه.
class FixQueue {
  static const _key = 'mirsad.pending';

  List<Map<String, dynamic>> _items = [];
  bool _loaded = false;

  int get length => _items.length;

  Future<void> _ensureLoaded() async {
    if (_loaded) return;
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_key);
    if (raw != null) {
      try {
        _items = (jsonDecode(raw) as List).cast<Map<String, dynamic>>();
      } catch (_) {
        _items = [];
      }
    }
    _loaded = true;
  }

  Future<void> _persist() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, jsonEncode(_items));
  }

  Future<void> add(Map<String, dynamic> fix) async {
    await _ensureLoaded();
    _items.add(fix);
    // عند تجاوز السقف تُسقَط الأقدم: الأحدث أهم لموقع المركبة الآن
    if (_items.length > Config.maxQueued) {
      _items = _items.sublist(_items.length - Config.maxQueued);
    }
    await _persist();
  }

  Future<List<Map<String, dynamic>>> readAll() async {
    await _ensureLoaded();
    return List<Map<String, dynamic>>.from(_items);
  }

  /// تُستدعى بعد نجاح الإرسال فقط. تحذف ما أُرسل تحديدًا، فلا تضيع نقطة
  /// وصلت أثناء انتظار رد السيرفر.
  Future<void> drop(int count) async {
    await _ensureLoaded();
    _items = _items.length <= count ? [] : _items.sublist(count);
    await _persist();
  }

  Future<void> clear() async {
    _items = [];
    _loaded = true;
    await _persist();
  }
}
