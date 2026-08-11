import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';

import '../i18n.dart';
import '../services/alerts_store.dart';
import '../services/tracker.dart';
import '../theme.dart';
import '../widgets/location_map.dart';
import '../widgets/stage_background.dart';

/// شاشة الوردية.
///
/// السائق يفتحها صباحًا، يضغط زرًّا واحدًا، ثم يضع الجهاز جانبًا — فكل ما لا
/// يخدم هذين الأمرين حُذف. ما تبقّى ثلاث طبقات: من أنت، الزرّ، وهل يصل ما
/// تُرسله. الحالة تسبق التفاصيل لأنها السؤال الوحيد الذي يعني السائق.
class ShiftScreen extends StatefulWidget {
  const ShiftScreen({super.key, required this.tracker});

  final Tracker tracker;

  @override
  State<ShiftScreen> createState() => _ShiftScreenState();
}

class _ShiftScreenState extends State<ShiftScreen> with SingleTickerProviderStateMixin {
  /// نبضة الزرّ أثناء الوردية — الدليل البصري الوحيد أن التطبيق حيّ.
  late final AnimationController _pulse = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 2200),
  )..repeat();

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = widget.tracker;
    final session = t.session!;
    final running = t.isRunning;
    final busy = t.state == ShiftState.starting;
    final compact = MediaQuery.sizeOf(context).height < 720;

    /* لا Scaffold ولا خلفية هنا بعد الآن: الغلاف يملكهما، وشاشة الوردية صارت
       تبويبًا داخله لا الشاشة كلّها */
    return SingleChildScrollView(
                    padding: EdgeInsets.fromLTRB(18, compact ? 6 : 14, 18, 20),
                    child: Center(
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 420),
                        child: Column(
                          children: [
                            _Identity(
                              name: session.nameAr,
                              vehicleId: session.vehicleId,
                              compact: compact,
                            ),
                            SizedBox(height: compact ? 20 : 30),
                            _ShiftButton(
                              running: running,
                              busy: busy,
                              pulse: _pulse,
                              compact: compact,
                              onTap: () => running ? t.stop() : t.start(),
                            ),
                            /* موقعك الآن — يظهر فور الضغط على «بدء الوردية»
                               ويبقى طوال الوردية */
                            if (running) ...[
                              SizedBox(height: compact ? 16 : 22),
                              _LocationCard(tracker: t, compact: compact, pulse: _pulse),
                            ],
                            SizedBox(height: compact ? 20 : 30),
                            _StatusPanel(tracker: t, compact: compact),
                            if (t.error != null) ...[
                              const SizedBox(height: 14),
                              _Alert(
                                message: t.error!,
                                onSettings:
                                    t.needsAttention ? Geolocator.openAppSettings : null,
                              ),
                            ],
                            SizedBox(height: compact ? 14 : 20),
                            _Hint(running: running, locating: t.isLocating),
                          ],
                        ),
                      ),
                    ),
                  );
  }
}

/* ══════════════════════════════════════════════════════════════════
   الأجزاء
   ══════════════════════════════════════════════════════════════════ */

class _Identity extends StatelessWidget {
  const _Identity({required this.name, required this.vehicleId, required this.compact});

  final String name;
  final int? vehicleId;
  final bool compact;

  /// أول حرف من أول كلمتين — يكفي للتعرّف دون صورة يرفعها أحد.
  String get _initials {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '؟';
    return parts.take(2).map((p) => p.substring(0, 1)).join();
  }

