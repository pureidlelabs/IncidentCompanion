/**
 * Which tier applies to which request.
 */

/** Where Better Auth's credential routes are mounted. */
const AUTH_PREFIX = '/api/auth'

/**
 * The paths the strict tier is for: the ones where a wrong answer is a guess.
 */
const GUESSABLE = ['/sign-in', '/sign-up', '/reset-password', '/forget-password', '/change-password']

export function isCredentialAttempt(path: string): boolean {
  if (!path.startsWith(AUTH_PREFIX)) return false
  const rest = path.slice(AUTH_PREFIX.length)
  return GUESSABLE.some((one) => rest === one || rest.startsWith(`${one}/`))
}

/**
 * Whether a named tier should be applied to this request.
 */
export function tierApplies(tier: string | undefined, path: string): boolean {
  if (tier === 'auth') return isCredentialAttempt(path)
  return true
}
