import { MapPinOff } from 'lucide-react'
import { useLang } from '../context/LanguageContext'
import { Button } from '../components/ui'

export default function NotFound() {
  const { t, lang } = useLang()
  return (
    <div className="grid min-h-screen place-items-center px-4 text-center">
      <div>
        <span className="mx-auto grid size-20 place-items-center rounded-3xl bg-brand-500/12 text-brand-500">
          <MapPinOff size={34} />
        </span>
        <h1 className="mt-6 text-6xl font-extrabold tracking-tight">404</h1>
        <p className="mt-3 text-muted">
          {lang === 'ar' ? 'الصفحة التي تبحث عنها غير موجودة.' : 'The page you are looking for does not exist.'}
        </p>
        <Button to="/" className="mt-8">
          {t('nav.home')}
        </Button>
      </div>
    </div>
  )
}
