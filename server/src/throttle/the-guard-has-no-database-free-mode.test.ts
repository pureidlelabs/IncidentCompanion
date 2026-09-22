/**
 * The guard writes the `rate_limited` line, and it was injected the database
 * optionally so a module without the provider could still build. A module
 * missing it then refused callers and recorded nothing, with nothing going
 * red -- so the absence is a build failure rather than a silent half. -> #1087
 */
import { Test } from '@nestjs/testing'
import { ThrottlerModule } from '@nestjs/throttler'
import { describe, expect, it } from 'vitest'

import { AuditedThrottlerGuard } from './throttler.guard.js'
import { DATABASE } from '../db/db.module.js'
import { TIERS } from './tiers.js'

const building = (providers: Parameters<typeof Test.createTestingModule>[0]['providers']) =>
  Test.createTestingModule({
    imports: [ThrottlerModule.forRoot({ throttlers: TIERS })],
    providers,
  }).compile()

describe('a module registering the throttler guard', () => {
  it('does not build without the database the guard records to', async () => {
    await expect(building([AuditedThrottlerGuard])).rejects.toThrow(/DATABASE/)
  })

  it('builds once the token is provided', async () => {
    const built = await building([AuditedThrottlerGuard, { provide: DATABASE, useValue: {} }])

    expect(built.get(AuditedThrottlerGuard)).toBeInstanceOf(AuditedThrottlerGuard)
    await built.close()
  })
})
