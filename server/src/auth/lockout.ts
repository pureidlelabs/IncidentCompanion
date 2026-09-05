/**
 * Account lockout: what a run of failed sign-ins costs the account it targets.
 *
 * **The control this install did not have.** Until now the only thing between
 * an attacker and unlimited password guesses was nginx's per-address limit,
 * which stops nobody willing to use a second address. OWASP ASVS V2.2.1 wants
 * a control that is *not* per-address, and this is it.
 *
 * **Better Auth does not bring one.** The lockout it added in 1.6.22 is for
 * two-factor verification, which this install does not offer; `sentinel`
 * carries a password one and is a hosted plugin needing an API key, which core
 * may not have.
 *
 * The arithmetic lives here rather than in the middleware so a unit test can
 * hold it. What the middleware owns is when to ask.
 * -> <https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html>
 */
import {
  LOCKOUT_AFTER_FAILURES,
  LOCKOUT_CEILING_FAILURES,
  LOCKOUT_FLOOR_MINUTES,
  LOCKOUT_MINUTES,
} from '../policy/keys.js'

/**
 * Failures before the account shuts, and for how long.
 *
 * **Ten and fifteen minutes, which is Better Auth's own default** for the
 * lockout it does ship, and NIST SP 800-63B's guidance is no more than 100
 * failures per account - so ten with a delay is comfortably inside it.
 *
 * A long lock is a denial-of-service an attacker can aim at a named analyst
 * during an incident: they cannot get in, and neither can the analyst. Fifteen
 * minutes costs an attacker the run and costs an analyst one coffee.
 */
export {
  LOCKOUT_AFTER_FAILURES,
  LOCKOUT_CEILING_FAILURES,
  LOCKOUT_FLOOR_MINUTES,
  LOCKOUT_MINUTES,
} from '../policy/keys.js'

export interface LockoutPolicy {
  afterFailures: number
  minutes: number
}

/**
 * What the install is set to, floored and capped.
 *
 * **A stored value is not trusted.** Settings are a write path, and one that
 * could be set to `after 10000 failures` would turn the control off while the
 * screen still showed a number.
 */
export function policyFrom(stored: {
  afterFailures?: unknown
  minutes?: unknown
}): LockoutPolicy {
  const failures = Number(stored.afterFailures)
  const minutes = Number(stored.minutes)
  return {
    afterFailures:
      Number.isInteger(failures) && failures >= 1 && failures <= LOCKOUT_CEILING_FAILURES
        ? failures
        : LOCKOUT_AFTER_FAILURES,
    minutes:
      Number.isInteger(minutes) && minutes >= LOCKOUT_FLOOR_MINUTES
        ? minutes
        : LOCKOUT_MINUTES,
  }
}

export interface LockState {
  failedSignIns: number
  lockedUntil: Date | null
}

/**
 * Is this account shut right now?
 *
 * **Compared against a passed clock, not `Date.now()`**, so the test that
 * matters - the moment a lock expires - is expressible without sleeping.
 */
export function isLocked(state: LockState, now: Date): boolean {
  return state.lockedUntil !== null && state.lockedUntil.getTime() > now.getTime()
}

/**
 * What one more failure does to the account.
 *
 * Returns the row to write, and whether this failure is the one that shut it -
 * the caller needs that to record a line, and must not re-record on every
 * subsequent attempt against an already-locked account.
 */
export function afterFailure(
  state: LockState,
  policy: LockoutPolicy,
  now: Date,
): { failedSignIns: number; lockedUntil: Date | null; justLocked: boolean } {
  const failedSignIns = state.failedSignIns + 1
  if (failedSignIns < policy.afterFailures) {
    return { failedSignIns, lockedUntil: state.lockedUntil, justLocked: false }
  }
  return {
    failedSignIns,
    lockedUntil: new Date(now.getTime() + policy.minutes * 60_000),
    // Already shut is not newly shut. Recording every attempt against a locked
    // account would bury the one line that says when it shut.
    justLocked: !isLocked(state, now),
  }
}

/** A success clears both, or the next single failure shuts the account again. */
export const CLEARED = { failedSignIns: 0, lockedUntil: null } as const
