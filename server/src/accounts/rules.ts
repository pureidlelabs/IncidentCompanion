/**
 * The two decisions the Accounts pane makes that authentication does not.
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

/** A role outside `ROLES` cannot be rendered, so it is not one this states. */
type Role = (typeof ROLES)[number]

export interface AccountRow {
  username: string
  displayName: string
  /**
   * **The closed vocabulary, not `string`.**
   */
  role: Role
  state: 'active' | 'disabled'
  tone: 'positive' | 'negative'
  disabled: boolean
}

/**
 * One row as the pane draws it. `state` and `tone` are resolved here and never
 * derived on the client, which renders a chip straight from them.
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
