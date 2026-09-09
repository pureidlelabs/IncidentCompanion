/**
 * **The two clients are configured differently, and the difference is the point.**
 *
 * `commands` gives up after one retry, because every caller falls back and a
 * command retried twenty times with backoff is worse than one that gives up.
 * It keeps the offline queue, though `auth/redis.ts` drops both: `join` is on
 * the socket path and can arrive before the connection is ready, where a
 * refusal to queue throws rather than waiting a moment. -> #174
 *
 * Asserted on the constructed clients rather than on behaviour: what an
 * unreachable Redis costs is ioredis's to decide, and this file's claim is only
 * that the options reach the client that needs them. Needs no Redis, so it runs
 * where `presence.store.test.ts` skips.
 */
import type Redis from 'ioredis'
import { afterEach, describe, expect, it } from 'vitest'

import { PresenceStore } from './presence.store.js'

/** Nothing listens here; the options are set whether or not it connects. */
const config = { get: () => 'redis://127.0.0.1:6399' } as never

let built: { commands: Redis; reader: Redis } | null = null

function build() {
  const store = new PresenceStore(config) as unknown as { commands: Redis; reader: Redis }
  built = store
  return store
}

afterEach(() => {
  built?.commands.disconnect()
  built?.reader.disconnect()
  built = null
})

describe('the two Redis clients the presence store builds', () => {
  it('gives the command client the fail-fast options', () => {
    const { commands } = build()

    expect(commands.options.maxRetriesPerRequest).toBe(1)
  })

  /**
   * The half a copy of the sibling would get wrong. Dropping the queue here
   * makes a command issued before the connection is ready throw, which is what
   * `a-name-leaves-the-roster-by-itself.test.ts` reports when it happens.
   */
  it('keeps the command client able to queue until the connection is ready', () => {
    const { commands } = build()

    expect(
      commands.options.enableOfflineQueue,
      'a command sent before the connection is ready now throws instead of waiting',
    ).not.toBe(false)
  })

  /**
   * The other half. Without this the file reads as "fail fast everywhere", and
   * the next person applies it to the subscriber for symmetry.
   */
  it('leaves the subscriber able to queue, so a reconnect resubscribes', () => {
    const { reader } = build()

    expect(
      reader.options.enableOfflineQueue,
      'the subscriber cannot queue, so a reconnect drops its channels',
    ).not.toBe(false)
  })
})
