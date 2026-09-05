/**
 * The minimum every password door reads, this app's and Better Auth's own.
 */
export { MIN_PASSWORD_LENGTH as MINIMUM_PASSWORD_LENGTH } from '../policy/keys.js'
import { MIN_PASSWORD_LENGTH, PASSWORD_FLOOR } from '../policy/keys.js'

/**
 * The refusal every schema shows, so an analyst meets one sentence whichever
 * screen they are on.
 */
export const PASSWORD_TOO_SHORT = `A password needs at least ${String(
  MIN_PASSWORD_LENGTH,
)} characters.`

/**
 * Why a password is too short for *this install*, or null.
 */
export function refusePassword(password: string, minimum: number): string | null {
  const required = Math.max(minimum, PASSWORD_FLOOR)
  if (password.length >= required) return null
  return `A password needs at least ${String(required)} characters.`
}
