/**
 * With Redis itself up and only the server's own connection to it down --
 * the moment after a Redis restart while that connection waits out its
 * reconnect backoff -- health does not say well.
 *
 * A file of its own: `ConfigModule` reads the environment once per module
 * graph, so a sibling booting with an unreachable Redis would leave this one
 * unreachable too, and pass for that reason.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, type Harness } from './app-harness.js'
import { AuthRedis } from '../src/auth/redis.js'

describe('health with the connection that serves requests down', () => {
  let harness: Harness | undefined

  beforeAll(async () => {
    if (!(await bootable())) return
    harness = await boot()
  }, 120_000)

  afterAll(async () => {
    await harness?.close()
  })

  it('does not say well while sessions and limits cannot be read', async (context) => {
    if (!harness) return context.skip()
    AuthRedis.connect(process.env.REDIS_URL ?? '').disconnect()
    const answer = await fetch(`${harness.base}/api/health`)
    const body = (await answer.json()) as { error?: Record<string, unknown> }
    expect(answer.status, JSON.stringify(body)).toBe(503)
    expect(Object.keys(body.error ?? {})).toEqual(['redis'])
  }, 30_000)
})
