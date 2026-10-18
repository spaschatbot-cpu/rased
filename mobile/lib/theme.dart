import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ألوان أوتو تراك — مطابقة لمتغيّرات الموقع حتى يبدو التطبيق امتدادًا له.
class Brand {
  static const green = Color(0xFF00C391);
  static const onGreen = Color(0xFF04120C);
  static const bg = Color(0xFF0B1524);
  static const panel = Color(0xFF142030);
  static const border = Color(0xFF223146);
  static const text = Color(0xFFE8EEF6);
  static const muted = Color(0xFF8A9BB0);
  static const danger = Color(0xFFF4634E);
  static const warn = Color(0xFFF5B301);
}

/// المظهر: غامق أو فاتح. يُحفظ على الجهاز كاللغة، وتستمع إليه [MaterialApp]
/// فيُعاد رسم التطبيق كلّه عند التبديل.
class AppTheme {
  AppTheme._();

  static const _key = 'theme';

  static final ValueNotifier<bool> dark = ValueNotifier<bool>(true);

  static bool get isDark => dark.value;

  static Future<void> restore() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString(_key);
    if (saved == 'light') dark.value = false;
  }

  static Future<void> toggle() async {
    dark.value = !dark.value;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, dark.value ? 'dark' : 'light');
  }
}

/// ألوان شاشات التتبّع بحسب المظهر. ألوان الهوية (الأخضر والأحمر والأصفر)
/// واحدة في الوضعين وتبقى في [Brand]؛ هنا ما يتغيّر فقط.
class Palette {
  Palette._();

  static bool get _d => AppTheme.isDark;

  static Color get bg => _d ? Brand.bg : const Color(0xFFF2F5F9);
  static Color get panel => _d ? Brand.panel : const Color(0xFFFFFFFF);
  static Color get border => _d ? Brand.border : const Color(0xFFE1E7EF);
  static Color get text => _d ? Brand.text : const Color(0xFF0F1B2A);
  static Color get muted => _d ? Brand.muted : const Color(0xFF66768A);

  /// البطاقات فوق الخلفية: زجاج داكن في الغامق، وأبيض شبه معتم في الفاتح.
  static Color get glass => _d ? const Color(0xB3101C2B) : const Color(0xF2FFFFFF);
  static Color get glassEdge => _d ? Colors.white.withValues(alpha: 0.08) : const Color(0xFFE1E7EF);

  /// الشريط العلوي والسفلي.
  static Color get bar => _d ? const Color(0xE60B1524) : const Color(0xF2FFFFFF);
  static Color get barEdge => _d ? Colors.white.withValues(alpha: 0.06) : const Color(0xFFE1E7EF);
}

/// خلفية شاشة الدخول — أغمق من باقي التطبيق، كالمسرح خلف بطاقة الموقع.
class Stage {
  static const bg = Color(0xFF030A11);
}

/// البطاقة الفاتحة فوق المسرح. تتبع الوضع الفاتح للموقع عمدًا: التباين العالي
/// يجعل حقول الإدخال مقروءة تحت شمس مباشرة، وهي حالة السائق الغالبة.
class Sheet {
  static const bg = Color(0xFFFFFFFF);
  static const field = Color(0xFFF6F8FA);
  static const border = Color(0xFFE3E8EF);
  static const text = Color(0xFF0F1B2A);
  static const muted = Color(0xFF6B7A8D);
}

/// السطح الزجاجي المتكرّر فوق المسرح: شفاف بما يُظهر الحركة خلفه، ومعتم بما
/// يُبقي النص فوقه مقروءًا.
BoxDecoration glassSurface({required double radius}) => BoxDecoration(
      color: Palette.glass,
      borderRadius: BorderRadius.circular(radius),
      border: Border.all(color: Palette.glassEdge),
      boxShadow: [
        BoxShadow(
          color: AppTheme.isDark ? const Color(0x40000000) : const Color(0x14000000),
          blurRadius: 30,
          offset: const Offset(0, 12),
        ),
      ],
    );

ThemeData buildTheme() {
  final base = AppTheme.isDark
      ? ThemeData.dark(useMaterial3: true)
      : ThemeData.light(useMaterial3: true);

  return base.copyWith(
    scaffoldBackgroundColor: Palette.bg,
    colorScheme: base.colorScheme.copyWith(
      primary: Brand.green,
      onPrimary: Brand.onGreen,
      surface: Palette.panel,
      error: Brand.danger,
    ),
    textTheme: base.textTheme.apply(
      bodyColor: Palette.text,
      displayColor: Palette.text,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Palette.panel,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: Palette.border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: Palette.border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: Brand.green, width: 1.6),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: Brand.green,
        foregroundColor: Brand.onGreen,
        minimumSize: const Size.fromHeight(54),
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
    ),
  );
}
