/**
 * The lockout's arithmetic: what the install allows, whether a run is shut,
 * how long its next lock lasts, and what is kept of a wrong password.
 * `checkPassword` in `auth.config.ts` decides when to ask.
 * -> `openspec/specs/accounts-and-access/design.md`
 */
import { createHmac } from 'node:crypto'

import type { PolicyValues } from '../policy/read.js'

export interface LockoutPolicy {
  afterFailures: number
  minutes: number
  maxMinutes: number
}

/** The install's settings, with the longest lock never shorter than the first. */
export function policyFrom(values: PolicyValues): LockoutPolicy {
  const minutes = values['auth.lockoutMinutes']
  return {
    afterFailures: values['auth.lockoutAfterFailures'],
    minutes,
    maxMinutes: Math.max(minutes, values['auth.lockoutMaxMinutes']),
  }
}

/** Whether a run locked until `lockedUntil` is shut at `now`; open from that instant on. */
export function isLocked(lockedUntil: Date | null, now: Date): boolean {
  return lockedUntil !== null && lockedUntil.getTime() > now.getTime()
}

/**
 * Minutes the next lock lasts, after `locksBefore` locks with no right
 * password between them: the first for `minutes`, each after it twice the one
 * before, never more than `maxMinutes`.
 */
export function lockMinutes(policy: LockoutPolicy, locksBefore: number): number {
  return Math.min(policy.minutes * 2 ** locksBefore, policy.maxMinutes)
}

/** How many of its latest wrong passwords a run recognises when offered again. */
export const REMEMBERED_MISSES = 3

/** What a run keeps of a wrong password: a MAC under the install's secret over the account and the password. */
export function missOf(secret: string, userId: string, password: string): string {
  return createHmac('sha256', secret).update(`sign-in-miss\0${userId}\0${password}`).digest('base64url')
}
