/**
 * The landing page's sections, in their shipped order.
 *
 * Shared by the browser and the API on purpose: the server validates incoming
 * layouts against this list, so the two can never drift into disagreeing about
 * what a valid section id is.
 *
 * `nav` marks the sections the header links to.
 */
export const LANDING_SECTIONS = [
  { id: 'hero', nav: false, locked: true },
  { id: 'features', nav: true },
  { id: 'solutions', nav: true },
  { id: 'how', nav: true },
  { id: 'pricing', nav: true },
  { id: 'apps', nav: true },
  { id: 'faq', nav: true },
  { id: 'contact', nav: true },
  { id: 'cta', nav: false },
]

export const SECTION_IDS = LANDING_SECTIONS.map((s) => s.id)
