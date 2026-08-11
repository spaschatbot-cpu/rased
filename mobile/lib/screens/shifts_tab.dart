import 'package:flutter/material.dart';

import '../i18n.dart';
import '../services/shifts_store.dart';
import '../theme.dart';

/// سجلّ الورديات: متى بدأت كل وردية ومتى انتهت.
///
/// الترتيب من الأحدث للأقدم لأن السؤال الغالب هو «كم عملت اليوم»، لا «ماذا حدث
/// في الشهر الماضي». والوردية الجارية على الرأس بعدّاد يتقدّم، فالسائق يرى
/// ورديته الحالية في المكان الذي يبحث فيه عنها.
class ShiftsTab extends StatefulWidget {
  const ShiftsTab({super.key, required this.store});

  final ShiftsStore store;

  @override
  State<ShiftsTab> createState() => _ShiftsTabState();
}

class _ShiftsTabState extends State<ShiftsTab> {
  @override
  void initState() {
    super.initState();
    /* أول فتح للتبويب يسأل السيرفر؛ ما بعده يُحدَّث بالسحب لأسفل */
    widget.store.refresh();
  }

  /// «٧ س ٢٥ د» — الساعات أولًا لأنها ما يُقارَن به يوم عمل.
  String _spell(int minutes) {
    final h = minutes ~/ 60;
    final m = minutes % 60;
    if (h == 0) return '$m ${tr('shifts.minutesShort')}';
    return '$h ${tr('shifts.hoursShort')} $m ${tr('shifts.minutesShort')}';
  }

  String _clock(DateTime t) =>
      '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

  String _day(DateTime t) =>
      '${t.year}/${t.month.toString().padLeft(2, '0')}/${t.day.toString().padLeft(2, '0')}';

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: widget.store,
      builder: (context, _) {
        final store = widget.store;

        if (!store.loaded) {
          return const Center(child: CircularProgressIndicator(color: Brand.green));
        }

        final now = DateTime.now();
        final today = store.shifts
            .where((s) =>
                s.startedAt.year == now.year &&
                s.startedAt.month == now.month &&
                s.startedAt.day == now.day)
            .fold<int>(0, (sum, s) => sum + s.minutes);
        final week = store.shifts
            .where((s) => now.difference(s.startedAt).inDays < 7)
            .fold<int>(0, (sum, s) => sum + s.minutes);

        return RefreshIndicator(
          color: Brand.green,
          backgroundColor: Brand.panel,
          onRefresh: store.refresh,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(18, 8, 18, 24),
            children: [
              if (store.offline)
                Container(
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
                  decoration: BoxDecoration(
                    color: Brand.danger.withValues(alpha: 0.10),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    tr('shifts.offline'),
                    style: const TextStyle(
                        fontSize: 11.5, fontWeight: FontWeight.w700, color: Brand.danger),
                  ),
                ),

              /* المجموعان قبل القائمة: الرقم الذي يبحث عنه السائق أولًا هو
                 «كم عملت»، لا تفاصيل كل وردية على حدة */
              Row(
                children: [
                  Expanded(
                    child: _Total(label: tr('shifts.totalToday'), value: _spell(today)),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _Total(label: tr('shifts.totalWeek'), value: _spell(week)),
                  ),
                ],
              ),
              const SizedBox(height: 18),

              if (store.shifts.isEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 40),
                  child: Column(
                    children: [
                      const Icon(Icons.event_note_outlined, size: 36, color: Brand.muted),
                      const SizedBox(height: 12),
                      Text(tr('shifts.empty'),
                          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800)),
                      const SizedBox(height: 6),
                      Text(
                        tr('shifts.emptyHint'),
                        textAlign: TextAlign.center,
                        style: const TextStyle(fontSize: 11.5, height: 1.6, color: Brand.muted),
                      ),
                    ],
                  ),
                )
              else
                for (final shift in store.shifts) ...[
                  _ShiftCard(
                    shift: shift,
                    day: _day(shift.startedAt),
                    from: _clock(shift.startedAt),
                    to: shift.endedAt == null ? null : _clock(shift.endedAt!),
                    duration: _spell(shift.minutes),
                  ),
                  const SizedBox(height: 10),
                ],
            ],
          ),
        );
      },
    );
  }
}

class _Total extends StatelessWidget {
  const _Total({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.04),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Brand.border.withValues(alpha: 0.6)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(fontSize: 11, color: Brand.muted)),
          const SizedBox(height: 5),
          Text(value,
              style: const TextStyle(
                  fontSize: 17, fontWeight: FontWeight.w900, color: Brand.green)),
        ],
      ),
    );
  }
}

class _ShiftCard extends StatelessWidget {
  const _ShiftCard({
    required this.shift,
    required this.day,
    required this.from,
    required this.duration,
    this.to,
  });

  final Shift shift;
  final String day;
  final String from;
  final String? to;
  final String duration;

  @override
  Widget build(BuildContext context) {
    final open = shift.isOpen;

    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 13),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.035),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: open
              ? Brand.green.withValues(alpha: 0.45)
              : Brand.border.withValues(alpha: 0.7),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(day,
                  textDirection: TextDirection.ltr,
                  style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800)),
              const Spacer(),
              if (open)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
                  decoration: BoxDecoration(
                    color: Brand.green.withValues(alpha: 0.14),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(tr('shifts.running'),
                      style: const TextStyle(
                          fontSize: 10, fontWeight: FontWeight.w900, color: Brand.green)),
                )
              else
                Text(duration,
                    style: const TextStyle(
                        fontSize: 12, fontWeight: FontWeight.w900, color: Brand.green)),
            ],
          ),
          const SizedBox(height: 11),
          Row(
            children: [
              _Stamp(label: tr('shifts.from'), value: from, tone: Brand.green),
              const SizedBox(width: 16),
              /* الوردية الجارية بلا وقت انتهاء — شرطة صريحة أوضح من فراغ
                 يُقرأ كعطل في العرض */
              _Stamp(label: tr('shifts.to'), value: to ?? '—', tone: Brand.muted),
              const Spacer(),
              if (shift.maxSpeed > 0)
                _Stamp(
                  label: tr('shifts.maxSpeed'),
                  value: '${shift.maxSpeed}',
                  tone: Brand.muted,
                ),
            ],
          ),
          if (shift.wasCutOff) ...[
            const SizedBox(height: 9),
            Row(
              children: [
                const Icon(Icons.info_outline, size: 13, color: Brand.warn),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    tr('shifts.cutOff'),
                    style: const TextStyle(fontSize: 10.5, color: Brand.warn),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _Stamp extends StatelessWidget {
  const _Stamp({required this.label, required this.value, required this.tone});

  final String label;
  final String value;
  final Color tone;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontSize: 10, color: Brand.muted)),
        const SizedBox(height: 2),
        Text(value,
            textDirection: TextDirection.ltr,
            style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w900, color: tone)),
      ],
    );
  }
}
