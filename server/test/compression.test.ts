/**
 * That responses are compressed, because bytes are the billed unit.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAdmin, type Harness, type Persona } from './app-harness.js'

const runnable = await bootable()

describe.skipIf(!runnable)('what leaves the server', () => {
  let harness: Harness
  let me: Persona

  beforeAll(async () => {
    harness = await boot()
    me = await sharedAdmin(harness)
  }, 90_000)

  afterAll(async () => {
    await harness?.close()
  })

  it('compresses a response big enough to be worth it', async () => {
    // `/specs` is ~47KB and served on every session - the shape this exists
    // for, and reachable without a case.
    const response = await fetch(`${harness.base}/api/specs`, {
      headers: { 'accept-encoding': 'gzip', cookie: me.cookie },
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-encoding')).toBe('gzip')
  })

  it('leaves a small response alone', async () => {
    // Under the threshold the encoding header costs more than the saving, and
    // `content-encoding: gzip` on 200 bytes is a pessimisation dressed as one.
    const response = await fetch(`${harness.base}/api/health`, {
      headers: { 'accept-encoding': 'gzip' },
    })
    expect(response.headers.get('content-encoding')).toBeNull()
  })

  it('sends plain bytes to a client that did not ask for encoding', async () => {
    // A caller with no `accept-encoding` is not an edge case here: the API door
    // is meant to be usable from a script, and a body it cannot read is worse
    // than a big one.
    const response = await fetch(`${harness.base}/api/specs`, {
      headers: { 'accept-encoding': 'identity', cookie: me.cookie },
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-encoding')).toBeNull()
  })
})
