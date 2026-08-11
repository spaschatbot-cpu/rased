import 'package:flutter/material.dart';

/// ألوان مرصاد — مطابقة لمتغيّرات الموقع حتى يبدو التطبيق امتدادًا له.
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
      color: const Color(0xB3101C2B),
      borderRadius: BorderRadius.circular(radius),
      border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      boxShadow: const [
        BoxShadow(color: Color(0x40000000), blurRadius: 30, offset: Offset(0, 12)),
      ],
    );

ThemeData buildTheme() {
  final base = ThemeData.dark(useMaterial3: true);

  return base.copyWith(
    scaffoldBackgroundColor: Brand.bg,
    colorScheme: base.colorScheme.copyWith(
      primary: Brand.green,
      onPrimary: Brand.onGreen,
      surface: Brand.panel,
      error: Brand.danger,
    ),
    textTheme: base.textTheme.apply(
      bodyColor: Brand.text,
      displayColor: Brand.text,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Brand.panel,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: Brand.border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: Brand.border),
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
