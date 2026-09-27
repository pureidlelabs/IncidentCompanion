/**
 * The lockout's arithmetic: what the install allows, whether a run is shut,
 * and what is kept of a wrong password.
 * `checkPassword` in `auth.config.ts` decides when to ask.
 * -> `openspec/specs/accounts-and-access/design.md`
 */
import { createHmac } from 'node:crypto'

import { sql, type SQL, type SQLWrapper } from 'drizzle-orm'

import { familiarAddress } from '../db/schema/lockout.js'
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

/** Days an address stays familiar after the last right password from it. */
export const FAMILIAR_FOR_DAYS = 90

/** How many of its most recent familiar addresses an account keeps. */
export const FAMILIAR_AT_MOST = 20

/**
 * Whether `address` is familiar to the account `userId` names at `now`: its
 * right password came from there within `FAMILIAR_FOR_DAYS`, and the address
 * is among the account's `FAMILIAR_AT_MOST` most recent.
 */
export function familiarTo(userId: SQLWrapper, address: string, now: Date): SQL<boolean> {
  const held = familiarAddress
  return sql<boolean>`exists (select 1 from (
    select ${held.address} as address from ${held}
    where ${held.userId} = ${userId}
      and ${held.lastRightAt} > ${now.toISOString()}::timestamptz - make_interval(days => ${FAMILIAR_FOR_DAYS})
    order by ${held.lastRightAt} desc, ${held.address}
    limit ${FAMILIAR_AT_MOST}
  ) recent where recent.address = ${address})`
}

/** How many of its latest wrong passwords a run recognises when offered again. */
export const REMEMBERED_MISSES = 3

/** What a run keeps of a wrong password: a MAC under the install's secret over the account and the password. */
export function missOf(secret: string, userId: string, password: string): string {
  return createHmac('sha256', secret).update(`sign-in-miss\0${userId}\0${password}`).digest('base64url')
}
