import 'package:flutter/material.dart';

import '../theme.dart';

/// خلفية المظهر الفاتح.
///
/// المسرح المتحرّك مصمَّم للغامق: على أبيض يصير بقعًا رمادية. هنا نسخة هادئة
/// للفاتح — تدرّج خفيف، وتوهّجان بلوني الهوية في زاويتين، وشبكة نقاط، وخطّا
/// مسار باهتان كخريطة تحت الورق. ثابتة بلا حركة: الفاتح يُقرأ في الشمس،
/// والحركة هناك تشتّت أكثر مما تزيّن.
class LightBackdrop extends StatelessWidget {
  const LightBackdrop({super.key});

  @override
  Widget build(BuildContext context) {
    return const RepaintBoundary(child: CustomPaint(painter: _LightPainter(), size: Size.infinite));
  }
}

class _LightPainter extends CustomPainter {
  const _LightPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;

    /* الأساس: من رمادي مزرق فاتح إلى لمسة خضراء */
    canvas.drawRect(
      rect,
      Paint()
        ..shader = const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xFFF4F7FB), Color(0xFFEAF4F1)],
        ).createShader(rect),
    );

    /* توهّجان: أخضر أعلى، وأزرق أسفل */
    void glow(Offset c, double r, Color color) {
      canvas.drawCircle(
        c,
        r,
        Paint()
          ..shader = RadialGradient(colors: [color, color.withValues(alpha: 0)])
              .createShader(Rect.fromCircle(center: c, radius: r)),
      );
    }

    glow(Offset(size.width * 0.9, size.height * 0.08), size.width * 0.75, Brand.green.withValues(alpha: 0.16));
    glow(Offset(size.width * 0.05, size.height * 0.85), size.width * 0.8, const Color(0xFF38BDF8).withValues(alpha: 0.13));

    /* شبكة نقاط */
    const gap = 22.0;
    final dot = Paint()..color = const Color(0xFF0F1B2A).withValues(alpha: 0.06);
    for (double y = gap / 2; y < size.height; y += gap) {
      for (double x = gap / 2; x < size.width; x += gap) {
        canvas.drawCircle(Offset(x, y), 1, dot);
      }
    }

    /* خطّا مسار باهتان، ونقطتان على أحدهما */
    final route = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..strokeCap = StrokeCap.round
      ..color = Brand.green.withValues(alpha: 0.16);
    final a = Path()
      ..moveTo(-20, size.height * 0.30)
      ..cubicTo(size.width * 0.30, size.height * 0.18, size.width * 0.55, size.height * 0.48,
          size.width + 20, size.height * 0.36);
    final b = Path()
      ..moveTo(-20, size.height * 0.72)
      ..cubicTo(size.width * 0.35, size.height * 0.62, size.width * 0.65, size.height * 0.92,
          size.width + 20, size.height * 0.78);
    canvas.drawPath(a, route);
    canvas.drawPath(b, route..color = const Color(0xFF38BDF8).withValues(alpha: 0.14));

    for (final m in a.computeMetrics()) {
      for (final t in [0.28, 0.7]) {
        final p = m.getTangentForOffset(m.length * t)?.position;
        if (p == null) continue;
        canvas.drawCircle(p, 7, Paint()..color = Brand.green.withValues(alpha: 0.12));
        canvas.drawCircle(p, 3, Paint()..color = Brand.green.withValues(alpha: 0.35));
      }
    }
  }

  @override
  bool shouldRepaint(_LightPainter old) => false;
}
