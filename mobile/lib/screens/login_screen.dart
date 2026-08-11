import 'package:flutter/material.dart';

import '../i18n.dart';
import '../services/api_client.dart';
import '../services/session.dart';
import '../services/tracker.dart';
import '../theme.dart';
import '../widgets/stage_background.dart';

/// شاشة الدخول.
///
/// تتبع تصميم صفحة الدخول في الموقع: مسرح داكن متحرّك خلف بطاقة فاتحة، مع
/// تغيير واحد — النص هنا يقول «تطبيق السائق» لا «مركز التحكم»، فالسائق يدخل
/// إلى وردية لا إلى لوحة إدارة.
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, required this.tracker, required this.api});

  final Tracker tracker;
  final ApiClient api;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _username = TextEditingController();
  final _password = TextEditingController();

  bool _busy = false;
  bool _hidden = true;
  bool _remember = true;
  String? _error;

  @override
  void dispose() {
    _username.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_busy) return;
    FocusScope.of(context).unfocus();
    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      final data = await widget.api.login(_username.text.trim(), _password.text);
      await widget.tracker.setSession(
        Session(token: data['token'] as String, user: data['user'] as Map<String, dynamic>),
        persist: _remember,
      );
    } on ApiException catch (e) {
      setState(() {
        _error = switch (e.status) {
          403 => tr('login.driversOnly'),
          401 => tr('login.failed'),
          0 => tr('login.noServer'),
          _ => e.message,
        };
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    final wide = size.width >= 1100;

    /* شاشات الجوال القصيرة — ولوحة المفاتيح تبتلع نصفها — تحتاج البطاقة
       مضغوطة لتظهر كاملة بلا تمرير، تمامًا كما يفعل الموقع. */
    final compact = size.height < 720;

    return Scaffold(
      backgroundColor: Stage.bg,
      body: Stack(
        children: [
          /* ── المسرح المتحرّك ─────────────────────────────── */
          const Positioned.fill(child: StageBackground()),

          /* شرائح القياس — على الشاشات العريضة فقط، كما في الموقع */
          if (wide) ...[
            Positioned(
              top: 200,
              right: 90,
              child: _HudChip(
                icon: Icons.satellite_alt,
                value: '128',
                label: tr('login.stat.vehicles'),
                tint: Brand.green,
              ),
            ),
            Positioned(
              top: 165,
              left: 90,
              child: _HudChip(
                icon: Icons.route_outlined,
                value: '10s',
                label: tr('login.stat.refresh'),
                tint: const Color(0xFF38BDF8),
              ),
            ),
            Positioned(
              bottom: 165,
              left: 110,
              child: _HudChip(
                icon: Icons.notifications_active_outlined,
                value: tr('login.stat.alerts'),
                label: tr('login.stat.live'),
                tint: Brand.warn,
              ),
            ),
          ],

          SafeArea(
            child: Column(
              children: [
                _StageHeader(compact: compact),
                Expanded(
                  child: Center(
                    child: SingleChildScrollView(
                      padding: EdgeInsets.symmetric(horizontal: 18, vertical: compact ? 6 : 12),
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 424),
                        child: _card(compact),
                      ),
                    ),
                  ),
                ),
                /* الفوتر أول ما يُضحّى به حين تضيق الشاشة */
                if (!compact) const _StageFooter(),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _card(bool compact) {
    final gap = compact ? 0.72 : 1.0;

    return Container(
      padding: EdgeInsets.symmetric(horizontal: compact ? 20 : 26, vertical: compact ? 18 : 26),
      decoration: BoxDecoration(
        color: Sheet.bg,
        borderRadius: BorderRadius.circular(compact ? 22 : 26),
        border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
        boxShadow: const [BoxShadow(color: Color(0x66000000), blurRadius: 60, offset: Offset(0, 26))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              width: compact ? 38 : 46,
              height: compact ? 38 : 46,
              decoration: BoxDecoration(
                color: Brand.green.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(compact ? 12 : 15),
                border: Border.all(color: Brand.green.withValues(alpha: 0.25)),
              ),
              child: Icon(Icons.verified_user_outlined, size: compact ? 18 : 21, color: Brand.green),
            ),
          ),
          SizedBox(height: 14 * gap),
          Text(
            tr('login.welcome'),
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: compact ? 21 : 25,
              fontWeight: FontWeight.w900,
              color: Sheet.text,
              height: 1.2,
            ),
          ),
          SizedBox(height: 7 * gap),
          Text(
            tr('login.subtitle'),
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: compact ? 11.5 : 12.5, height: 1.5, color: Sheet.muted),
          ),

          SizedBox(height: 20 * gap),
          _label(tr('login.username'), compact),
          _field(
            controller: _username,
            icon: Icons.person_outline,
            hint: tr('login.username'),
            compact: compact,
            autofill: const [AutofillHints.username],
          ),

          SizedBox(height: 12 * gap),
          _label(tr('login.password'), compact),
          _field(
            controller: _password,
            icon: Icons.lock_outline,
            hint: '••••••••',
            obscure: _hidden,
            compact: compact,
            autofill: const [AutofillHints.password],
            onSubmit: (_) => _submit(),
            trailing: IconButton(
              onPressed: () => setState(() => _hidden = !_hidden),
              icon: Icon(_hidden ? Icons.visibility_outlined : Icons.visibility_off_outlined,
                  size: 18, color: Sheet.muted),
              tooltip: _hidden ? tr('login.show') : tr('login.hide'),
            ),
          ),

          SizedBox(height: 10 * gap),
          _rememberRow(compact),

          if (_error != null) ...[
            SizedBox(height: 12 * gap),
            _errorBox(_error!),
          ],

          SizedBox(height: 16 * gap),
          SizedBox(
            height: compact ? 46 : 50,
            child: FilledButton(
              onPressed: _busy ? null : _submit,
              child: _busy
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2.4, color: Brand.onGreen),
                    )
                  : Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(tr('login.title'),
                            style: TextStyle(
                                fontSize: compact ? 14.5 : 15.5, fontWeight: FontWeight.w900)),
                        const SizedBox(width: 8),
                        const Icon(Icons.arrow_back, size: 18),
                      ],
                    ),
            ),
          ),

          SizedBox(height: 14 * gap),
          const Divider(height: 1, color: Sheet.border),
          SizedBox(height: 11 * gap),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.verified_user_outlined, size: 14, color: Brand.green),
              const SizedBox(width: 6),
              Text(tr('login.secure'),
                  style: TextStyle(
                      fontSize: compact ? 11 : 12,
                      fontWeight: FontWeight.w700,
                      color: Sheet.muted)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _label(String text, bool compact) => Padding(
        padding: EdgeInsets.only(bottom: compact ? 5 : 7),
        child: Text(text,
            style: TextStyle(
                fontSize: compact ? 11.5 : 12.5,
                fontWeight: FontWeight.w800,
                color: Sheet.text)),
      );

  Widget _field({
    required TextEditingController controller,
    required IconData icon,
    required String hint,
    required bool compact,
    bool obscure = false,
    Widget? trailing,
    List<String>? autofill,
    ValueChanged<String>? onSubmit,
  }) {
    return TextField(
      controller: controller,
      obscureText: obscure,
      textDirection: TextDirection.ltr,
      autocorrect: false,
      enableSuggestions: false,
      autofillHints: autofill,
      onSubmitted: onSubmit,
      style: TextStyle(fontSize: compact ? 13.5 : 14, color: Sheet.text),
      decoration: InputDecoration(
        isDense: compact,
        hintText: hint,
        hintStyle: TextStyle(color: Sheet.muted, fontSize: compact ? 12.5 : 13.5),
        prefixIcon: Icon(icon, size: 18, color: Sheet.muted),
        suffixIcon: trailing,
        filled: true,
        fillColor: Sheet.field,
        contentPadding: EdgeInsets.symmetric(horizontal: 14, vertical: compact ? 11 : 14),
        border: _border(Sheet.border),
        enabledBorder: _border(Sheet.border),
        focusedBorder: _border(Brand.green, width: 1.6),
      ),
    );
  }

  OutlineInputBorder _border(Color c, {double width = 1}) => OutlineInputBorder(
        borderRadius: BorderRadius.circular(13),
        borderSide: BorderSide(color: c, width: width),
      );

  /// غير مفعّلة = الجلسة تعيش ما دام التطبيق مفتوحًا فقط؛ لا تُكتب على القرص.
  Widget _rememberRow(bool compact) {
    return InkWell(
      onTap: () => setState(() => _remember = !_remember),
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: EdgeInsets.symmetric(vertical: compact ? 2 : 4),
        child: Row(
          children: [
            Container(
              width: compact ? 18 : 20,
              height: compact ? 18 : 20,
              decoration: BoxDecoration(
                color: _remember ? Brand.green : Colors.transparent,
                borderRadius: BorderRadius.circular(6),
                border: Border.all(color: _remember ? Brand.green : Sheet.border, width: 1.5),
              ),
              child: _remember
                  ? Icon(Icons.check, size: compact ? 12 : 14, color: Brand.onGreen)
                  : null,
            ),
            const SizedBox(width: 9),
            Text(tr('login.remember'),
                style: TextStyle(
                    fontSize: compact ? 11.5 : 12.5,
                    fontWeight: FontWeight.w700,
                    color: Sheet.text)),
          ],
        ),
      ),
    );
  }

  Widget _errorBox(String message) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: Brand.danger.withValues(alpha: 0.10),
          border: Border.all(color: Brand.danger.withValues(alpha: 0.35)),
          borderRadius: BorderRadius.circular(13),
        ),
        child: Row(
          children: [
            const Icon(Icons.error_outline, size: 17, color: Brand.danger),
            const SizedBox(width: 9),
            Expanded(
              child: Text(message,
                  style: const TextStyle(
                      fontSize: 12.5, fontWeight: FontWeight.w700, color: Brand.danger)),
            ),
          ],
        ),
      );
}

