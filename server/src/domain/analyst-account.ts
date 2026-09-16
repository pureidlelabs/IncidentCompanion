/**
 * What `GET /api/accounts` serves for one analyst account, and the two closed
 * vocabularies it is written in.
 *
 * Here rather than beside the auth instance because the client draws these
 * rows: `auth.config.ts` reaches Better Auth and Drizzle, so nothing importing
 * it can be bundled, and a browser wanting the role list had no way to ask.
 */

/**
 * The whole role vocabulary, and it is two words.
 *
 * `admin` gates managing accounts, the idle timeout and the API access level;
 * everything else a signed-in analyst does, case data included, is ungated by
 * role.
 */
export const ROLES = ['analyst', 'admin'] as const

export type Role = (typeof ROLES)[number]

export const DEFAULT_ROLE: Role = 'analyst'
export const ADMIN_ROLE: Role = 'admin'

/** What each role is called in a sentence, where the token is not the word. */
const ROLE_NAMES: Record<Role, string> = { analyst: 'analyst', admin: 'administrator' }

/**
 * What to call a role where a person reads it.
 *
 * Here beside the vocabulary because the server writes the word into its
 * refusals and the row menu offers it as a verb, and a role called two things
 * on one pane is a role an administrator has to work out is one role.
 *
 * **Takes a `string`, though the vocabulary is closed.** `z.enum(ROLES)` is
 * what refuses anything else at the door; the served list reaches a screen as
 * strings, and a value that is not a role is drawn as itself rather than
 * disappearing from a menu.
 */
export function roleName(role: string): string {
  return ROLE_NAMES[role as Role] ?? role
}

/**
 * The same word with the article a sentence needs: *an administrator*, *an
 * analyst*. Composed rather than written at the call site, so a role added to
 * the vocabulary does not leave one sentence saying *an* in front of it.
 */
export function aRole(role: string): string {
  const word = roleName(role)
  return `${'aeiou'.includes(word[0] ?? '') ? 'an' : 'a'} ${word}`
}

/**
 * Every state an account is served in.
 *
 * **Two, and a lock is not one of them even though this install locks.**
 * `auth/lockout.ts` shuts an account after repeated failures and `lockedUntil`
 * records it; what `rowFor` builds a row from is `Analyst`, which carries no
 * such field, so the fact is held and not served.
 *
 * A third term belongs here when a row produces it, and not before: a state
 * nothing emits is a tab an analyst can select and a chip nothing can reach.
 * -> `accounts/rules.test.ts`
 */
export const ACCOUNT_STATES = ['active', 'disabled'] as const

export type AccountState = (typeof ACCOUNT_STATES)[number]

/**
 * One of the install's analyst accounts, as the Accounts pane is given it.
 *
 * **Not `AccountRow`, which `wire.ts` already publishes** for an account a
 * case names. These are the people who sign in; those are rows an analyst
 * typed into an incident, and the two share no field.
 *
 * `state` and `tone` are resolved by the server and never re-derived from
 * `disabled`, so a chip is drawn straight from them.
 *
 * **There is no id.** `username` is what a route addresses an account by, so a
 * caller needing a row identity supplies one rather than finding it here.
 */
export interface AnalystAccount {
  username: string
  displayName: string
  /**
   * **The closed vocabulary, not `string`.** Better Auth types the column
   * loosely, so an unrecognised value reaches the screen as a role the picker
   * cannot offer and leaves the response schema unable to name the enum it
   * publishes. Anything unknown reads as the default.
   */
  role: Role
  state: AccountState
  tone: 'positive' | 'negative'
  disabled: boolean
  /**
   * **Whether this row is the account asking**, answered here because nothing
   * the client holds can work it out: the session carries a display name,
   * which the server does not make unique, and the row is addressed by email.
   *
   * What a row offers turns on it -- every verb on the row is one an
   * administrator performs on somebody else.
   */
  you: boolean
}
