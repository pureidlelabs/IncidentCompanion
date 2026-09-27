/**
 * Where the peer is the edge, the address the edge forwarded is the caller's,
 * for the audit and the session record, over HTTP and on a socket upgrade.
 *
 * The edge is named `localhost`, so the harness's own client is it.
 * `a-caller-is-attributed-to-itself.test.ts` holds a peer that is not.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { boot, bootable, type Harness } from './app-harness.js'
import { attributedWhenPresenting } from './attribution.js'

describe.skipIf(!(await bootable()))('an install behind an edge named localhost', () => {
  let harness: Harness

  beforeAll(async () => {
    vi.stubEnv('IC_EDGE', 'localhost')
    harness = await boot()
  }, 90_000)

  afterAll(async () => {
    await harness?.close()
    vi.unstubAllEnvs()
  })

  it('records the address the edge forwarded', async () => {
    const recorded = await attributedWhenPresenting(harness, { 'x-forwarded-for': '203.0.113.9' })
    expect(recorded).toEqual({
      signInFailed: '203.0.113.9',
      socketRefused: '203.0.113.9',
      session: '203.0.113.9',
    })
  }, 60_000)
})
