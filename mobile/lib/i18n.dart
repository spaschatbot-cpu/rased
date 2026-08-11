import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// لغة التطبيق.
///
/// التطبيق كُتب بالعربية مثبَّتة في الشيفرة، وهو اختيار صحيح لأسطول سعودي —
/// حتى يأتي سائق لا يقرأها. عندها لا تنفع ترجمة الشاشة وحدها: رسالة الخطأ التي
/// توقف ورديته، والسبب المكتوب تحت الزرّ، هي بالضبط ما يحتاج أن يفهمه.
///
/// المفاتيح نصّ صريح لا ثوابت، لأن الجدول هنا صغير ومقروء: من يقرأ
/// `tr('shift.start')` يعرف ما يقابله دون فتح ملف آخر. ومفتاح مفقود يعيد
/// المفتاح نفسه بدل أن يرمي — شاشة فيها كلمة إنجليزية غريبة أهون على سائق
/// منتصف الوردية من شاشة بيضاء.
class AppLocale {
  AppLocale._();

  static const _key = 'locale';

  /// اللغة الحالية. تستمع إليها [MaterialApp] فتُعاد بناء الشجرة كلها عند
  /// التبديل — بما فيها اتجاه الكتابة.
  static final ValueNotifier<String> current = ValueNotifier<String>('ar');

  static bool get isArabic => current.value == 'ar';

  /// تُقرأ مرة عند الإقلاع. اختيار اللغة يخصّ الجهاز لا الحساب: الهاتف المشترك
  /// بين سائقين قد يُسلَّم لمن لا يقرأ لغة سابقه.
  static Future<void> restore() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString(_key);
    if (saved == 'ar' || saved == 'en') current.value = saved!;
  }

  static Future<void> toggle() async {
    current.value = isArabic ? 'en' : 'ar';
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, current.value);
  }
}

/// نصّ المفتاح باللغة الحالية.
String tr(String key) => (AppLocale.isArabic ? _ar : _en)[key] ?? key;

/// نصّ فيه قيمة متغيّرة — `tr1('fix.coarse', '500')`.
String tr1(String key, Object value) => tr(key).replaceFirst('{}', '$value');

