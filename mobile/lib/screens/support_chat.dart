import 'package:flutter/material.dart';

import '../i18n.dart';
import '../services/support_store.dart';
import '../theme.dart';
import '../widgets/stage_background.dart';

/// شاشة الدعم الفني — محادثة واحدة مع إدارة الأسطول.
///
/// لا اختيار لمن تُرسل إليه ولا موضوع يُنتقى من قائمة: السائق يكتب، والإدارة
/// تقرأ. كل حقل إضافي هنا هو سؤال يؤخّر من يقف بجانب مركبة معطّلة.
class SupportChatScreen extends StatefulWidget {
  const SupportChatScreen({super.key, required this.store});

  final SupportStore store;

  @override
  State<SupportChatScreen> createState() => _SupportChatScreenState();
}

class _SupportChatScreenState extends State<SupportChatScreen> {
  final _field = TextEditingController();
  final _scroll = ScrollController();
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    /* الفتح هو القراءة، والسؤال يتسارع ما دامت الشاشة مفتوحة */
    widget.store.setActive(true);
    widget.store.markRead();
    widget.store.addListener(_toBottom);
  }

  @override
  void dispose() {
    widget.store.removeListener(_toBottom);
    widget.store.setActive(false);
    _field.dispose();
    _scroll.dispose();
    super.dispose();
  }

  /// آخر رسالة هي المقصودة دائمًا — تُبقى القائمة على أسفلها.
  void _toBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.jumpTo(_scroll.position.maxScrollExtent);
      }
    });
  }

  Future<void> _send([String? retry]) async {
    final text = retry ?? _field.text.trim();
    if (text.isEmpty || _sending) return;

    setState(() => _sending = true);
    if (retry != null) widget.store.dropPending();
    _field.clear();

    final sent = await widget.store.send(text);
    if (!mounted) return;
    setState(() => _sending = false);
    if (sent) _toBottom();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Stage.bg,
      body: Stack(
        children: [
          const Positioned.fill(child: StageBackground(intensity: 0.45)),
          SafeArea(
            child: Column(
              children: [
                _Header(onClose: () => Navigator.of(context).pop()),
                Expanded(
                  child: AnimatedBuilder(
                    animation: widget.store,
                    builder: (context, _) => _Body(
                      store: widget.store,
                      scroll: _scroll,
                      onRetry: _send,
                    ),
                  ),
                ),
                _Composer(
                  controller: _field,
                  sending: _sending,
                  onSend: _send,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.onClose});

  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(10, 8, 14, 8),
      child: Row(
        children: [
          IconButton(
            onPressed: onClose,
            icon: const Icon(Icons.arrow_back, size: 20, color: Brand.muted),
          ),
          Container(
            width: 34,
            height: 34,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: Brand.green.withValues(alpha: 0.14),
              borderRadius: BorderRadius.circular(11),
            ),
            child: const Icon(Icons.headset_mic_outlined, size: 18, color: Brand.green),
          ),
          const SizedBox(width: 10),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(tr('support.title'),
                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w900)),
              Text(tr('support.with'),
                  style: const TextStyle(
                      fontSize: 10.5, fontWeight: FontWeight.w700, color: Brand.muted)),
            ],
          ),
        ],
      ),
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({required this.store, required this.scroll, required this.onRetry});

  final SupportStore store;
  final ScrollController scroll;
  final ValueChanged<String> onRetry;

  @override
  Widget build(BuildContext context) {
    final messages = store.messages;

    if (messages.isEmpty) {
      return Padding(
        padding: const EdgeInsets.fromLTRB(30, 40, 30, 20),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.support_agent_outlined, size: 38, color: Brand.muted),
            const SizedBox(height: 14),
            Text(tr('support.empty'),
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800)),
            const SizedBox(height: 7),
            Text(
              tr('support.emptyHint'),
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 12, height: 1.6, color: Brand.muted),
            ),
          ],
        ),
      );
    }

    return Column(
      children: [
        /* تعذّر التحديث لا يخفي ما وصل سابقًا — يُقال فوقه وحسب */
        if (store.offline)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 7),
            color: Brand.danger.withValues(alpha: 0.10),
            child: Text(
              tr('support.offline'),
              style: const TextStyle(
                  fontSize: 11.5, fontWeight: FontWeight.w700, color: Brand.danger),
            ),
          ),
        Expanded(
          child: ListView.separated(
            controller: scroll,
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
            itemCount: messages.length,
            separatorBuilder: (_, __) => const SizedBox(height: 9),
            itemBuilder: (context, i) => _Bubble(message: messages[i]),
          ),
        ),
        if (store.sendError != null)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.fromLTRB(16, 8, 8, 8),
            color: Brand.danger.withValues(alpha: 0.10),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    store.sendError!,
                    style: const TextStyle(
                        fontSize: 11.5, fontWeight: FontWeight.w700, color: Brand.danger),
                  ),
                ),
                TextButton(
                  onPressed: () {
                    final pending = store.messages.where((m) => m.pending).toList();
                    if (pending.isNotEmpty) onRetry(pending.last.text);
                  },
                  child: Text(tr('support.retry'),
                      style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w900)),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.message});

  final SupportMessage message;

  /// «منذ ١٢ دقيقة» أوضح من طابع زمني كامل داخل محادثة قصيرة.
  String get _ago {
    final gap = DateTime.now().difference(message.at);
    if (gap.inMinutes < 1) return tr('time.now');
    if (gap.inMinutes < 60) return tr1('time.minutes', gap.inMinutes);
    if (gap.inHours < 24) return tr1('time.hours', gap.inHours);
    return tr1('time.days', gap.inDays);
  }

  @override
  Widget build(BuildContext context) {
    final mine = message.fromDriver;
    final author = AppLocale.isArabic ? message.authorAr : message.authorEn;

    return Opacity(
      opacity: message.pending ? 0.55 : 1,
      child: Row(
        mainAxisAlignment: mine ? MainAxisAlignment.end : MainAxisAlignment.start,
        children: [
          Flexible(
            child: Container(
              constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.78),
              padding: const EdgeInsets.fromLTRB(13, 10, 13, 9),
              decoration: BoxDecoration(
                color: mine
                    ? Brand.green.withValues(alpha: 0.16)
                    : Colors.white.withValues(alpha: 0.05),
                borderRadius: BorderRadius.only(
                  topLeft: const Radius.circular(15),
                  topRight: const Radius.circular(15),
                  bottomLeft: Radius.circular(mine ? 15 : 4),
                  bottomRight: Radius.circular(mine ? 4 : 15),
                ),
                border: Border.all(
                  color: mine
                      ? Brand.green.withValues(alpha: 0.28)
                      : Brand.border.withValues(alpha: 0.7),
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    mine
                        ? tr('support.me')
                        : (author.isEmpty ? tr('support.staff') : author),
                    style: const TextStyle(
                        fontSize: 10.5, fontWeight: FontWeight.w900, color: Brand.muted),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    message.text,
                    style: const TextStyle(fontSize: 13.5, height: 1.5, color: Brand.text),
                  ),
                  const SizedBox(height: 5),
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (message.pending) ...[
                        const Icon(Icons.schedule, size: 11, color: Brand.muted),
                        const SizedBox(width: 4),
                      ],
                      Text(
                        message.pending ? tr('support.pending') : _ago,
                        style: const TextStyle(fontSize: 10, color: Brand.muted),
                      ),
                    ],
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

class _Composer extends StatelessWidget {
  const _Composer({
    required this.controller,
    required this.sending,
    required this.onSend,
  });

  final TextEditingController controller;
  final bool sending;
  final VoidCallback onSend;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.fromLTRB(
        12,
        10,
        12,
        10 + MediaQuery.viewInsetsOf(context).bottom,
      ),
      decoration: BoxDecoration(
        color: Brand.panel.withValues(alpha: 0.96),
        border: Border(top: BorderSide(color: Brand.border.withValues(alpha: 0.7))),
      ),
      child: SafeArea(
        top: false,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Expanded(
              child: TextField(
                controller: controller,
                minLines: 1,
                maxLines: 4,
                maxLength: 2000,
                textInputAction: TextInputAction.newline,
                style: const TextStyle(fontSize: 13.5, color: Brand.text),
                decoration: InputDecoration(
                  counterText: '',
                  hintText: tr('support.hint'),
                  hintStyle: const TextStyle(fontSize: 13, color: Brand.muted),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                ),
              ),
            ),
            const SizedBox(width: 9),
            SizedBox(
              width: 48,
              height: 48,
              child: FilledButton(
                onPressed: sending ? null : onSend,
                style: FilledButton.styleFrom(
                  backgroundColor: Brand.green,
                  foregroundColor: Brand.onGreen,
                  minimumSize: const Size.square(48),
                  padding: EdgeInsets.zero,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
                child: sending
                    ? const SizedBox(
                        width: 17,
                        height: 17,
                        child: CircularProgressIndicator(
                            strokeWidth: 2.2, color: Brand.onGreen),
                      )
                    : const Icon(Icons.send_rounded, size: 19),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
