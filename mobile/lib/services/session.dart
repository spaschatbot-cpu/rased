import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../i18n.dart';

/// جلسة السائق: التوكن وبيانات حسابه.
///
/// التوكن في التخزين المشفّر (Keystore / Keychain) لأنه يكفي وحده للتبليغ
/// باسم هذا السائق طوال أسبوع.
class Session {
  Session({required this.token, required this.user});

  final String token;
  final Map<String, dynamic> user;

  int? get vehicleId => user['vehicleId'] as int?;
  String get nameAr => (user['nameAr'] as String?) ?? '';
  String get username => (user['username'] as String?) ?? '';

  Map<String, dynamic>? get _vehicle => user['vehicle'] as Map<String, dynamic>?;

  /// لوحة المركبة المرتبطة — ما يقرأه السائق على الباب ويعرف به مركبته.
  ///
  /// يعود `null` إن لم يرسل السيرفر المركبة: جلسة محفوظة من نسخة أقدم من
  /// التطبيق تبقى صالحة، وتعود لعرض الرقم حتى أول تحديث للحساب.
  String? get vehiclePlate {
    final plate = _vehicle?['plate'] as String?;
    return (plate != null && plate.trim().isNotEmpty) ? plate.trim() : null;
  }

  /// موديل المركبة بلغة الواجهة، إن وُجد.
  String? get vehicleModel {
    final key = AppLocale.isArabic ? 'modelAr' : 'modelEn';
    final model = _vehicle?[key] as String?;
    return (model != null && model.trim().isNotEmpty) ? model.trim() : null;
  }

  Session copyWith({Map<String, dynamic>? user}) =>
      Session(token: token, user: user ?? this.user);
}

class SessionStore {
  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );
  static const _tokenKey = 'mirsad.token';
  static const _userKey = 'mirsad.user';

  Future<Session?> read() async {
    final token = await _storage.read(key: _tokenKey);
    final raw = await _storage.read(key: _userKey);
    if (token == null || raw == null) return null;
    try {
      return Session(token: token, user: jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      // بيانات تالفة من نسخة أقدم — تُعامل كعدم وجود جلسة
      await clear();
      return null;
    }
  }

  Future<void> write(Session session) async {
    await _storage.write(key: _tokenKey, value: session.token);
    await _storage.write(key: _userKey, value: jsonEncode(session.user));
  }

  Future<void> clear() async {
    await _storage.delete(key: _tokenKey);
    await _storage.delete(key: _userKey);
  }
}