const _ar = <String, String>{
  /* الهوية */
  'app.title': 'مرصاد',
  'app.subtitle': 'تطبيق السائق',
  'app.hello': 'أهلًا',
  'app.vehicle': 'مركبة رقم {}',
  'app.noVehicle': 'لا توجد مركبة مرتبطة',

  /* الشريط العلوي */
  'top.language': 'English',
  'top.notifications': 'التنبيهات',
  'top.signOut': 'تسجيل الخروج',
  'top.signOutBlocked': 'أنهِ الوردية أولًا',

  /* الدخول */
  'login.title': 'تسجيل الدخول',
  'login.welcome': 'مرحبًا بعودتك',
  'login.subtitle': 'سجّل الدخول باستخدام بياناتك للوصول إلى تطبيق السائق.',
  'login.username': 'اسم المستخدم',
  'login.password': 'كلمة المرور',
  'login.show': 'إظهار',
  'login.hide': 'إخفاء',
  'login.remember': 'تذكّرني',
  'login.secure': 'اتصال مشفّر ومحمي',
  'login.liveNow': 'مباشر الآن',
  'login.copyright': '© 2026 مرصاد — جميع الحقوق محفوظة',
  'login.failed': 'اسم المستخدم أو كلمة المرور غير صحيحة',
  'login.driversOnly': 'هذا التطبيق للسائقين فقط',
  'login.noServer': 'تعذّر الاتصال بالخادم — تأكد من الشبكة',
  'login.stat.vehicles': 'مركبة متصلة',
  'login.stat.refresh': 'تحديث الموقع',
  'login.stat.alerts': 'تنبيهات فورية',
  'login.stat.live': 'يعمل الآن في المملكة',

  /* الوردية */
  'shift.start': 'بدء الوردية',
  'shift.end': 'إنهاء الوردية',
  'shift.status': 'الحالة',
  'shift.stopped': 'متوقّف',
  'shift.running': 'الوردية جارية',
  'shift.locating': 'جارٍ تحديد موقعك…',
  'shift.located': 'تم تحديد موقعك',
  'shift.hint': 'اضغط «بدء الوردية» عند انطلاقك، وأنهِها عند عودتك.',
  'shift.hintRunning': 'سيبقى إشعار ثابت طوال الوردية ليواصل التطبيق العمل.',
  'shift.hintLocating': 'أمسك الجهاز في مكان مكشوف لو أمكن. سيبدأ الإرسال تلقائيًا عند '
      'أول قراءة، ولا حاجة لإبقاء الشاشة مفتوحة.',
  'shift.signOutConfirm': 'سيتوقف إرسال الموقع. متأكد؟',
  'shift.cancel': 'إلغاء',
  'shift.waiting': 'بانتظار الإشارة',
  'shift.sending': 'يُرسل موقعك',
  'shift.speed': 'السرعة',
  'shift.lastSent': 'آخر إرسال',
  'shift.queued': 'نقاط في الانتظار',

  /* الإشعار الثابت أثناء الوردية */
  'notif.title': 'مرصاد — الوردية جارية',
  'notif.body': 'يُرسل موقع المركبة أثناء الوردية',

  /* الموقع */
  'loc.yours': 'موقعك الحالي',
  'loc.lat': 'خط العرض',
  'loc.lng': 'خط الطول',
  'loc.speed': 'كم/س',
  'loc.recenter': 'العودة إلى موقعي',
  'loc.expand': 'تكبير الخريطة',
  'loc.coarse': 'الدقة ضعيفة (±{} م) — العنوان يظهر حين يثبت الموقع',
  'loc.metres': 'م',

  /* الأخطاء */
  'err.openSettings': 'فتح إعدادات التطبيق',
  'err.server': 'تعذّر الاتصال بالخادم',
  'err.gpsOff': 'خدمة الموقع مغلقة في الجهاز — فعّلها ثم أعد المحاولة',
  'err.gpsRead': 'تعذّر قراءة الموقع — تأكد من تفعيل GPS',
  'err.deniedForever': 'الإذن مرفوض نهائيًا — افتح إعدادات التطبيق واسمح بالموقع',
  'err.denied': 'لم تسمح بالوصول إلى الموقع',
  'err.session': 'انتهت الجلسة — سجّل الدخول من جديد',
  'err.noVehicle': 'لا توجد مركبة مرتبطة بحسابك — راجع الإدارة',
  'err.offline': 'لا يوجد اتصال — سنعيد المحاولة',

  /* التنبيهات */
  'alerts.title': 'التنبيهات',
  'alerts.empty': 'لا توجد تنبيهات على مركبتك',
  'alerts.emptyHint': 'يظهر هنا ما ترصده الإدارة على مركبتك أثناء الوردية.',
  'alerts.markAllRead': 'تعليم الكل كمقروء',
  'alerts.offline': 'تعذّر تحديث التنبيهات',
  'alert.speed': 'تجاوز السرعة',
  'alert.geofenceIn': 'دخول منطقة',
  'alert.geofenceOut': 'خروج من منطقة',
  'alert.ignitionOn': 'بدء الحركة',
  'alert.ignitionOff': 'توقّف',
  'alert.idle': 'توقّف طويل',
  'alert.lowBattery': 'بطارية منخفضة',
  'alert.power': 'انقطاع الطاقة',
  'alert.sos': 'استغاثة',
  'alert.maintenance': 'صيانة مستحقة',

  /* التبويبات */
  'tab.home': 'الرئيسية',
  'tab.shifts': 'الورديات',
  'tab.profile': 'الملف الشخصي',

  /* الورديات */
  'shifts.title': 'ورديّاتي',
  'shifts.empty': 'لا توجد ورديات بعد',
  'shifts.emptyHint': 'تُسجَّل الوردية تلقائيًا من أول نقطة يرسلها التطبيق.',
  'shifts.offline': 'تعذّر تحديث الورديات',
  'shifts.running': 'جارية الآن',
  'shifts.from': 'بدأت',
  'shifts.to': 'انتهت',
  'shifts.duration': 'المدة',
  'shifts.maxSpeed': 'أقصى سرعة',
  'shifts.cutOff': 'أُغلقت تلقائيًا لانقطاع الإرسال',
  'shifts.totalToday': 'اليوم',
  'shifts.totalWeek': 'هذا الأسبوع',
  'shifts.hoursShort': 'س',
  'shifts.minutesShort': 'د',

  /* الملف الشخصي */
  'profile.title': 'الملف الشخصي',
  'profile.role': 'الصفة',
  'profile.role.driver': 'سائق',
  'profile.username': 'اسم المستخدم',
  'profile.vehicle': 'المركبة',
  'profile.language': 'اللغة',
  'profile.about': 'عن التطبيق',
  'profile.version': 'الإصدار',
  'profile.support': 'الدعم الفني متاح من داخل التطبيق طوال الوردية.',
  'profile.support.title': 'الدعم الفني',
  'profile.support.open': 'فتح المحادثة',
  'profile.support.unread': '{} ردّ جديد',

  /* الدعم الفني */
  'support.title': 'الدعم الفني',
  'support.with': 'محادثة مع إدارة الأسطول',
  'support.me': 'أنت',
  'support.staff': 'إدارة الأسطول',
  'support.hint': 'اكتب رسالتك…',
  'support.empty': 'ابدأ المحادثة',
  'support.emptyHint': 'اكتب ما تحتاجه — عطل في المركبة، مشكلة في التطبيق، أو أي '
      'أمر يخصّ وردّيتك — وستصل رسالتك إلى إدارة الأسطول مباشرةً.',
  'support.offline': 'تعذّر تحديث المحادثة',
  'support.pending': 'قيد الإرسال',
  'support.retry': 'إعادة المحاولة',

  /* الوقت */
  'time.now': 'الآن',
  'time.minutes': 'منذ {} دقيقة',
  'time.hours': 'منذ {} ساعة',
  'time.days': 'منذ {} يوم',
};

