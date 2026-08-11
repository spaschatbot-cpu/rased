import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';

import '../config.dart';
import '../i18n.dart';
import 'api_client.dart';
import 'fix_queue.dart';
import 'session.dart';

enum ShiftState { off, starting, running }

/// الوردية: قراءة الموقع، تخزينه، وإرساله.
///
/// كل ما يخصّ التتبّع هنا حتى تبقى الشاشة عرضًا فقط. تُنشر الحالة عبر
/// [ChangeNotifier] فتتحدّث الواجهة من تلقائها.
class Tracker extends ChangeNotifier {
  Tracker({required ApiClient api, required SessionStore store})
      : _api = api,
        _store = store;

  final ApiClient _api;
  final SessionStore _store;
  final FixQueue _queue = FixQueue();

  StreamSubscription<Position>? _stream;
  Timer? _timer;

  ShiftState state = ShiftState.off;
  Session? session;
  Position? lastFix;
  DateTime? lastSentAt;
  int pending = 0;
  String? error;

  /// وقت أول قراءة في هذه الوردية — يميّز «بدأنا» عن «عرفنا أين نحن».
  DateTime? firstFixAt;

  /// اسم المكان الحالي — «طريق العروبة، الورود، الرياض».
  String? place;

  /// النقطة التي سُئل عندها آخر مرة، حتى لا يتكرّر السؤال بلا داعٍ.
  Position? _placeAskedAt;
  bool _askingPlace = false;

  /// خطأ يستوجب تدخّل السائق (رفض الإذن مثلًا) — تعرضه الشاشة بارزًا.
  bool needsAttention = false;

  bool get isRunning => state == ShiftState.running;

  /// الوردية بدأت والقمر الصناعي لم يردّ بعد.
  ///
  /// الفجوة بين الضغط على الزرّ وأول قراءة قد تبلغ نصف دقيقة تحت سقف أو في
  /// موقف مغلق. بدون هذه الحالة تبدو الشاشة كأن شيئًا لم يحدث، فيضغط السائق
  /// الزرّ ثانية ويوقف الوردية من حيث أراد بدأها.
  bool get isLocating => isRunning && lastFix == null;

  void _publish() => notifyListeners();

  Future<void> restore() async {
    session = await _store.read();
    pending = (await _queue.readAll()).length;
    _publish();
  }

  /// [persist] هو ما يعنيه «تذكّرني»: بدونه تعيش الجلسة في الذاكرة فقط
  /// وتنتهي بإغلاق التطبيق، فلا يبقى توكن على جهاز مشترك.
  Future<void> setSession(Session next, {bool persist = true}) async {
    session = next;
    if (persist) {
      await _store.write(next);
    } else {
      await _store.clear();
    }
    _publish();
  }

  /// ───────────────────────── بدء الوردية ─────────────────────────

  Future<void> start() async {
    if (session == null || isRunning) return;

    state = ShiftState.starting;
    error = null;
    needsAttention = false;
    _publish();

    final ready = await _ensurePermission();
    if (!ready) {
      state = ShiftState.off;
      _publish();
      return;
    }

    _stream = Geolocator.getPositionStream(locationSettings: _settings()).listen(
      _onPosition,
      onError: (Object e) {
        error = tr('err.gpsRead');
        _publish();
      },
    );

    // نبضة ثابتة: تُفرغ ما تجمّع حتى لو لم تصل قراءة جديدة (مركبة واقفة)
    _timer = Timer.periodic(Config.sendEvery, (_) => _flush());

    state = ShiftState.running;
    _publish();
  }

  Future<void> stop() async {
    await _stream?.cancel();
    _stream = null;
    _timer?.cancel();
    _timer = null;

    // محاولة أخيرة حتى لا يضيع آخر جزء من الرحلة
    await _flush();

    final token = session?.token;
    if (token != null) {
      try {
        await _api.endShift(token);
      } on ApiException {
        // لو تعذّر، يعتبرها السيرفر غير متصلة بعد ثلاث دقائق بلا إرسال
      }
    }

    state = ShiftState.off;
    lastFix = null;
    firstFixAt = null;
    place = null;
    _placeAskedAt = null;
    _publish();
  }

  Future<void> signOut() async {
    if (isRunning) await stop();
    await _queue.clear();
    await _store.clear();
    session = null;
    pending = 0;
    _publish();
  }

  /// ───────────────────────── الأذونات ─────────────────────────

