/**
 * The guard asks the count before it answers.
 *
 * **A short-circuit in `handleRequest` leaves every tier configured and none of
 * them enforcing anything.** Driven against a storage reporting the caller
 * already blocked, because the property from outside needs a booted app:
 * `test/a-caller-that-asks-too-often-is-told-when-to-return.test.ts`.
 */
import type { ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ThrottlerException, type ThrottlerRequest } from '@nestjs/throttler'
import { describe, expect, it } from 'vitest'

import { AuditedThrottlerGuard } from './throttler.guard.js'
import { TIERS } from './tiers.js'

const BLOCKED = { totalHits: 99, timeToExpire: 1, isBlocked: true, timeToBlockExpire: 1 }

/** `handleRequest` is protected, and a derived class may publish it. */
class Reachable extends AuditedThrottlerGuard {
  public override handleRequest(request: ThrottlerRequest): Promise<boolean> {
    return super.handleRequest(request)
  }
}

const context = (path: string) =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ path, method: 'GET', headers: {} }),
      getResponse: () => ({ header: () => undefined }),
    }),
  }) as unknown as ExecutionContext

describe('the audited throttler guard', () => {
  it.each(TIERS)('refuses a caller the $name tier has already blocked', async (tier) => {
    const guard = new Reachable(
      { throttlers: TIERS },
      { increment: () => Promise.resolve(BLOCKED) },
      new Reflector(),
    )
    await guard.onModuleInit()

    await expect(
      guard.handleRequest({
        context: context('/api/cases'),
        limit: tier.limit,
        ttl: tier.ttl,
        throttler: tier,
        blockDuration: tier.ttl,
        getTracker: () => Promise.resolve('a-caller'),
        generateKey: () => 'a-key',
      }),
    ).rejects.toBeInstanceOf(ThrottlerException)
  })
})
