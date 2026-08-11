import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../i18n.dart';
import '../theme.dart';

/// خريطة صغيرة تُظهر السائق مكانه أثناء الوردية.
///
/// عمدًا **ليست خريطة ملاحة**. السائق لا يحتاج أن يخطّط طريقًا هنا — يحتاج أن
/// يرى أن النقطة التي يرسلها التطبيق هي المكان الذي يقف فيه فعلًا. لذلك:
///
/// * **تتبع تلقائي** — الكاميرا تلحق الموقع بلا تدخّل، والإصبع لا تُبعدها عنه
///   إلا إن أراد السائق ذلك، ويعود بضغطة واحدة.
/// * **بلا تكبير حرّ ولا دوران** — عناصر تحكّم أقل يعني لمسات أقل أثناء القيادة.
/// * **تتحمّل انقطاع الشبكة** — البلاطات تأتي من الإنترنت، والوردية لا تعتمد
///   عليها إطلاقًا. لو لم تصل، تبقى الخريطة رمادية والإرسال مستمر كما هو.
class LocationMap extends StatefulWidget {
  const LocationMap({
    super.key,
    required this.point,
    required this.accuracy,
    this.height = 190,
    this.onExpand,
    this.expanded = false,
  });

  /// موقع المركبة الآن.
  final LatLng point;

  /// نصف قطر عدم اليقين بالأمتار — تُرسم كدائرة حول النقطة.
  final double accuracy;

  final double height;

  /// فتح الخريطة بملء الشاشة. `null` يخفي الزرّ (نحن بالفعل بملء الشاشة).
  final VoidCallback? onExpand;

  /// بملء الشاشة تُرسم بلا حواف دائرية وبتكبير أقرب.
  final bool expanded;

  @override
  State<LocationMap> createState() => _LocationMapState();
}

class _LocationMapState extends State<LocationMap> {
  final MapController _map = MapController();

  /// حرّك السائق الخريطة بإصبعه، فتوقّف المتابعة حتى يطلبها ثانية.
  bool _following = true;

  /* بملء الشاشة هناك مساحة لتفاصيل أكثر، فتقترب الكاميرا خطوة */
  double get _zoom => widget.expanded ? 17 : 16;

  @override
  void didUpdateWidget(LocationMap old) {
    super.didUpdateWidget(old);
    if (_following && widget.point != old.point) {
      _map.move(widget.point, _map.camera.zoom);
    }
  }

  void _recentre() {
    setState(() => _following = true);
    _map.move(widget.point, _zoom);
  }

  @override
  Widget build(BuildContext context) {
    /* `expand` وليس الافتراضي: الـStack يمرّر قيودًا مرنة لأبنائه غير
       المُموضَعين، فتختار الخريطة ارتفاعًا لنفسها وتنكمش إلى شريط رفيع بدل
       أن تملأ ما أُعطي لها */
    final map = Stack(
      fit: StackFit.expand,
      children: [
            FlutterMap(
              mapController: _map,
              options: MapOptions(
                initialCenter: widget.point,
                initialZoom: _zoom,
                minZoom: 10,
                maxZoom: 18,
                /* لا دوران: خريطة مائلة أثناء القيادة تربك أكثر مما تفيد */
                interactionOptions: const InteractionOptions(
                  flags: InteractiveFlag.pinchZoom | InteractiveFlag.drag,
                  rotationThreshold: double.infinity,
                ),
                onPositionChanged: (_, hasGesture) {
                  if (hasGesture && _following) setState(() => _following = false);
                },
              ),
              children: [
                TileLayer(
                  urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                  /* مطلوب من شروط استخدام OSM — بلا معرّف تُحجب الطلبات */
                  userAgentPackageName: 'sa.mirsad.mirsad_driver',
                  maxNativeZoom: 19,
                  /* بلاطة فشلت لا تُظهر أيقونة خطأ فوق الخريطة */
                  errorTileCallback: (_, __, ___) {},
                ),

                /* دائرة الدقة قبل العلامة، فلا تحجب النقطة نفسها.
                   لا سقف لنصف القطر: قصّه عند مئتي متر كان يجعل قراءة خطؤها
                   كيلومتر تبدو كقراءة خطؤها مئتا متر، فيثق السائق بنقطة لا
                   تستحق الثقة. الدائرة الواسعة قبيحة، لكنها صادقة. */
                CircleLayer(
                  circles: [
                    CircleMarker(
                      point: widget.point,
                      radius: math.max(5, widget.accuracy),
                      useRadiusInMeter: true,
                      color: Brand.green.withValues(alpha: 0.14),
                      borderColor: Brand.green.withValues(alpha: 0.4),
                      borderStrokeWidth: 1.5,
                    ),
                  ],
                ),

                MarkerLayer(
                  markers: [
                    Marker(
                      point: widget.point,
                      width: 26,
                      height: 26,
                      child: const _Dot(),
                    ),
                  ],
                ),
              ],
            ),

            /* حقوق OSM — شرط في رخصة البلاطات، لا زينة */
            const Positioned(
              left: 6,
              bottom: 4,
              child: _Attribution(),
            ),

            /* أزرار الركن: العودة إلى الموقع تظهر فقط حين ابتعدت الخريطة عنه */
            Positioned(
              right: 8,
              top: 8,
              child: Column(
                children: [
                  if (!_following) ...[
                    _MapButton(
                      icon: Icons.my_location,
                      tooltip: tr('loc.recenter'),
                      onTap: _recentre,
                    ),
                    const SizedBox(height: 8),
                  ],
                  if (widget.onExpand != null)
                    _MapButton(
                      icon: Icons.open_in_full,
                      tooltip: tr('loc.expand'),
                      onTap: widget.onExpand!,
                    ),
                ],
              ),
            ),
      ],
    );

    /* بملء الشاشة تتكفّل الشاشة بالقياس — تقييد الارتفاع هنا يخنق الخريطة
       في شريط أعلى الصفحة بدل أن تملأها */
    if (widget.expanded) return map;

    return ClipRRect(
      borderRadius: BorderRadius.circular(18),
      child: SizedBox(height: widget.height, child: map),
    );
  }
}