  Future<bool> _ensurePermission() async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      error = tr('err.gpsOff');
      needsAttention = true;
      return false;
    }

    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }

    if (permission == LocationPermission.deniedForever) {
      // أندرويد لا يعرض الحوار مرة أخرى — الحل الوحيد إعدادات التطبيق
      error = tr('err.deniedForever');
      needsAttention = true;
      return false;
    }
    if (permission == LocationPermission.denied) {
      error = tr('err.denied');
      needsAttention = true;
      return false;
    }

    // `whileInUse` يكفي للبدء؛ الإشعار الثابت يبقي التتبّع حيًا. طلب
    // «طوال الوقت» مباشرة يجعل أندرويد يرفض دون عرض الحوار أصلًا.
    return true;
  }

  LocationSettings _settings() {
    /* ليست `const`: نصّها يأتي من جدول الترجمة، فيتغيّر مع لغة السائق */
    final notice = ForegroundNotificationConfig(
      notificationTitle: tr('notif.title'),
      notificationText: tr('notif.body'),
      enableWakeLock: true,
      setOngoing: true,
    );

    if (defaultTargetPlatform == TargetPlatform.android) {
      return AndroidSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: Config.distanceFilterMetres,
        foregroundNotificationConfig: notice,
      );
    }
    if (defaultTargetPlatform == TargetPlatform.iOS) {
      return AppleSettings(
        accuracy: LocationAccuracy.high,
        activityType: ActivityType.automotiveNavigation,
        distanceFilter: Config.distanceFilterMetres,
        pauseLocationUpdatesAutomatically: false,
        showBackgroundLocationIndicator: true,
        allowBackgroundLocationUpdates: true,
      );
    }
    return const LocationSettings(
      accuracy: LocationAccuracy.high,
      distanceFilter: Config.distanceFilterMetres,
    );
  }

  /// ───────────────────────── القراءة والإرسال ─────────────────────────

  Future<void> _onPosition(Position p) async {
    firstFixAt ??= DateTime.now();
    lastFix = p;
    error = null;

    await _queue.add({
      'lat': p.latitude,
      'lng': p.longitude,
      // Flutter يعطي السرعة بالمتر/ثانية والسيرفر ينتظر كم/س
      'speed': (p.speed.isNaN ? 0 : p.speed * 3.6).round(),
      'heading': (p.heading.isNaN || p.heading < 0 ? 0 : p.heading).round(),
      'accuracy': p.accuracy.isNaN ? 0 : p.accuracy.round(),
      'at': p.timestamp.toUtc().toIso8601String(),
    });

    pending = _queue.length;
    _publish();

    unawaited(_refreshPlace(p));
  }

  /// كم يتحرّك السائق قبل أن يُسأل عن اسم المكان من جديد.
  ///
  /// مئتا متر كانت تكفي لمعرفة الشارع، لا لمعرفة أين وقف السائق منه: الطرف
  /// الآخر من نفس الشارع يحمل الاسم نفسه. أربعون مترًا تعني المبنى الذي أمامه
  /// لا الحيّ الذي فيه، وتبقى بعيدة بما يكفي عن اهتزاز الـ GPS فلا يتكرّر
  /// السؤال والمركبة واقفة.
  static const double _placeRefreshMetres = 40;

  /// أسوأ دقة يُسمّى عندها مكان (متر).
  ///
  /// اسم الشارع من قراءة خطؤها نصف كيلومتر ليس معلومة، بل تخمين معروض بثقة:
  /// الدائرة التي قد يكون السائق داخلها تضمّ عشرة شوارع، والخدمة تختار أقربها
  /// إلى مركزٍ ليس مكانه. عرض الإحداثيات وحدها أصدق من اسمٍ لا يسنده شيء.
  ///
  /// مئة متر هي الحدّ الذي يميّز قراءة قمر صناعي (خمسة إلى عشرين مترًا في
  /// العادة) من قراءة مشتقّة من شبكات الواي فاي أو عنوان الإنترنت.
  static const double _maxAccuracyForPlace = 100;

  /// القراءة الحالية أخشن من أن تُسمّى — تعرض الشاشة السبب بدل اسم مخمَّن.
  bool get fixIsCoarse {
    final a = lastFix?.accuracy;
    return a != null && !a.isNaN && a > _maxAccuracyForPlace;
  }

  Future<void> _refreshPlace(Position p) async {
    final token = session?.token;
    if (token == null || _askingPlace) return;

    /* قراءة خشنة لا تُسمّى، والاسم القديم يُمسح: تركه معروضًا فوق نقطة جديدة
       غير موثوقة يجعل السائق يقرأ عنوان مكانٍ آخر على أنه مكانه */
    if (!p.accuracy.isNaN && p.accuracy > _maxAccuracyForPlace) {
      if (place != null) {
        place = null;
        _placeAskedAt = null;
        _publish();
      }
      return;
    }

    final last = _placeAskedAt;
    if (last != null) {
      final moved = Geolocator.distanceBetween(
        last.latitude, last.longitude, p.latitude, p.longitude,
      );
      if (moved < _placeRefreshMetres) return;
    }

    _askingPlace = true;
    try {
      final name = await _api.place(p.latitude, p.longitude, token);
      /* لا تمسح اسمًا صالحًا بردٍّ فارغ من محاولة فاشلة */
      if (name != null) {
        place = name;
        _placeAskedAt = p;
        _publish();
      }
    } finally {
      _askingPlace = false;
    }
  }

  Future<void> _flush() async {
    final token = session?.token;
    if (token == null) return;

    final batch = await _queue.readAll();
    if (batch.isEmpty) return;

    try {
      await _api.sendFixes(batch, token);
      await _queue.drop(batch.length);
      pending = _queue.length;
      lastSentAt = DateTime.now();
      error = null;
    } on ApiException catch (e) {
      if (e.isAuthFailure) {
        // انتهت الجلسة: الاستمرار في المحاولة يهدر البطارية بلا فائدة
        error = tr('err.session');
        needsAttention = true;
        await stop();
        await _store.clear();
        session = null;
      } else if (e.status == 409) {
        error = tr('err.noVehicle');
        needsAttention = true;
        await stop();
      } else {
        // شبكة أو خطأ عابر: النقاط باقية في القائمة وتُعاد المحاولة
        error = e.isNetworkFailure ? tr('err.offline') : e.message;
      }
    }
    _publish();
  }

  @override
  void dispose() {
    _stream?.cancel();
    _timer?.cancel();
    super.dispose();
  }
}
