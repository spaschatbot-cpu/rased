/**
 * Server refusals, in the reader's language.
 *
 * The API answers in English — it serves the dashboard, the driver app and
 * anything else that speaks to it, so it has no view on who is reading. The
 * dashboard does: an Arabic screen that reports "username is already taken"
 * has told the user roughly as much as an empty box would.
 *
 * Matching on the message text is the trade for keeping error strings out of
 * every endpoint. It stays honest because the fallback is the server's own
 * words: a message added or reworded server-side shows through untranslated
 * rather than turning into a missing key, so nothing silently disappears.
 */

/** Exact server message → translation key. */
const EXACT = {
  /* accounts */
  'username is required': 'err.usernameRequired',
  'username may use letters, digits, . _ - @ only': 'err.usernameChars',
  'username is already taken': 'err.usernameTaken',
  'a name is required': 'err.nameRequired',
  'invalid email': 'err.emailInvalid',
  'user not found': 'err.userNotFound',
  'you cannot delete your own account': 'err.deleteSelf',
  'you cannot revoke your own management access': 'err.revokeSelfManage',
  'only a super-admin can create a super-admin': 'err.superadminOnly',
  'only a super-admin can manage a super-admin': 'err.superadminOnly',
  'only a super-admin can delete a super-admin': 'err.superadminOnly',
  'a super-admin account is edited from its own profile only': 'err.superadminReadOnly',
  'a super-admin account cannot be deleted': 'err.superadminUndeletable',
  'current password is wrong': 'err.currentPasswordWrong',

  /* vehicles */
  'plate is required': 'err.plateRequired',
  'plate is already registered': 'err.plateTaken',
  'IMEI must be 10 to 20 digits': 'err.imeiDigits',
  'IMEI is already registered to another vehicle': 'err.imeiTaken',
  'a model is required': 'err.modelRequired',
  'SIM number must be digits': 'err.simDigits',
  'invalid SIM expiry date': 'err.simExpiryInvalid',

  /* branches */
  'a branch name is required': 'err.branchNameRequired',
  'a branch with this name already exists': 'err.branchNameTaken',

  /* maintenance */
  'a vehicle is required': 'err.vehicleRequired',
  'a maintenance name is required': 'err.maintNameRequired',
  'period must be a positive number': 'err.periodPositive',
  'invalid start reading': 'err.startInvalid',

  /* generic */
  'not allowed for this role': 'err.forbidden',
  'sign in required': 'err.signInRequired',
  'not found': 'err.notFound',
  'id is required': 'err.idRequired',
  'network unreachable': 'err.network',
  'invalid JSON body': 'err.badRequest',
  'payload too large': 'err.tooLarge',
}

/** Messages that carry a number or a list, matched on their stable opening. */
const PREFIXES = [
  ['password must be at least', 'err.passwordShort'],
  ['role must be one of', 'err.roleInvalid'],
  ['branch still has', 'err.branchInUse'],
]

/**
 * @param message the `ApiError` message, i.e. whatever the server sent
 * @param t       the active translator
 * @returns a localized sentence, or the server's own message if unmapped
 */
export function apiErrorText(message, t) {
  const raw = String(message ?? '').trim()
  if (!raw) return t('err.unknown', 'Something went wrong')

  const exact = EXACT[raw]
  if (exact) return t(exact, raw)

  const prefixed = PREFIXES.find(([start]) => raw.startsWith(start))
  return prefixed ? t(prefixed[1], raw) : raw
}
