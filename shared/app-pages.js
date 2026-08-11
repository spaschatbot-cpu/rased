/**
 * The dashboard's pages, and who may open them.
 *
 * Shared by the browser and the server on purpose. The Management screen grants
 * access, the router enforces it and the API validates what was granted — three
 * places that must agree on the same six keys, so they read them from one file
 * rather than from three copies that drift apart.
 *
 * A grant is page-level only. It decides what a signed-in employee can *open*;
 * what they may *write* is still the role check on each endpoint, because a
 * permissions table that could hand out write access would be a second, weaker
 * authority over the same question.
 */

/** Every page a grant can name. Order is the order shown in the UI. */
export const APP_PAGES = ['dashboard', 'map', 'history', 'reports', 'alerts', 'manage']

/**
 * Where a role starts before anyone edits it.
 *
 * A driver is on this list even though drivers sign into the phone app, not the
 * dashboard: an account's role can be changed, and a default of "nothing" would
 * make a promoted driver look broken rather than new.
 */
export const ROLE_PAGES = {
  superadmin: APP_PAGES,
  admin: APP_PAGES,
  manager: ['dashboard', 'map', 'history', 'reports', 'alerts', 'manage'],
  viewer: ['dashboard', 'map', 'reports'],
  driver: ['dashboard', 'map'],
}

/** Keep only real page keys, in the canonical order, with no duplicates. */
export const cleanPages = (list) =>
  Array.isArray(list) ? APP_PAGES.filter((page) => list.includes(page)) : null

/**
 * The pages this account may open.
 *
 * `pages: null` on the record means "whatever the role says" — the common case,
 * and the one that keeps following the role when it changes. Only an account
 * someone edited by hand carries an explicit list.
 *
 * A super-admin is never limited: they are the account that hands out the
 * grants, and locking them out of Management would leave nobody who could.
 */
export function pagesFor(user) {
  if (!user) return []
  if (user.role === 'superadmin') return [...APP_PAGES]
  return cleanPages(user.pages) ?? ROLE_PAGES[user.role] ?? []
}
