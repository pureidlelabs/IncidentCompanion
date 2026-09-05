/**
 * Account lockout: what a run of failed sign-ins costs the account it targets.
 */
import {
  LOCKOUT_AFTER_FAILURES,
  LOCKOUT_CEILING_FAILURES,
  LOCKOUT_FLOOR_MINUTES,
  LOCKOUT_MINUTES,
} from '../policy/keys.js'

/**
 * Failures before the account shuts, and for how long.
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