  @override
  Widget build(BuildContext context) {
    final none = vehicleId == null;

    return Container(
      padding: EdgeInsets.all(compact ? 14 : 18),
      decoration: glassSurface(radius: 22),
      child: Row(
        children: [
          Container(
            width: compact ? 46 : 52,
            height: compact ? 46 : 52,
            decoration: BoxDecoration(
              color: Brand.green.withValues(alpha: 0.14),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: Brand.green.withValues(alpha: 0.25)),
            ),
            child: Center(
              child: Text(
                _initials,
                style: TextStyle(
                  fontSize: compact ? 15 : 17,
                  fontWeight: FontWeight.w900,
                  color: Brand.green,
                ),
              ),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(tr('app.hello'),
                    style: TextStyle(fontSize: compact ? 10.5 : 11.5, color: Brand.muted)),
                const SizedBox(height: 2),
                Text(
                  name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                      fontSize: compact ? 16 : 18,
                      fontWeight: FontWeight.w900,
                      height: 1.2),
                ),
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: (none ? Brand.danger : Brand.green).withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(
                        color: (none ? Brand.danger : Brand.green).withValues(alpha: 0.3)),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.local_shipping_outlined,
                          size: 13, color: none ? Brand.danger : Brand.green),
                      const SizedBox(width: 6),
                      Text(
                        none ? tr('app.noVehicle') : tr1('app.vehicle', vehicleId!),
                        style: TextStyle(
                          fontSize: 11.5,
                          fontWeight: FontWeight.w800,
                          color: none ? Brand.danger : Brand.green,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// الزرّ. حلقات تتمدّد للخارج أثناء الوردية — نفس لغة النبض في الموقع،
/// وتقول للسائق بلا كلام إن الجهاز يعمل.
class _ShiftButton extends StatelessWidget {
  const _ShiftButton({
    required this.running,
    required this.busy,
    required this.pulse,
    required this.compact,
    required this.onTap,
  });

  final bool running;
  final bool busy;
  final Animation<double> pulse;
  final bool compact;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colour = running ? Brand.danger : Brand.green;
    final size = compact ? 176.0 : 208.0;

    return SizedBox(
      width: size,
      height: size,
      child: AnimatedBuilder(
        animation: pulse,
        builder: (context, child) {
          return Stack(
            alignment: Alignment.center,
            children: [
              if (running)
                for (final offset in [0.0, 0.5])
                  _Ripple(value: (pulse.value + offset) % 1, colour: colour, size: size),
              child!,
            ],
          );
        },
        child: GestureDetector(
          onTap: busy ? null : onTap,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 280),
            width: size * 0.86,
            height: size * 0.86,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: RadialGradient(
                colors: [
                  colour.withValues(alpha: 0.22),
                  colour.withValues(alpha: 0.06),
                ],
              ),
              border: Border.all(color: colour.withValues(alpha: 0.55), width: 2),
              boxShadow: [
                BoxShadow(
                  color: colour.withValues(alpha: running ? 0.28 : 0.18),
                  blurRadius: 40,
                  spreadRadius: 2,
                ),
              ],
            ),
            child: Center(
              child: busy
                  ? CircularProgressIndicator(color: colour)
                  : Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          width: compact ? 52 : 60,
                          height: compact ? 52 : 60,
                          decoration: BoxDecoration(
                            color: colour,
                            shape: BoxShape.circle,
                            boxShadow: [
                              BoxShadow(
                                  color: colour.withValues(alpha: 0.45),
                                  blurRadius: 20,
                                  offset: const Offset(0, 6)),
                            ],
                          ),
                          child: Icon(
                            running ? Icons.stop_rounded : Icons.play_arrow_rounded,
                            size: compact ? 28 : 33,
                            color: running ? Colors.white : Brand.onGreen,
                          ),
                        ),
                        SizedBox(height: compact ? 10 : 14),
                        Text(
                          running ? tr('shift.end') : tr('shift.start'),
                          style: TextStyle(
                            fontSize: compact ? 14 : 15.5,
                            fontWeight: FontWeight.w900,
                            color: colour,
                          ),
                        ),
                      ],
                    ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Ripple extends StatelessWidget {
  const _Ripple({required this.value, required this.colour, required this.size});

  final double value;
  final Color colour;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: ((1 - value) * 0.5).clamp(0.0, 1.0),
      child: Container(
        width: size * (0.86 + value * 0.14),
        height: size * (0.86 + value * 0.14),
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(color: colour.withValues(alpha: 0.45), width: 1.5),
        ),
      ),
    );
  }
}

/// بطاقة الموقع — الجواب على «هل التطبيق يعرف أين أنا؟».
///
/// تمرّ بحالتين. **جارٍ التحديد**: الوردية بدأت والقمر لم يردّ بعد — قد تطول
/// نصف دقيقة تحت سقف، والسائق يحتاج ما يقول له «انتظر» بدل شاشة صامتة يظنّها
/// معطّلة. **محدَّد**: الإحداثيات نفسها، لأن رؤية رقم يتغيّر مع الحركة هي
/// الإثبات الوحيد الذي لا يحتاج ثقة.
class _LocationCard extends StatelessWidget {
  const _LocationCard({
    required this.tracker,
    required this.compact,
    required this.pulse,
  });

  final Tracker tracker;
  final bool compact;
  final Animation<double> pulse;

  /// تُفتح بملء الشاشة مع الوردية جارية — النقطة تظل تتحرّك بداخلها.
  void _openFullScreen(BuildContext context, Position fix) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => AnimatedBuilder(
          animation: tracker,
          builder: (_, __) {
            final live = tracker.lastFix ?? fix;
            return FullScreenMap(
              point: LatLng(live.latitude, live.longitude),
              accuracy: live.accuracy.isNaN ? 0 : live.accuracy,
              place: tracker.place,
              speedKmh: int.tryParse(_StatusPanel._kmh(live)),
            );
          },
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final fix = tracker.lastFix;
    final locating = fix == null;

    return Container(
      width: double.infinity,
      padding: EdgeInsets.all(compact ? 14 : 17),
      decoration: glassSurface(radius: 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              /* الأيقونة تنبض أثناء البحث وتثبت عند الإمساك بالإشارة */
              AnimatedBuilder(
                animation: pulse,
                builder: (context, child) => Opacity(
                  opacity: locating ? (0.45 + (1 - pulse.value) * 0.55) : 1,
                  child: child,
                ),
                child: Container(
                  width: 32,
                  height: 32,
                  decoration: BoxDecoration(
                    color: (locating ? Brand.warn : Brand.green).withValues(alpha: 0.14),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(
                    locating ? Icons.gps_not_fixed : Icons.gps_fixed,
                    size: 17,
                    color: locating ? Brand.warn : Brand.green,
                  ),
                ),
              ),
              const SizedBox(width: 11),
              Expanded(
                child: Text(
                  locating ? tr('shift.locating') : tr('shift.located'),
                  style: TextStyle(
                    fontSize: compact ? 13 : 14,
                    fontWeight: FontWeight.w900,
                    color: locating ? Brand.warn : Brand.green,
                  ),
                ),
              ),
              if (!locating)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                  decoration: BoxDecoration(
                    color: Brand.green.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    '±${fix.accuracy.round()} ${tr('loc.metres')}',
                    textDirection: TextDirection.ltr,
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                      color: Brand.green,
                    ),
                  ),
                ),
            ],
          ),

          SizedBox(height: compact ? 11 : 14),

          if (locating)
            Text(
              tr('shift.hintLocating'),
              style: const TextStyle(fontSize: 11.5, height: 1.7, color: Brand.muted),
            )
          else ...[
            LocationMap(
              point: LatLng(fix.latitude, fix.longitude),
              accuracy: fix.accuracy.isNaN ? 0 : fix.accuracy,
              height: compact ? 158 : 190,
              onExpand: () => _openFullScreen(context, fix),
            ),

            /* اسم المكان — يظهر حين يعود من السيرفر، ولا يترك فراغًا قبل ذلك */
            if (tracker.place != null) ...[
              SizedBox(height: compact ? 10 : 12),
              Row(
                children: [
                  const Icon(Icons.place_outlined, size: 15, color: Brand.green),
                  const SizedBox(width: 7),
                  Expanded(
                    child: Text(
                      tracker.place!,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: compact ? 12.5 : 13.5,
                        fontWeight: FontWeight.w800,
                        height: 1.4,
                      ),
                    ),
                  ),
                ],
              ),
            ]
            /* لا اسم لأن القراءة نفسها خشنة — قل السبب بدل ترك فراغ يُقرأ
               كأن الخدمة معطّلة، فيبحث السائق عن عطل ليس موجودًا */
            else if (tracker.fixIsCoarse) ...[
              SizedBox(height: compact ? 10 : 12),
              Row(
                children: [
                  const Icon(Icons.gps_not_fixed, size: 15, color: Brand.muted),
                  const SizedBox(width: 7),
                  Expanded(
                    child: Text(
                      tr1('loc.coarse', fix.accuracy.round()),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: compact ? 12 : 12.5,
                        fontWeight: FontWeight.w700,
                        height: 1.4,
                        color: Brand.muted,
                      ),
                    ),
                  ),
                ],
              ),
            ],

            SizedBox(height: compact ? 11 : 13),
            /* الإحداثيات تبقى تحت الخريطة: الخريطة تُري السائق أين هو، والرقم
               هو ما يقرأه لغرفة العمليات في الهاتف حين تسأله */
            Row(
              children: [
                Expanded(
                  child: _Coord(label: tr('loc.lat'), value: fix.latitude, compact: compact),
                ),
                Container(
                  width: 1,
                  height: compact ? 34 : 38,
                  color: const Color(0x14FFFFFF),
                  margin: const EdgeInsets.symmetric(horizontal: 12),
                ),
                Expanded(
                  child: _Coord(label: tr('loc.lng'), value: fix.longitude, compact: compact),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

/// إحداثي واحد. ست خانات عشرية ≈ عشر سنتيمترات — أدقّ بكثير مما يعطيه أي
/// هاتف، لكنها تجعل الرقم الأخير يتحرّك مع المركبة، وهذا هو المقصود.
class _Coord extends StatelessWidget {
  const _Coord({required this.label, required this.value, required this.compact});

  final String label;
  final double value;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontSize: 10.5, color: Brand.muted)),
        const SizedBox(height: 3),
        Text(
          value.toStringAsFixed(6),
          textDirection: TextDirection.ltr,
          style: TextStyle(
            fontSize: compact ? 15 : 16.5,
            fontWeight: FontWeight.w900,
            fontFeatures: const [FontFeature.tabularFigures()],
            height: 1.1,
          ),
        ),
      ],
    );
  }
}

class _StatusPanel extends StatelessWidget {
  const _StatusPanel({required this.tracker, required this.compact});

  final Tracker tracker;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final running = tracker.isRunning;
    final fix = tracker.lastFix;

    final locating = tracker.isLocating;

    final rows = <Widget>[
      _StatusRow(
        icon: running ? Icons.wifi_tethering : Icons.wifi_tethering_off,
        tone: locating ? Brand.warn : (running ? Brand.green : Brand.muted),
        label: tr('shift.status'),
        /* «يُرسل موقعك» قبل وصول أول قراءة وعدٌ لم يتحقّق بعد */
        value: locating ? tr('shift.waiting') : (running ? tr('shift.sending') : tr('shift.stopped')),
        emphasise: true,
      ),
      /* الدقة صعدت إلى بطاقة الموقع، فلا تتكرّر هنا */
      if (fix != null)
        _StatusRow(icon: Icons.speed, label: tr('shift.speed'), value: '${_kmh(fix)} ${tr('loc.speed')}'),
      if (tracker.lastSentAt != null)
        _StatusRow(
            icon: Icons.cloud_done_outlined,
            label: tr('shift.lastSent'),
            value: _clock(tracker.lastSentAt!)),
      if (tracker.pending > 0)
        _StatusRow(
          icon: Icons.cloud_off,
          tone: Brand.warn,
          label: tr('shift.queued'),
          value: '${tracker.pending}',
        ),
    ];

    return Container(
      decoration: glassSurface(radius: 20),
      child: Column(
        children: [
          for (var i = 0; i < rows.length; i++) ...[
            if (i > 0)
              const Divider(
                  height: 1, color: Color(0x14FFFFFF), indent: 16, endIndent: 16),
            Padding(
              padding:
                  EdgeInsets.symmetric(horizontal: 16, vertical: compact ? 11 : 13),
              child: rows[i],
            ),
          ],
        ],
      ),
    );
  }

  static String _kmh(Position p) =>
      (p.speed.isNaN || p.speed < 0 ? 0 : p.speed * 3.6).round().toString();

  static String _clock(DateTime t) =>
      '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';
}

class _StatusRow extends StatelessWidget {
  const _StatusRow({
    required this.icon,
    required this.label,
    required this.value,
    this.tone = Brand.muted,
    this.emphasise = false,
  });

