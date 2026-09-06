/**
 * The minimum every password door reads, this app's and Better Auth's own.
 *
 * Read it rather than spelling the number: `tests/repo/test_source_hygiene.py`
 * refuses a password `.min(<number>)` anywhere in `server/`.
 */
export { MIN_PASSWORD_LENGTH as MINIMUM_PASSWORD_LENGTH } from '../policy/keys.js'
import { MIN_PASSWORD_LENGTH, PASSWORD_FLOOR } from '../policy/keys.js'

export const PASSWORD_TOO_SHORT = `A password needs at least ${String(
  MIN_PASSWORD_LENGTH,
)} characters.`

/**
 * Why a password is too short for *this install*, or null.
 *
 * **Two bounds, and only one of them is in a schema.** Every door declares
 * `.min(PASSWORD_FLOOR)` statically, which is this app's own floor and cannot
 * be lowered from a screen; this is the second, read at the moment a password
 * is set so a raised minimum takes effect without a restart.
 *
 * **A schema cannot do the second one.** The Zod objects are built once when
 * the module loads, so a `.min()` reading a stored value would freeze whatever
 * was set at boot - which is the failure mode where the screen says twenty and
 * the door still takes twelve.
 */
export function refusePassword(password: string, minimum: number): string | null {
  const required = Math.max(minimum, PASSWORD_FLOOR)
  if (password.length >= required) return null
  return `A password needs at least ${String(required)} characters.`
}
