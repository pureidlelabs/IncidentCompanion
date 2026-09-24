/**
 * With the ephemeral store unreachable, `GET /api/health` answers 503 and
 * names it, rather than failing inside a control that needs that store.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, type Harness } from './app-harness.js'

/** A port nothing listens on, so every Redis client is refused. */
const UNREACHABLE = 'redis://127.0.0.1:1'

describe('health with the ephemeral store unreachable', () => {
  let harness: Harness | undefined
  let reachable: string | undefined

  beforeAll(async () => {
    if (!(await bootable())) return
    reachable = process.env.REDIS_URL
    process.env.REDIS_URL = UNREACHABLE
    harness = await boot()
  }, 120_000)

  afterAll(async () => {
    await harness?.close()
    process.env.REDIS_URL = reachable
  })

  it('answers 503 naming redis, not an unnamed 500', async (context) => {
    if (!harness) return context.skip()
    const answer = await fetch(`${harness.base}/api/health`)
    const body = (await answer.json()) as { error?: Record<string, unknown> }
    expect(answer.status, JSON.stringify(body)).toBe(503)
    expect(Object.keys(body.error ?? {})).toEqual(['redis'])
  }, 30_000)

  it('serves nothing else as though nothing were wrong', async (context) => {
    if (!harness) return context.skip()
    const answer = await fetch(`${harness.base}/api/setup`)
    expect(answer.status).toBeGreaterThanOrEqual(500)
  }, 30_000)
})
