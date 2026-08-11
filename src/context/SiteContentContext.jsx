import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { LANDING_SECTIONS, SECTION_IDS } from '../../shared/landing-sections'
import { api } from '../lib/api'

/**
 * Everything the super-admin can change about the public landing page:
 * per-language text overrides, which sections are shown, and their order.
 *
 * The server owns this document — that is what makes an edit visible to every
 * visitor rather than just the browser that made it. localStorage is kept only
 * as a read cache so a returning visitor paints the last known content
 * immediately instead of flashing the shipped copy first.
 */
const SiteContentContext = createContext(null)
const CACHE_KEY = 'mirsad.site'
const SAVE_DELAY = 700

export { LANDING_SECTIONS }

const EMPTY = { text: { ar: {}, en: {} }, hidden: [], order: [...SECTION_IDS] }

/** Merge any blob with the defaults so a stale payload can't break the site. */
function normalise(raw) {
  if (!raw || typeof raw !== 'object') return EMPTY
  const order = Array.isArray(raw.order) ? raw.order.filter((id) => SECTION_IDS.includes(id)) : []
  return {
    text: {
      ar: { ...(raw.text?.ar || {}) },
      en: { ...(raw.text?.en || {}) },
    },
    hidden: Array.isArray(raw.hidden) ? raw.hidden.filter((id) => SECTION_IDS.includes(id)) : [],
    order: [...order, ...SECTION_IDS.filter((id) => !order.includes(id))],
  }
}

function readCache() {
  if (typeof window === 'undefined') return EMPTY
  try {
    return normalise(JSON.parse(localStorage.getItem(CACHE_KEY)))
  } catch {
    return EMPTY
  }
}

export function SiteContentProvider({ children }) {
  const [config, setConfig] = useState(readCache)
  const [loading, setLoading] = useState(true)
  /* 'idle' until the admin touches something, then the save's own progress */
  const [saveState, setSaveState] = useState('idle')

  /* the timer, the value it will send, and a mirror of the current config —
     all kept out of render so an edit never depends on a stale closure */
  const timer = useRef(null)
  const pending = useRef(null)
  const latest = useRef(config)
  latest.current = config

  /* ── load the live document ─────────────────────────────────── */
  useEffect(() => {
    const ctrl = new AbortController()
    api
      .getSite(ctrl.signal)
      .then(({ site }) => {
        const fresh = normalise(site)
        setConfig(fresh)
        localStorage.setItem(CACHE_KEY, JSON.stringify(fresh))
      })
      .catch((err) => {
        /* offline or backend down: the cached copy above stays on screen */
        if (err.name !== 'AbortError') console.warn('[site] falling back to cache:', err.message)
      })
      .finally(() => setLoading(false))
    return () => ctrl.abort()
  }, [])

  /* ── push edits to the server ───────────────────────────────── */
  const flush = useCallback(async () => {
    timer.current = null
    const payload = pending.current
    if (!payload) return
    pending.current = null

    setSaveState('saving')
    try {
      await api.saveSite(payload)
      localStorage.setItem(CACHE_KEY, JSON.stringify(payload))
      setSaveState('saved')
    } catch (err) {
      console.error('[site] save failed:', err.message)
      setSaveState(err.status === 401 || err.status === 403 ? 'denied' : 'error')
    }
  }, [])

  /** Apply an edit locally, then schedule one write for the burst of them. */
  const edit = useCallback(
    (mutate) => {
      const next = mutate(latest.current)
      if (next === latest.current) return

      latest.current = next
      setConfig(next)

      pending.current = next
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(flush, SAVE_DELAY)
    },
    [flush],
  )

  /* don't lose the last keystrokes if the tab closes mid-debounce */
  useEffect(() => {
    const onHide = () => {
      if (!timer.current) return
      clearTimeout(timer.current)
      flush()
    }
    window.addEventListener('pagehide', onHide)
    return () => {
      window.removeEventListener('pagehide', onHide)
      onHide()
    }
  }, [flush])

  const setText = useCallback(
    (lang, key, value) => {
      edit((c) => ({ ...c, text: { ...c.text, [lang]: { ...c.text[lang], [key]: value } } }))
    },
    [edit],
  )

  /** Drop the override for one key in both languages — back to the shipped copy. */
  const clearText = useCallback(
    (key) => {
      edit((c) => {
        const ar = { ...c.text.ar }
        const en = { ...c.text.en }
        delete ar[key]
        delete en[key]
        return { ...c, text: { ar, en } }
      })
    },
    [edit],
  )

  const toggleSection = useCallback(
    (id) => {
      edit((c) => ({
        ...c,
        hidden: c.hidden.includes(id) ? c.hidden.filter((x) => x !== id) : [...c.hidden, id],
      }))
    },
    [edit],
  )

  const moveSection = useCallback(
    (id, dir) => {
      edit((c) => {
        const order = [...c.order]
        const i = order.indexOf(id)
        const j = i + dir
        if (i < 0 || j < 0 || j >= order.length) return c
        ;[order[i], order[j]] = [order[j], order[i]]
        return { ...c, order }
      })
    },
    [edit],
  )

  const resetAll = useCallback(() => edit(() => structuredClone(EMPTY)), [edit])
  const importConfig = useCallback((raw) => edit(() => normalise(raw)), [edit])

  const value = useMemo(() => {
    const visible = config.order.filter((id) => !config.hidden.includes(id))
    return {
      config,
      text: config.text,
      order: config.order,
      hidden: config.hidden,
      visibleSections: visible,
      isVisible: (id) => !config.hidden.includes(id),
      editedCount: Object.keys(config.text.ar).length + Object.keys(config.text.en).length,
      loading,
      saveState,
      setText,
      clearText,
      toggleSection,
      moveSection,
      resetAll,
      importConfig,
    }
  }, [config, loading, saveState, setText, clearText, toggleSection, moveSection, resetAll, importConfig])

  return <SiteContentContext.Provider value={value}>{children}</SiteContentContext.Provider>
}

export function useSite() {
  const ctx = useContext(SiteContentContext)
  if (!ctx) throw new Error('useSite must be used inside <SiteContentProvider>')
  return ctx
}
