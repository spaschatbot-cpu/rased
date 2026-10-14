import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'i18n.dart';
import 'screens/login_screen.dart';
import 'screens/tracking_shell.dart';
import 'services/api_client.dart';
import 'services/fleet_store.dart';
import 'services/session.dart';
import 'services/tracker.dart';
import 'theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const AutoTrackDriverApp());
}

class AutoTrackDriverApp extends StatefulWidget {
  const AutoTrackDriverApp({super.key});

  @override
  State<AutoTrackDriverApp> createState() => _AutoTrackDriverAppState();
}

class _AutoTrackDriverAppState extends State<AutoTrackDriverApp> {
  final _api = ApiClient();
  late final Tracker _tracker = Tracker(api: _api, store: SessionStore());
  late final FleetStore _fleet = FleetStore(api: _api)..onAuthFailure = _tracker.signOut;

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

    /* الأسطول يتبع الجلسة: يبدأ السؤال عند الدخول ويتوقف عند الخروج،
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
    _fleet.watch(_tracker.session?.token);
  }

  @override
  void dispose() {
    _tracker.removeListener(_followSession);
    _fleet.dispose();
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
        title: 'أوتو تراك',
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
                    : TrackingShell(tracker: _tracker, fleet: _fleet, api: _api),
              ),
      ),
    );
  }
}
