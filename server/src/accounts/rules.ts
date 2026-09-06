/**
 * The two decisions the Accounts pane makes that authentication does not.
 *
 * **Named functions rather than lines inside the controller**, because the
 * controller cannot be unit-tested without an auth instance and these are the
 * parts worth testing. Everything else there is Better Auth's admin plugin
 * called once and its answer passed on.
 */
import { DEFAULT_ROLE, ROLES } from '../auth/auth.config.js'

/** A user as the admin plugin lists them, narrowed to what is read here. */
export interface Analyst {
  id: string
  email: string
  name: string
  role?: string | null
  banned?: boolean | null
}

type Role = (typeof ROLES)[number]

export interface AccountRow {
  username: string
  displayName: string
  /**
   * **The closed vocabulary, not `string`.** Better Auth types the column
   * loosely, so an unrecognised value reaches the screen as a role the picker
   * cannot offer and leaves the response schema unable to name the enum it
   * publishes. Anything unknown reads as the default.
   */
  role: Role
  state: 'active' | 'disabled'
  tone: 'positive' | 'negative'
  disabled: boolean
}

/**
 * One row as the pane draws it. `state` and `tone` are resolved here and never
 * derived on the client, which renders a chip straight from them.
 *
 * A missing role reads as `DEFAULT_ROLE`, never as nothing.
 */
export function rowFor(user: Analyst): AccountRow {
  const disabled = user.banned === true
  return {
    username: user.email,
    displayName: user.name,
    role: (ROLES as readonly string[]).includes(user.role ?? '')
      ? (user.role as Role)
      : DEFAULT_ROLE,
    state: disabled ? 'disabled' : 'active',
    tone: disabled ? 'negative' : 'positive',
    disabled,
  }
}

/**
 * Whether a failed create was the email already being taken - what closes the
 * gap in the controller's read-then-create.
 *
 * Three spellings, because the failure arrives through two layers: SQLSTATE
 * `23505` on the error, the same code on `cause` where Better Auth's adapter
 * wrapped it, and the plugin's own refusal in words. Deliberately narrow, so a
 * database that is away is not reported as a taken email.
 */
export function duplicateEmail(why: unknown): boolean {
  if (typeof why !== 'object' || why === null) return false
  const at = why as { code?: unknown; message?: unknown; cause?: unknown }
  if (at.code === '23505') return true
  if (typeof at.message === 'string' && /already exists|duplicate|unique/i.test(at.message)) {
    return true
  }
  return at.cause === undefined ? false : duplicateEmail(at.cause)
}
