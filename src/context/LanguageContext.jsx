import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import { translations } from '../i18n/translations'
import { useSite } from './SiteContentContext'
import { FLEET_TZ } from '../../shared/clock'

const LanguageContext = createContext(null)
const STORAGE_KEY = 'mirsad.lang'

export function LanguageProvider({ children }) {
  /* super-admin edits live here; they take priority over the bundled strings */
  const { text: overrides } = useSite()

  const [lang, setLang] = useState(() => {
    if (typeof window === 'undefined') return 'ar'
    return localStorage.getItem(STORAGE_KEY) || 'ar'
  })

  const dir = lang === 'ar' ? 'rtl' : 'ltr'

  useEffect(() => {
    const root = document.documentElement
    root.lang = lang
    root.dir = dir
    localStorage.setItem(STORAGE_KEY, lang)
  }, [lang, dir])

  const t = useCallback(
    (key, fallback) => {
      const edited = overrides?.[lang]?.[key]
      if (typeof edited === 'string' && edited.trim() !== '') return edited
      return translations[lang]?.[key] ?? translations.ar?.[key] ?? fallback ?? key
    },
    [lang, overrides],
  )

  const toggleLang = useCallback(() => setLang((l) => (l === 'ar' ? 'en' : 'ar')), [])

  /** Locale-aware number formatting (always Latin digits for readability in dashboards). */
  const nf = useCallback(
    (value, opts) => new Intl.NumberFormat(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US', opts).format(value ?? 0),
    [lang],
  )

  /* Always the fleet's clock, never the viewer's. A manager checking the fleet
     from another country must read the same times the driver did — otherwise
     the same shift has two start times depending on who opened the screen. */
  const formatDateTime = useCallback(
    (value, opts = { dateStyle: 'medium', timeStyle: 'short' }) => {
      const d = value instanceof Date ? value : new Date(value)
      if (Number.isNaN(d.getTime())) return '—'
      return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB', {
        timeZone: FLEET_TZ,
        ...opts,
      }).format(d)
    },
    [lang],
  )

  const formatTime = useCallback(
    (value) => formatDateTime(value, { hour: '2-digit', minute: '2-digit' }),
    [formatDateTime],
  )

  const value = useMemo(
    () => ({ lang, dir, isRTL: dir === 'rtl', setLang, toggleLang, t, nf, formatDateTime, formatTime }),
    [lang, dir, toggleLang, t, nf, formatDateTime, formatTime],
  )

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLang() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLang must be used inside <LanguageProvider>')
  return ctx
}
