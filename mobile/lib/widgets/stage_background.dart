import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../theme.dart';

/// الخلفية المتحرّكة المشتركة بين شاشتَي التطبيق.
///
/// شبكة خفيفة، مساران تسير عليهما مركبات، ورادار يمسح الزاوية — نفس مفردات
/// صفحة الدخول في الموقع، لكنها مرسومة بدل الفيديو: لا تحميل، ولا استهلاك
/// بيانات على جهاز سائق، ولا بطارية تُهدر في فك ترميز فيديو.
class StageBackground extends StatefulWidget {
  const StageBackground({super.key, this.intensity = 1});

  /// 0 → 1. تُخفَّض خلف المحتوى الكثيف كي لا تنافسه على الانتباه.
  final double intensity;

  @override
  State<StageBackground> createState() => _StageBackgroundState();
}

class _StageBackgroundState extends State<StageBackground>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 14),
  )..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return RepaintBoundary(
      child: AnimatedBuilder(
        animation: _c,
        builder: (_, __) => CustomPaint(
          painter: _StagePainter(_c.value, widget.intensity),
          size: Size.infinite,
        ),
      ),
    );
  }
}

class _StagePainter extends CustomPainter {
  _StagePainter(this.t, this.intensity);

  /// 0 → 1، تدور باستمرار.
  final double t;
  final double intensity;

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    if (w <= 0 || h <= 0) return;

    canvas.drawRect(
      Offset.zero & size,
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            Brand.green.withValues(alpha: 0.08 * intensity),
            const Color(0x00000000),
          ],
        ).createShader(Rect.fromLTWH(0, 0, w, h * 0.6)),
    );

    _grid(canvas, w, h);
    _routes(canvas, w, h);
    _radar(canvas, w, h);
  }

  void _grid(Canvas canvas, double w, double h) {
    final paint = Paint()
      ..color = Colors.white.withValues(alpha: 0.035 * intensity)
      ..strokeWidth = 1;
    const step = 68.0;
    for (double x = 0; x < w; x += step) {
      canvas.drawLine(Offset(x, 0), Offset(x, h), paint);
    }
    for (double y = 0; y < h; y += step) {
      canvas.drawLine(Offset(0, y), Offset(w, y), paint);
    }
  }

  void _routes(Canvas canvas, double w, double h) {
    /* الإحداثيات نسبية ليتكيّف الرسم مع أي مقاس شاشة */
    final a = Path()
      ..moveTo(-40, h * 0.30)
      ..cubicTo(w * 0.22, h * 0.30, w * 0.24, h * 0.54, w * 0.48, h * 0.54)
      ..cubicTo(w * 0.72, h * 0.54, w * 0.74, h * 0.24, w + 40, h * 0.24);

    final b = Path()
      ..moveTo(w + 40, h * 0.78)
      ..cubicTo(w * 0.78, h * 0.78, w * 0.72, h * 0.92, w * 0.48, h * 0.92)
      ..cubicTo(w * 0.24, h * 0.92, w * 0.18, h * 0.70, -40, h * 0.70);

    _route(canvas, a, Brand.green);
    _route(canvas, b, const Color(0xFF38BDF8));

    _runner(canvas, a, t, Brand.green);
    _runner(canvas, a, (t + 0.5) % 1, Brand.green);
    _runner(canvas, b, (t + 0.25) % 1, const Color(0xFF38BDF8));
  }

  void _route(Canvas canvas, Path path, Color colour) {
    canvas.drawPath(
      path,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.6
        ..strokeCap = StrokeCap.round
        ..color = colour.withValues(alpha: 0.28 * intensity),
    );
  }

  /// مركبة على المسار: هالة وقلب.
  void _runner(Canvas canvas, Path path, double progress, Color colour) {
    final metrics = path.computeMetrics().toList();
    if (metrics.isEmpty) return;
    final metric = metrics.first;
    final pos = metric.getTangentForOffset(metric.length * progress)?.position;
    if (pos == null) return;

    canvas.drawCircle(pos, 13, Paint()..color = colour.withValues(alpha: 0.14 * intensity));
    canvas.drawCircle(pos, 4.5, Paint()..color = colour.withValues(alpha: intensity));
  }

  void _radar(Canvas canvas, double w, double h) {
    final centre = Offset(w * 0.12, h * 0.86);
    final ring = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1
      ..color = Brand.green.withValues(alpha: 0.14 * intensity);

    for (final r in [60.0, 110.0, 165.0]) {
      canvas.drawCircle(centre, r, ring);
    }

    canvas.drawCircle(
      centre,
      165,
      Paint()
        ..shader = SweepGradient(
          startAngle: 0,
          endAngle: math.pi / 3,
          colors: [
            Brand.green.withValues(alpha: 0.22 * intensity),
            Brand.green.withValues(alpha: 0),
          ],
          transform: GradientRotation(t * 2 * math.pi),
        ).createShader(Rect.fromCircle(center: centre, radius: 165)),
    );
  }

  @override
  bool shouldRepaint(covariant _StagePainter old) =>
      old.t != t || old.intensity != intensity;
}