/// علامة المركبة: نقطة صلبة بحلقة بيضاء تفصلها عن أي لون تحتها.
class _Dot extends StatelessWidget {
  const _Dot();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Container(
        width: 18,
        height: 18,
        decoration: BoxDecoration(
          color: Brand.green,
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white, width: 3),
          boxShadow: [
            BoxShadow(
              color: Brand.green.withValues(alpha: 0.55),
              blurRadius: 12,
              spreadRadius: 1,
            ),
          ],
        ),
      ),
    );
  }
}

class _MapButton extends StatelessWidget {
  const _MapButton({required this.icon, required this.tooltip, required this.onTap});

  final IconData icon;
  final String tooltip;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Brand.panel.withValues(alpha: 0.92),
      borderRadius: BorderRadius.circular(11),
      child: Tooltip(
        message: tooltip,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(11),
          child: Padding(
            padding: const EdgeInsets.all(8),
            child: Icon(icon, size: 18, color: Brand.green),
          ),
        ),
      ),
    );
  }
}

/// الخريطة بملء الشاشة.
///
/// تُبنى على نفس [LocationMap] لا على نسخة ثانية منها، فأي إصلاح في العلامة أو
/// في المتابعة يسري على الاثنتين. تتحدّث مع الوردية: السائق يفتحها ويشاهد
/// النقطة تتحرّك، ويغلقها فيعود إلى الزرّ.
class FullScreenMap extends StatelessWidget {
  const FullScreenMap({
    super.key,
    required this.point,
    required this.accuracy,
    this.place,
    this.speedKmh,
  });

  final LatLng point;
  final double accuracy;
  final String? place;
  final int? speedKmh;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Brand.bg,
      /* `expand` مهم: بدونه يقيس الـStack نفسه على أطول ابن غير مُموضَع — وهو
         الشريط العلوي — فتحصل `Positioned.fill` على ارتفاع الشريط وحده
         وتنكمش الخريطة إلى سطر أعلى الصفحة */
      body: Stack(
        fit: StackFit.expand,
        children: [
          Positioned.fill(
            child: LocationMap(point: point, accuracy: accuracy, expanded: true),
          ),

          /* شريط علوي فوق الخريطة: الرجوع واسم المكان */
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 0),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Material(
                    color: Brand.panel.withValues(alpha: 0.94),
                    borderRadius: BorderRadius.circular(12),
                    child: InkWell(
                      onTap: () => Navigator.of(context).maybePop(),
                      borderRadius: BorderRadius.circular(12),
                      child: const Padding(
                        padding: EdgeInsets.all(9),
                        child: Icon(Icons.close, size: 20, color: Brand.text),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 10),
                      decoration: BoxDecoration(
                        color: Brand.panel.withValues(alpha: 0.94),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Row(
                            children: [
                              const Icon(Icons.place, size: 14, color: Brand.green),
                              const SizedBox(width: 6),
                              Expanded(
                                child: Text(
                                  place ?? tr('loc.yours'),
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                      fontSize: 13, fontWeight: FontWeight.w900, height: 1.35),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 5),
                          /* الدقة بجانب الإحداثيات: اسم شارع فوق قراءة خطؤها
                             نصف كيلومتر يقرأ كأنه يقين، والرقم هنا هو الفرق
                             بين «أنا هنا» و«أنا في مكان ما داخل هذه الدائرة» */
                          Text(
                            '${point.latitude.toStringAsFixed(6)}, '
                            '${point.longitude.toStringAsFixed(6)}'
                            '  ·  ±${accuracy.round()} ${tr('loc.metres')}'
                            '${speedKmh == null ? '' : '  ·  $speedKmh ${tr('loc.speed')}'}',
                            textDirection: TextDirection.ltr,
                            style: const TextStyle(fontSize: 11, color: Brand.muted),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Attribution extends StatelessWidget {
  const _Attribution();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.45),
        borderRadius: BorderRadius.circular(6),
      ),
      child: const Text(
        '© OpenStreetMap',
        textDirection: TextDirection.ltr,
        style: TextStyle(fontSize: 8.5, color: Colors.white70),
      ),
    );
  }
}
