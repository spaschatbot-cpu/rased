import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../i18n.dart';
import '../services/api_client.dart';
import '../services/tracker.dart';
import '../theme.dart';

/// «بلّغ عن عطل»: السائق يختار نوع المشكلة، يكتبها، ويرفق صورة إن شاء.
/// الطلب يصل لوحة الإدارة في «طلبات الإصلاح» ويظهر في صندوق التنبيهات.
/// تحت النموذج طلباته السابقة وحالة كل منها وردّ الإدارة عليه.
class RepairScreen extends StatefulWidget {
  const RepairScreen({super.key, required this.tracker, required this.api});

  final Tracker tracker;
  final ApiClient api;

  @override
  State<RepairScreen> createState() => _RepairScreenState();
}

const _categories = [
  ('engine', Icons.settings_rounded),
  ('tires', Icons.tire_repair_rounded),
  ('brakes', Icons.do_not_step_rounded),
  ('electrical', Icons.electrical_services_rounded),
  ('ac', Icons.ac_unit_rounded),
  ('accident', Icons.car_crash_rounded),
  ('other', Icons.more_horiz_rounded),
];

class _RepairScreenState extends State<RepairScreen> {
  final _text = TextEditingController();
  String _category = 'engine';
  String? _photo; // data URL
  bool _sending = false;
  String? _error;
  List<Map<String, dynamic>> _mine = const [];
  bool _loading = true;

  String get _token => widget.tracker.session!.token;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final list = await widget.api.repairs(_token);
      if (mounted) setState(() => _mine = list);
    } catch (_) {
      /* the list is a convenience — the form works without it */
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _pick(ImageSource source) async {
    try {
      /* resized on the phone: a full camera frame is megabytes, and the office
         only needs to see the flat tyre */
      final file = await ImagePicker().pickImage(source: source, maxWidth: 1280, imageQuality: 60);
      if (file == null) return;
      final bytes = await file.readAsBytes();
      setState(() => _photo = 'data:image/jpeg;base64,${base64Encode(bytes)}');
    } catch (e) {
      debugPrint('[repair] photo pick failed: $e');
      setState(() => _error = tr('repair.photoFailed'));
    }
  }

  Future<void> _send() async {
    final text = _text.text.trim();
    if (text.isEmpty) {
      setState(() => _error = tr('repair.needText'));
      return;
    }
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      await widget.api.fileRepair(_token, category: _category, description: text, photo: _photo);
      _text.clear();
      setState(() => _photo = null);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(tr('repair.sent'))));
      }
      await _load();
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Brand.bg,
      appBar: AppBar(
        backgroundColor: Brand.bg,
        title: Text(tr('repair.title'), style: const TextStyle(fontWeight: FontWeight.w900)),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
        children: [
          Text(tr('repair.kind'), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final (key, icon) in _categories)
                ChoiceChip(
                  selected: _category == key,
                  onSelected: (_) => setState(() => _category = key),
                  avatar: Icon(icon, size: 17, color: _category == key ? Brand.onGreen : Brand.muted),
                  label: Text(tr('repair.cat.$key')),
                  selectedColor: key == 'accident' ? Brand.danger : Brand.green,
                  labelStyle: TextStyle(
                    fontWeight: FontWeight.w800,
                    color: _category == key ? Brand.onGreen : Brand.text,
                  ),
                  backgroundColor: Brand.panel,
                  side: const BorderSide(color: Brand.border),
                  showCheckmark: false,
                ),
            ],
          ),
          const SizedBox(height: 18),
          Text(tr('repair.what'), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          TextField(
            controller: _text,
            maxLines: 4,
            maxLength: 1000,
            decoration: InputDecoration(
              hintText: tr('repair.hint'),
              filled: true,
              fillColor: Brand.panel,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
            ),
          ),
          const SizedBox(height: 8),
          if (_photo != null)
            Stack(
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(14),
                  child: Image.memory(base64Decode(_photo!.split(',').last), height: 180, width: double.infinity, fit: BoxFit.cover),
                ),
                PositionedDirectional(
                  top: 6,
                  end: 6,
                  child: IconButton.filled(
                    onPressed: () => setState(() => _photo = null),
                    icon: const Icon(Icons.close_rounded),
                    style: IconButton.styleFrom(backgroundColor: Colors.black54),
                  ),
                ),
              ],
            )
          else
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => _pick(ImageSource.camera),
                    icon: const Icon(Icons.photo_camera_outlined),
                    label: Text(tr('repair.camera')),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => _pick(ImageSource.gallery),
                    icon: const Icon(Icons.photo_library_outlined),
                    label: Text(tr('repair.gallery')),
                  ),
                ),
              ],
            ),
          if (_error != null) ...[
            const SizedBox(height: 10),
            Text(_error!, style: const TextStyle(color: Brand.danger, fontWeight: FontWeight.w700)),
          ],
          const SizedBox(height: 14),
          FilledButton.icon(
            onPressed: _sending ? null : _send,
            icon: _sending
                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.send_rounded),
            label: Text(tr('repair.send')),
            style: FilledButton.styleFrom(
              backgroundColor: Brand.green,
              foregroundColor: Brand.onGreen,
              minimumSize: const Size.fromHeight(50),
              textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w900),
            ),
          ),
          const SizedBox(height: 28),
          Text(tr('repair.mine'), style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w900)),
          const SizedBox(height: 10),
          if (_loading)
            const Center(child: Padding(padding: EdgeInsets.all(16), child: CircularProgressIndicator()))
          else if (_mine.isEmpty)
            Text(tr('repair.none'), style: const TextStyle(color: Brand.muted))
          else
            for (final r in _mine) _RequestCard(r),
        ],
      ),
    );
  }
}

class _RequestCard extends StatelessWidget {
  const _RequestCard(this.r);

  final Map<String, dynamic> r;

  static const _tone = {
    'open': Brand.danger,
    'inProgress': Brand.warn,
    'done': Brand.green,
    'rejected': Brand.muted,
  };

  @override
  Widget build(BuildContext context) {
    final status = '${r['status']}';
    final tone = _tone[status] ?? Brand.muted;
    final note = '${r['note'] ?? ''}'.trim();
    final at = DateTime.tryParse('${r['createdAt']}')?.toLocal();
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Brand.panel,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Brand.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(tr('repair.cat.${r['category']}'), style: const TextStyle(fontWeight: FontWeight.w900)),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(color: tone.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(20)),
                child: Text(tr('repair.status.$status'),
                    style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w900, color: tone)),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text('${r['description']}', style: const TextStyle(fontSize: 13)),
          if (note.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text('${tr('repair.reply')}: $note',
                style: const TextStyle(fontSize: 12.5, color: Brand.green, fontWeight: FontWeight.w700)),
          ],
          if (at != null) ...[
            const SizedBox(height: 6),
            Text(
              '${at.year}/${at.month.toString().padLeft(2, '0')}/${at.day.toString().padLeft(2, '0')}  '
              '${at.hour.toString().padLeft(2, '0')}:${at.minute.toString().padLeft(2, '0')}',
              style: const TextStyle(fontSize: 11, color: Brand.muted),
            ),
          ],
        ],
      ),
    );
  }
}