  final IconData icon;
  final String label;
  final String value;
  final Color tone;
  final bool emphasise;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 30,
          height: 30,
          decoration: BoxDecoration(
            color: tone.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(9),
          ),
          child: Icon(icon, size: 16, color: tone),
        ),
        const SizedBox(width: 12),
        Text(label, style: const TextStyle(fontSize: 12.5, color: Brand.muted)),
        const Spacer(),
        Text(
          value,
          textDirection: TextDirection.ltr,
          style: TextStyle(
            fontSize: emphasise ? 14 : 13.5,
            fontWeight: FontWeight.w900,
            color: emphasise ? tone : Brand.text,
          ),
        ),
      ],
    );
  }
}

class _Alert extends StatelessWidget {
  const _Alert({required this.message, this.onSettings});

  final String message;
  final VoidCallback? onSettings;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(15),
      decoration: BoxDecoration(
        color: Brand.danger.withValues(alpha: 0.10),
        border: Border.all(color: Brand.danger.withValues(alpha: 0.35)),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.error_outline, size: 18, color: Brand.danger),
              const SizedBox(width: 10),
              Expanded(
                child: Text(message,
                    style: const TextStyle(
                        fontSize: 13, fontWeight: FontWeight.w700, color: Brand.danger)),
              ),
            ],
          ),
          if (onSettings != null) ...[
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: TextButton(
                onPressed: onSettings,
                style: TextButton.styleFrom(foregroundColor: Brand.danger),
                child: Text(tr('err.openSettings')),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _Hint extends StatelessWidget {
  const _Hint({required this.running, required this.locating});

  final bool running;
  final bool locating;

  @override
  Widget build(BuildContext context) {
    /* أثناء البحث عن الإشارة تقول بطاقة الموقع ما يكفي — تكرار النصيحة هنا
       يزحم شاشة السائق ينتظر أمامها */
    if (locating) return const SizedBox.shrink();

    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(running ? Icons.notifications_active_outlined : Icons.info_outline,
            size: 14, color: Brand.muted),
        const SizedBox(width: 8),
        Flexible(
          child: Text(
            running
                ? tr('shift.hintRunning')
                : tr('shift.hint'),
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 11, height: 1.6, color: Brand.muted),
          ),
        ),
      ],
    );
  }
}
