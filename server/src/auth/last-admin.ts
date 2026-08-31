/**
 * The rule that keeps an install administrable, for every route that can end
 * that.
 *
 * Asked by two routes: the disable route in `accounts`, and Better Auth's
 * `/api/auth/admin/set-role`, intercepted in `auth.config.ts`.
 */
import { ADMIN_ROLE, DEFAULT_ROLE } from './auth.config.js'

/** Enough of an account to decide this. */
export interface Analyst {
  id: string
  email: string
  name: string
  role?: string | null
  banned?: boolean | null
}

const administers = (one: Analyst): boolean =>
  (one.role ?? DEFAULT_ROLE) === ADMIN_ROLE && one.banned !== true

/**
 * Whether this change leaves nobody who can administer the install.
 *
 * `becoming` is the role the target is being given, or **null for a disable** --
 * which is a demotion to nobody and asks the same question.
 *
 * False unless the target can administer today, so an install that already has
 * no administrator refuses nothing: there is nothing left to protect, and
 * refusing would only make the state harder to leave.
 */
export function stranding(
  everyone: readonly Analyst[],
  target: Analyst,
  becoming: string | null,
): boolean {
  if (!administers(target)) return false
  // Re-granting the role the account already holds strands nobody, and
  // refusing it would make a no-op read as a dangerous act.
  if (becoming === ADMIN_ROLE) return false
  return everyone.filter(administers).length === 1
}
