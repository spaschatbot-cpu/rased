import { useLang } from '../context/LanguageContext'

/*
 * The privacy policy the App Store and Google Play listings link to.
 *
 * It describes what the driver app and the dashboard actually do -- every line
 * below maps to something in mobile/lib or api/: the location points a shift
 * sends, the photo a repair request carries, the account fields the Management
 * screen holds. When the app starts collecting something new, this page changes
 * in the same commit, or the store listings stop being true.
 */

const CONTACT = 'afnan@spas.sa'
const UPDATED = { ar: '١٧ نوفمبر ٢٠٢٦', en: 'November 17, 2026' }

const CONTENT = {
  ar: {
    title: 'سياسة الخصوصية',
    intro:
      'توضح هذه السياسة كيف تجمع منصة أوتو تراك وتطبيقها للجوال البيانات وتستخدمها وتحميها. تُدار المنصة من قِبل ESTABLISHMENT HALOUL BERMJAH AL-DHAKIA FOR DESIGNING، وهي تُقدَّم للشركات لإدارة أساطيلها، ولا يُنشأ فيها حساب إلا من قِبل مسؤول الشركة.',
    sections: [
      {
        h: 'البيانات التي نجمعها',
        items: [
          'بيانات الحساب: الاسم، اسم المستخدم، البريد الإلكتروني، ورقم الجوال إن أُدخل. يُدخلها مسؤول الشركة عند إنشاء الحساب.',
          'الموقع الجغرافي الدقيق: يرسل التطبيق موقع المركبة أثناء الوردية فقط، بما في ذلك حين يكون التطبيق في الخلفية أو الشاشة مقفلة، لأن تتبّع المركبة هو الغرض من التطبيق. يتوقف الإرسال عند إنهاء الوردية.',
          'الصور: عند تقديم طلب صيانة يمكنك التقاط صورة للعطل أو اختيارها من المعرض. لا يصل التطبيق إلى أي صورة لم تخترها.',
          'الرسائل: ما تكتبه في محادثة الدعم وطلبات الصيانة.',
          'بيانات التشغيل: الرحلات والتنبيهات والتقارير المستخرجة من مواقع المركبات.',
        ],
      },
      {
        h: 'كيف نستخدمها',
        items: [
          'عرض موقع المركبات ومساراتها لمسؤولي شركتك، وإصدار التقارير والتنبيهات.',
          'تسجيل الدخول والحفاظ على أمان الحساب.',
          'متابعة طلبات الصيانة والرد على رسائل الدعم.',
        ],
      },
      {
        h: 'ما لا نفعله',
        items: [
          'لا نبيع بياناتك ولا نشاركها مع معلنين.',
          'لا نستخدم أدوات تتبّع إعلاني ولا تحليلات من أطراف ثالثة داخل التطبيق.',
          'لا نتتبّع موقعك خارج الوردية.',
        ],
      },
      {
        h: 'من يرى البيانات',
        items: [
          'مسؤولو شركتك الذين منحتهم الشركة صلاحية الاطلاع.',
          'مزوّدو الاستضافة والتخزين الذين نعتمد عليهم لتشغيل الخدمة، وفقط لهذا الغرض.',
          'خرائط التطبيق تُحمَّل من OpenStreetMap، فيصل إليها عنوان IP لجهازك عند عرض الخريطة.',
          'الجهات الرسمية إذا ألزمنا القانون بذلك.',
        ],
      },
      {
        h: 'الحماية والاحتفاظ',
        items: [
          'تُنقل البيانات عبر اتصال مشفّر (HTTPS)، وتُخزَّن كلمات المرور مُجزّأة ولا يمكن قراءتها.',
          'نحتفظ بالبيانات ما دام حساب شركتك قائمًا، وتُحذف عند إنهاء الخدمة أو بطلب من الشركة.',
        ],
      },
      {
        h: 'حقوقك',
        items: [
          'يمكنك طلب الاطلاع على بياناتك أو تصحيحها أو حذف حسابك عبر مسؤول شركتك أو بمراسلتنا مباشرة.',
          'يمكنك إيقاف إذن الموقع من إعدادات الجوال في أي وقت، ولن يعمل التتبّع حينها.',
        ],
      },
    ],
    contactH: 'التواصل',
    contact: 'لأي استفسار عن الخصوصية راسلنا على',
    updated: 'آخر تحديث',
  },
  en: {
    title: 'Privacy Policy',
    intro:
      'This policy explains how the AutoTrack platform and its mobile app collect, use and protect data. AutoTrack is operated by ESTABLISHMENT HALOUL BERMJAH AL-DHAKIA FOR DESIGNING and is provided to companies to manage their fleets. Accounts are only created by a company administrator.',
    sections: [
      {
        h: 'Data we collect',
        items: [
          'Account details: name, username, email and, if entered, phone number. Your company administrator enters these when creating the account.',
          'Precise location: the app sends the vehicle location during a shift only, including while the app is in the background or the screen is locked, because tracking the vehicle is what the app is for. Sending stops when the shift ends.',
          'Photos: when you file a repair request you can take a photo of the fault or pick one from your library. The app does not access any photo you do not choose.',
          'Messages: what you write in support chat and repair requests.',
          'Operational data: trips, alerts and reports derived from vehicle locations.',
        ],
      },
      {
        h: 'How we use it',
        items: [
          'To show vehicle locations and routes to your company administrators, and to produce reports and alerts.',
          'To sign you in and keep your account secure.',
          'To handle repair requests and answer support messages.',
        ],
      },
      {
        h: 'What we do not do',
        items: [
          'We do not sell your data or share it with advertisers.',
          'We do not use advertising trackers or third-party analytics in the app.',
          'We do not track your location outside a shift.',
        ],
      },
      {
        h: 'Who sees the data',
        items: [
          'Administrators at your company who were given access.',
          'The hosting and storage providers that run the service, for that purpose only.',
          'Map tiles in the app are loaded from OpenStreetMap, which receives your device IP address when a map is shown.',
          'Authorities, where the law requires us to disclose it.',
        ],
      },
      {
        h: 'Security and retention',
        items: [
          'Data travels over an encrypted connection (HTTPS), and passwords are stored hashed and cannot be read.',
          'We keep data while your company account is active, and delete it when the service ends or at the company’s request.',
        ],
      },
      {
        h: 'Your rights',
        items: [
          'You can ask to see or correct your data, or to delete your account, through your company administrator or by writing to us directly.',
          'You can turn off location permission in your phone settings at any time; tracking will not work while it is off.',
        ],
      },
    ],
    contactH: 'Contact',
    contact: 'For any privacy question, write to',
    updated: 'Last updated',
  },
}

export default function Privacy() {
  const { lang } = useLang()
  const c = CONTENT[lang] ?? CONTENT.ar

  return (
    <section className="mx-auto max-w-3xl px-4 pb-20 pt-32 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{c.title}</h1>
      <p className="mt-2 text-sm text-muted">
        {c.updated}: {UPDATED[lang] ?? UPDATED.ar}
      </p>
      <p className="mt-6 leading-8">{c.intro}</p>

      {c.sections.map((s) => (
        <div key={s.h} className="mt-10">
          <h2 className="text-xl font-bold">{s.h}</h2>
          <ul className="mt-3 list-disc space-y-2 ps-6 leading-8 text-muted">
            {s.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ))}

      <div className="mt-10 rounded-2xl border border-[var(--s-border)] p-5">
        <h2 className="text-xl font-bold">{c.contactH}</h2>
        <p className="mt-2 leading-8 text-muted">
          {c.contact}{' '}
          <a href={`mailto:${CONTACT}`} className="font-bold text-brand-500 hover:underline" dir="ltr">
            {CONTACT}
          </a>
        </p>
      </div>
    </section>
  )
}