const _en = <String, String>{
  'app.title': 'Mirsad',
  'app.subtitle': 'Driver app',
  'app.hello': 'Hello',
  'app.vehicle': 'Vehicle no. {}',
  'app.noVehicle': 'No vehicle assigned',

  'top.language': 'العربية',
  'top.notifications': 'Alerts',
  'top.signOut': 'Sign out',
  'top.signOutBlocked': 'End your shift first',

  'login.title': 'Sign in',
  'login.welcome': 'Welcome back',
  'login.subtitle': 'Sign in with your credentials to reach the driver app.',
  'login.username': 'Username',
  'login.password': 'Password',
  'login.show': 'Show',
  'login.hide': 'Hide',
  'login.remember': 'Remember me',
  'login.secure': 'Encrypted, protected connection',
  'login.liveNow': 'Live now',
  'login.copyright': '© 2026 Mirsad — all rights reserved',
  'login.failed': 'Wrong username or password',
  'login.driversOnly': 'This app is for drivers only',
  'login.noServer': 'Could not reach the server — check your connection',
  'login.stat.vehicles': 'vehicles connected',
  'login.stat.refresh': 'location refresh',
  'login.stat.alerts': 'Instant alerts',
  'login.stat.live': 'running now across the Kingdom',

  'shift.start': 'Start shift',
  'shift.end': 'End shift',
  'shift.status': 'Status',
  'shift.stopped': 'Stopped',
  'shift.running': 'Shift running',
  'shift.locating': 'Finding your location…',
  'shift.located': 'Location found',
  'shift.hint': 'Tap “Start shift” when you set off, and end it when you return.',
  'shift.hintRunning': 'A persistent notification stays up so the app keeps running.',
  'shift.hintLocating': 'Hold the device somewhere with a clear view of the sky if you can. '
      'Sending starts on the first fix — the screen does not need to stay on.',
  'shift.signOutConfirm': 'Location sending will stop. Are you sure?',
  'shift.cancel': 'Cancel',
  'shift.waiting': 'Waiting for a signal',
  'shift.sending': 'Sending your location',
  'shift.speed': 'Speed',
  'shift.lastSent': 'Last sent',
  'shift.queued': 'points queued',

  'notif.title': 'Mirsad — shift running',
  'notif.body': 'Sending the vehicle location during the shift',

  'loc.yours': 'Your location',
  'loc.lat': 'Latitude',
  'loc.lng': 'Longitude',
  'loc.speed': 'km/h',
  'loc.recenter': 'Back to my location',
  'loc.expand': 'Expand map',
  'loc.coarse': 'Weak accuracy (±{} m) — the address appears once the fix settles',
  'loc.metres': 'm',

  'err.openSettings': 'Open app settings',
  'err.server': 'Could not reach the server',
  'err.gpsOff': 'Location services are off — turn them on and try again',
  'err.gpsRead': 'Could not read your location — check that GPS is on',
  'err.deniedForever': 'Permission permanently denied — allow location in app settings',
  'err.denied': 'You did not allow access to your location',
  'err.session': 'Session expired — sign in again',
  'err.noVehicle': 'No vehicle is linked to your account — contact the office',
  'err.offline': 'No connection — we will retry',

  'alerts.title': 'Alerts',
  'alerts.empty': 'No alerts on your vehicle',
  'alerts.emptyHint': 'Anything the office flags on your vehicle during a shift shows up here.',
  'alerts.markAllRead': 'Mark all as read',
  'alerts.offline': 'Could not refresh alerts',
  'alert.speed': 'Speeding',
  'alert.geofenceIn': 'Entered a zone',
  'alert.geofenceOut': 'Left a zone',
  'alert.ignitionOn': 'Started moving',
  'alert.ignitionOff': 'Stopped',
  'alert.idle': 'Long idle',
  'alert.lowBattery': 'Low battery',
  'alert.power': 'Power lost',
  'alert.sos': 'SOS',
  'alert.maintenance': 'Maintenance due',

  'tab.home': 'Home',
  'tab.shifts': 'Shifts',
  'tab.profile': 'Profile',

  'shifts.title': 'My shifts',
  'shifts.empty': 'No shifts yet',
  'shifts.emptyHint': 'A shift is recorded automatically from the first point the app sends.',
  'shifts.offline': 'Could not refresh shifts',
  'shifts.running': 'Running now',
  'shifts.from': 'Started',
  'shifts.to': 'Ended',
  'shifts.duration': 'Duration',
  'shifts.maxSpeed': 'Top speed',
  'shifts.cutOff': 'Closed automatically — reporting stopped',
  'shifts.totalToday': 'Today',
  'shifts.totalWeek': 'This week',
  'shifts.hoursShort': 'h',
  'shifts.minutesShort': 'm',

  'profile.title': 'Profile',
  'profile.role': 'Role',
  'profile.role.driver': 'Driver',
  'profile.username': 'Username',
  'profile.vehicle': 'Vehicle',
  'profile.language': 'Language',
  'profile.about': 'About',
  'profile.version': 'Version',
  'profile.support': 'Support is available in the app throughout your shift.',
  'profile.support.title': 'Support',
  'profile.support.open': 'Open chat',
  'profile.support.unread': '{} new reply',

  'support.title': 'Support',
  'support.with': 'Chat with fleet operations',
  'support.me': 'You',
  'support.staff': 'Fleet operations',
  'support.hint': 'Write your message…',
  'support.empty': 'Start the conversation',
  'support.emptyHint': 'Tell us what you need — a fault on the vehicle, a problem with '
      'the app, or anything about your shift — and it goes straight to fleet operations.',
  'support.offline': 'Could not refresh the conversation',
  'support.pending': 'Sending',
  'support.retry': 'Try again',

  'time.now': 'just now',
  'time.minutes': '{} min ago',
  'time.hours': '{} h ago',
  'time.days': '{} d ago',
};