/* ══════════════════════════════════════════════════════════════════
   عناصر المسرح
   ══════════════════════════════════════════════════════════════════ */

/// الشريط العلوي. لا زرّ «العودة للرئيسية» هنا — لا موقع خلف التطبيق —
/// وبدلًا منه شارة تقول أي تطبيق هذا.
class _StageHeader extends StatelessWidget {
  const _StageHeader({required this.compact});

  final bool compact;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(16, compact ? 8 : 14, 16, 0),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
            decoration: BoxDecoration(
              color: const Color(0x800A1420),
              borderRadius: BorderRadius.circular(15),
              border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 7,
                  height: 7,
                  decoration: const BoxDecoration(color: Brand.green, shape: BoxShape.circle),
                ),
                const SizedBox(width: 8),
                Text(tr('login.liveNow'),
                    style: TextStyle(
                        fontSize: 11.5,
                        fontWeight: FontWeight.w800,
                        color: Colors.white.withValues(alpha: 0.72))),
              ],
            ),
          ),
          const Spacer(),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 8),
            decoration: BoxDecoration(
              color: Brand.green.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(15),
              border: Border.all(color: Brand.green.withValues(alpha: 0.28)),
            ),
            child: Text(tr('app.subtitle'),
                style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w900, color: Brand.green)),
          ),
        ],
      ),
    );
  }
}

class _StageFooter extends StatelessWidget {
  const _StageFooter();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 11),
      decoration: BoxDecoration(
        border: Border(top: BorderSide(color: Colors.white.withValues(alpha: 0.08))),
      ),
      child: Text(
        tr('login.copyright'),
        textAlign: TextAlign.center,
        style: TextStyle(fontSize: 10.5, color: Colors.white.withValues(alpha: 0.35)),
      ),
    );
  }
}

class _HudChip extends StatelessWidget {
  const _HudChip({
    required this.icon,
    required this.value,
    required this.label,
    required this.tint,
  });

  final IconData icon;
  final String value;
  final String label;
  final Color tint;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 11),
      decoration: BoxDecoration(
        color: const Color(0x990A1420),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 15, color: tint),
          const SizedBox(width: 10),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(value,
                  style: const TextStyle(
                      fontSize: 12, fontWeight: FontWeight.w900, color: Colors.white)),
              const SizedBox(height: 2),
              Text(label,
                  style: TextStyle(
                      fontSize: 10.5,
                      fontWeight: FontWeight.w700,
                      color: Colors.white.withValues(alpha: 0.55))),
            ],
          ),
        ],
      ),
    );
  }
}
