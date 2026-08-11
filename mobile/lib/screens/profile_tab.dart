import 'package:flutter/material.dart';

import '../i18n.dart';
import '../services/session.dart';
import '../services/support_store.dart';
import '../theme.dart';
import 'support_chat.dart';

/// الملف الشخصي.
///
/// كل ما فيه يأتي من الجلسة نفسها — لا حقل يحرّره السائق. الاسم والمركبة
/// تملكهما الإدارة، وشاشة تسمح بتعديلهما محليًّا تعِد بما لا تستطيع الوفاء به:
/// الاسم سيعود كما كان عند أول تحديث من السيرفر.
class ProfileTab extends StatelessWidget {
  const ProfileTab({
    super.key,
    required this.session,
    required this.support,
    required this.onSignOut,
  });

  final Session session;

  /// محادثة الدعم — تُقرأ هنا لأجل الشارة، وتُمرَّر إلى شاشة المحادثة كما هي.
  final SupportStore support;

  /// `null` أثناء الوردية — نفس قاعدة زرّ الخروج في الشريط العلوي.
  final VoidCallback? onSignOut;

  String get _initials {
    final parts = session.nameAr.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty);
    if (parts.isEmpty) return '؟';
    return parts.take(2).map((p) => p.substring(0, 1)).join();
  }

  @override
  Widget build(BuildContext context) {
    final vehicle = session.vehicleId;

    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 12, 18, 24),
      children: [
        Center(
          child: Column(
            children: [
              Container(
                width: 74,
                height: 74,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [Brand.green, Color(0xFF00A87C)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                      color: Brand.green.withValues(alpha: 0.3),
                      blurRadius: 22,
                      offset: const Offset(0, 8),
                    ),
                  ],
                ),
                child: Text(
                  _initials,
                  style: const TextStyle(
                      fontSize: 25, fontWeight: FontWeight.w900, color: Brand.onGreen),
                ),
              ),
              const SizedBox(height: 13),
              Text(session.nameAr,
                  style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
              const SizedBox(height: 4),
              Text(tr('profile.role.driver'),
                  style: const TextStyle(fontSize: 12, color: Brand.muted)),
            ],
          ),
        ),
        const SizedBox(height: 26),

        _Group(children: [
          _Row(
            icon: Icons.person_outline,
            label: tr('profile.username'),
            value: session.username,
          ),
          _Row(
            icon: Icons.local_shipping_outlined,
            label: tr('profile.vehicle'),
            value: vehicle == null ? tr('app.noVehicle') : tr1('app.vehicle', vehicle),
            tone: vehicle == null ? Brand.danger : null,
          ),
        ]),
        const SizedBox(height: 14),

        _Group(children: [
          /* اللغة هنا أيضًا لا في الشريط وحده: من يبحث عن إعداد يبحث عنه في
             صفحة الإعدادات، لا في أيقونة أعلى الشاشة */
          _Row(
            icon: Icons.language,
            label: tr('profile.language'),
            value: AppLocale.isArabic ? 'العربية' : 'English',
            onTap: AppLocale.toggle,
          ),
          /* الدعم تحت اللغة مباشرةً: السائق الذي لا يجد جوابًا في الشاشة
             يبحث عن إنسان، ومكان البحث هو صفحة الإعدادات لا الشريط العلوي.
             الشارة تُبنى وحدها فلا تُعاد الصفحة كلها عند وصول ردّ */
          AnimatedBuilder(
            animation: support,
            builder: (context, _) => _Row(
              icon: Icons.headset_mic_outlined,
              label: tr('profile.support.title'),
              value: support.unread > 0
                  ? tr1('profile.support.unread', support.unread)
                  : tr('profile.support.open'),
              tone: support.unread > 0 ? Brand.green : null,
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => SupportChatScreen(store: support),
                ),
              ),
            ),
          ),
          _Row(
            icon: Icons.info_outline,
            label: tr('profile.version'),
            value: '1.0.0',
          ),
        ]),
        const SizedBox(height: 20),

        Opacity(
          opacity: onSignOut == null ? 0.4 : 1,
          child: OutlinedButton.icon(
            onPressed: onSignOut,
            icon: const Icon(Icons.logout, size: 17),
            label: Text(tr('top.signOut')),
            style: OutlinedButton.styleFrom(
              foregroundColor: Brand.danger,
              side: BorderSide(color: Brand.danger.withValues(alpha: 0.4)),
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
            ),
          ),
        ),
        const SizedBox(height: 14),
        /* زرّ باهت بلا سبب يقرأ كعطل. الشريط العلوي كان يقول السبب في تلميحه،
           وقد زال الزرّ من هناك، فالسبب يُقال هنا صراحةً */
        Text(
          onSignOut == null ? tr('top.signOutBlocked') : tr('profile.support'),
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 11,
            fontWeight: onSignOut == null ? FontWeight.w700 : FontWeight.w400,
            color: onSignOut == null ? Brand.warn : Brand.muted,
          ),
        ),
      ],
    );
  }
}

class _Group extends StatelessWidget {
  const _Group({required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.035),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Brand.border.withValues(alpha: 0.6)),
      ),
      child: Column(
        children: [
          for (var i = 0; i < children.length; i++) ...[
            if (i > 0)
              Divider(height: 1, color: Brand.border.withValues(alpha: 0.5), indent: 46),
            children[i],
          ],
        ],
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({
    required this.icon,
    required this.label,
    required this.value,
    this.tone,
    this.onTap,
  });

  final IconData icon;
  final String label;
  final String value;
  final Color? tone;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        child: Row(
          children: [
            Icon(icon, size: 17, color: Brand.muted),
            const SizedBox(width: 11),
            Text(label, style: const TextStyle(fontSize: 12.5, color: Brand.muted)),
            const Spacer(),
            Text(
              value,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w800,
                color: tone ?? Brand.text,
              ),
            ),
            if (onTap != null) ...[
              const SizedBox(width: 6),
              const Icon(Icons.chevron_left, size: 17, color: Brand.muted),
            ],
          ],
        ),
      ),
    );
  }
}
