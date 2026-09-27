/**
 * A caller that is not the edge is attributed to its own address, whatever
 * address it presents, by the audit and the session record, over HTTP and on
 * a socket upgrade.
 *
 * The harness names no edge, so its client is such a caller. Outside
 * production Better Auth answers `127.0.0.1` for an address it cannot
 * resolve, which is also this peer's; what this can see is a presented
 * address being recorded instead.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, type Harness } from './app-harness.js'
import { attributedWhenPresenting } from './attribution.js'

describe.skipIf(!(await bootable()))('a caller the install has no reason to believe', () => {
  let harness: Harness

  beforeAll(async () => {
    harness = await boot()
  }, 90_000)

  afterAll(async () => {
    await harness?.close()
  })

  it('is recorded at its own address, not the one it presents', async () => {
    const recorded = await attributedWhenPresenting(harness, {
      'x-forwarded-for': '203.0.113.9',
      'x-real-ip': '203.0.113.10',
    })
    expect(recorded).toEqual({
      signInFailed: '127.0.0.1',
      socketRefused: '127.0.0.1',
      session: '127.0.0.1',
    })
  }, 60_000)
})
