import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'i18n.dart';
import 'screens/login_screen.dart';
import 'screens/home_shell.dart';
import 'services/alerts_store.dart';
import 'services/shifts_store.dart';
import 'services/api_client.dart';
import 'services/session.dart';
import 'services/support_store.dart';
import 'services/tracker.dart';
import 'theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const MirsadDriverApp());
}

class MirsadDriverApp extends StatefulWidget {
  const MirsadDriverApp({super.key});

  @override
  State<MirsadDriverApp> createState() => _MirsadDriverAppState();
}

class _MirsadDriverAppState extends State<MirsadDriverApp> {
  final _api = ApiClient();
  late final Tracker _tracker = Tracker(api: _api, store: SessionStore());
  late final AlertsStore _alerts = AlertsStore(api: _api);
  late final ShiftsStore _shifts = ShiftsStore(api: _api);
  late final SupportStore _support = SupportStore(api: _api);

  /// نبقى على شاشة الانتظار حتى تُقرأ الجلسة المخزَّنة، وإلا ومض السائق
  /// على شاشة الدخول لحظة عند كل فتح رغم أنه مسجّل بالفعل.
  bool _ready = false;

  @override
  void initState() {
    super.initState();
    _boot();
  }

  Future<void> _boot() async {
    /* اللغة قبل أي رسم: بناء الشاشة بالعربية ثم قلبها إنجليزيًّا بعد لحظة
       ومضة مزعجة عند كل فتح لمن اختار الإنجليزية */
    await AppLocale.restore();
    await _tracker.restore();

    /* صندوق التنبيهات يتبع الجلسة: يبدأ السؤال عند الدخول ويتوقف عند الخروج،
       فلا يسأل السيرفر بتوكن انتهى */
    _tracker.addListener(_followSession);
    _followSession();

    // الإدارة قد تكون بدّلت مركبته أو أوقفت حسابه أثناء غيابه
    final token = _tracker.session?.token;
    if (token != null) {
      try {
        final fresh = await _api.me(token);
        if (fresh == null) {
          await _tracker.signOut();
        } else {
          await _tracker.setSession(_tracker.session!.copyWith(user: fresh));
        }
      } on ApiException catch (e) {
        // بلا شبكة نبقي الجلسة المحلية؛ فقدان الصلاحية وحده يُخرجه
        if (e.isAuthFailure) await _tracker.signOut();
      }
    }

    if (mounted) setState(() => _ready = true);
  }

  void _followSession() {
    final token = _tracker.session?.token;
    _alerts.watch(token);
    _shifts.watch(token);
    _support.watch(token);
  }

  @override
  void dispose() {
    _tracker.removeListener(_followSession);
    _alerts.dispose();
    _shifts.dispose();
    _support.dispose();
    _tracker.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    /* اللغة تُعاد بناء الشجرة كلّها عند تغيّرها — بما فيها اتجاه الكتابة،
       الذي كان مثبَّتًا على اليمين ولا يصحّ تثبيته بعد اليوم */
    return ValueListenableBuilder<String>(
      valueListenable: AppLocale.current,
      builder: (context, lang, _) => MaterialApp(
        title: 'مرصاد — السائق',
        debugShowCheckedModeBanner: false,
        theme: buildTheme(),
        locale: Locale(lang),
        supportedLocales: const [Locale('ar'), Locale('en')],
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        builder: (context, child) => Directionality(
          textDirection: lang == 'ar' ? TextDirection.rtl : TextDirection.ltr,
          child: child!,
        ),
        home: !_ready
            ? const Scaffold(body: Center(child: CircularProgressIndicator()))
            : AnimatedBuilder(
                animation: _tracker,
                builder: (context, _) => _tracker.session == null
                    ? LoginScreen(tracker: _tracker, api: _api)
                    : HomeShell(
                        tracker: _tracker,
                        alerts: _alerts,
                        shifts: _shifts,
                        support: _support,
                      ),
              ),
      ),
    );
  }
}
