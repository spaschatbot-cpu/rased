import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { pagesFor } from '../../shared/app-pages'

const AuthContext = createContext(null)

/**
 * Sessions live in an HttpOnly cookie set by the API. Nothing about an account
 * — least of all a password — is stored in this bundle or in localStorage; the
 * browser only ever learns the profile the server chooses to hand back.
 */

/** Prefill for the demo account. Public by design: the README documents it. */
export const DEMO_CREDENTIALS = { username: '7034710512', password: '7034710512' }

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  /* true until the cookie has been checked, so guards don't bounce a signed-in
     admin to /login during the first paint */
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const ctrl = new AbortController()
    api
      .me(ctrl.signal)
      .then(({ user: me }) => setUser(me))
      .catch((err) => {
        if (err.name !== 'AbortError') console.warn('[auth] session check failed:', err.message)
      })
      .finally(() => setLoading(false))
    return () => ctrl.abort()
  }, [])

  const login = useCallback(async (username, password) => {
    try {
      const { user: me } = await api.login(username, password)
      setUser(me)
      return { ok: true, role: me.role }
    } catch (err) {
      if (err.status === 0) return { ok: false, error: 'network' }
      /* a real account on the wrong door — saying so beats "wrong password",
         which would send a driver hunting for a typo that is not there */
      if (err.code === 'driver_app_only') return { ok: false, error: 'driverApp' }
      return { ok: false, error: 'credentials' }
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.logout()
    } catch (err) {
      console.warn('[auth] logout request failed:', err.message)
    }
    setUser(null)
  }, [])

  /** Save your own profile, and keep the header in step with the new name. */
  const saveProfile = useCallback(async (profile) => {
    const { user: me } = await api.saveMe(profile)
    setUser(me)
    return me
  }, [])

  /* the pages this account may open. `user.pages` is what the Management screen
     granted; a null there means "follow the role", which is the common case */
  const pages = useMemo(() => pagesFor(user), [user])
  const can = useCallback((page) => pages.includes(page), [pages])

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthed: Boolean(user),
      isAdmin: user?.role === 'superadmin',
      pages,
      can,
      login,
      logout,
      saveProfile,
    }),
    [user, loading, pages, can, login, logout, saveProfile],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
