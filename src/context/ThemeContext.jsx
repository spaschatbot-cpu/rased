import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

const ThemeContext = createContext(null)
const STORAGE_KEY = 'mirsad.theme'

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return 'dark'
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'dark' || saved === 'light') return saved
    return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  })

  /* A route may pin the theme while it is mounted (the landing page is
     dark-only). The user's own preference stays untouched underneath. */
  const [forced, setForced] = useState(null)
  const active = forced ?? theme

  useEffect(() => {
    document.documentElement.classList.toggle('dark', active === 'dark')
  }, [active])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  const toggleTheme = useCallback(() => setTheme((v) => (v === 'dark' ? 'light' : 'dark')), [])

  const value = useMemo(
    () => ({ theme: active, preference: theme, setTheme, toggleTheme, setForced, isDark: active === 'dark' }),
    [active, theme, toggleTheme],
  )
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}

/** Pin the theme for as long as the calling component is mounted. */
export function useForcedTheme(mode) {
  const { setForced } = useTheme()
  useEffect(() => {
    setForced(mode)
    return () => setForced(null)
  }, [mode, setForced])
}
