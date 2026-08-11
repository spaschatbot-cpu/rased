/**
 * Shape and validation for the stored site configuration.
 *
 * The browser sends whatever its editor produced; nothing here trusts it. A
 * stale, partial or hostile payload is narrowed down to a known-good document
 * rather than rejected, so one bad field can never take the landing page down.
 */
import { SECTION_IDS } from '../../shared/landing-sections.js'
import { translations } from '../../src/i18n/translations.js'

/** Only keys the site actually renders may be overridden. */
const KNOWN_KEYS = new Set(Object.keys(translations.ar))
const MAX_LEN = 4000

export const EMPTY = { text: { ar: {}, en: {} }, hidden: [], order: [...SECTION_IDS] }

function cleanText(raw) {
  const out = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [key, value] of Object.entries(raw)) {
    if (!KNOWN_KEYS.has(key)) continue
    if (typeof value !== 'string') continue
    /* an empty override means "back to the shipped copy" — don't store it */
    if (value.trim() === '') continue
    out[key] = value.slice(0, MAX_LEN)
  }
  return out
}

export function normalise(raw) {
  if (!raw || typeof raw !== 'object') return structuredClone(EMPTY)

  const order = Array.isArray(raw.order) ? raw.order.filter((id) => SECTION_IDS.includes(id)) : []
  const deduped = [...new Set(order)]

  return {
    text: {
      ar: cleanText(raw.text?.ar),
      en: cleanText(raw.text?.en),
    },
    hidden: Array.isArray(raw.hidden)
      ? [...new Set(raw.hidden.filter((id) => SECTION_IDS.includes(id)))]
      : [],
    /* any id the payload forgot is appended, so the page always renders in full */
    order: [...deduped, ...SECTION_IDS.filter((id) => !deduped.includes(id))],
  }
}
