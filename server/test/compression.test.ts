/**
 * That responses are compressed, because bytes are the billed unit.
 *
 * **This is a cost property, not a speed one, and that is why it needs a
 * test.** On loopback compression is a net *loss* -- the transfer it saves is
 * less than the time it spends -- so anybody optimising for latency has a
 * measurement in hand that says remove it. What justifies it is egress: hosted
 * in a customer's Azure vnet with analysts reaching it over the internet,
 * every response is metered and a case screen is a document of six figures.
 *
 * **So the failure mode is somebody deleting it for a good local reason.** The
 * assertion is what makes that a red test rather than a quiet bill.
 *
 * **Asserted through a real fetch**, because the property belongs to the
 * middleware stack rather than to any handler: `applyPlatform` registers
 * compression ahead of `useStaticAssets`, and a unit test on a controller could
 * not see either half.
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
    // `/specs` is large, served on every session and reachable without a
    // case - which is the shape this exists for.
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
