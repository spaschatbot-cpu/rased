import 'package:flutter/material.dart';

import '../i18n.dart';
import '../services/session.dart';
import '../theme.dart';

/// حسابي: من أنا، واللغة، والخروج.
class AccountTab extends StatelessWidget {
  const AccountTab({super.key, required this.session, required this.onSignOut});

  final Session session;
  final VoidCallback onSignOut;

  String get _initials {
    final parts = session.nameAr.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty);
    if (parts.isEmpty) return '؟';
    return parts.take(2).map((p) => p.substring(0, 1)).join();
  }

  @override
  Widget build(BuildContext context) {
    final role = tr('fleet.role.${session.role}');

    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 24),
      children: [
        Center(
          child: Container(
            width: 74,
            height: 74,
            alignment: Alignment.center,
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                colors: [Brand.green, Color(0xFF00A87C)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              shape: BoxShape.circle,
            ),
            child: Text(
              _initials,
              style: const TextStyle(
                  fontSize: 25, fontWeight: FontWeight.w900, color: Brand.onGreen),
            ),
          ),
        ),
        const SizedBox(height: 12),
        Text(
          session.nameAr.isEmpty ? session.username : session.nameAr,
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
        ),
        const SizedBox(height: 4),
        Text(
          role.startsWith('fleet.role.') ? session.role : role,
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 12.5, color: Brand.muted),
        ),
        const SizedBox(height: 22),
        _Row(
          icon: Icons.alternate_email_rounded,
          label: tr('profile.username'),
          value: session.username,
        ),
        _Row(
          icon: Icons.language_rounded,
          label: tr('profile.language'),
          value: AppLocale.isArabic ? 'العربية' : 'English',
          onTap: AppLocale.toggle,
        ),
        const SizedBox(height: 22),
        OutlinedButton.icon(
          onPressed: onSignOut,
          style: OutlinedButton.styleFrom(
            foregroundColor: Brand.danger,
            side: BorderSide(color: Brand.danger.withValues(alpha: 0.5)),
            minimumSize: const Size.fromHeight(50),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          ),
          icon: const Icon(Icons.logout_rounded, size: 19),
          label: Text(tr('top.signOut'),
              style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800)),
        ),
      ],
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.icon, required this.label, required this.value, this.onTap});

  final IconData icon;
  final String label;
  final String value;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: const Color(0xB3101C2B),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: BorderSide(color: Colors.white.withValues(alpha: 0.08)),
        ),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(14),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
            child: Row(
              children: [
                Icon(icon, size: 19, color: Brand.green),
                const SizedBox(width: 12),
                Text(label, style: const TextStyle(fontSize: 13, color: Brand.muted)),
                const Spacer(),
                Text(value,
                    style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800)),
                if (onTap != null) ...[
                  const SizedBox(width: 4),
                  const Icon(Icons.chevron_left_rounded, size: 18, color: Brand.muted),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
