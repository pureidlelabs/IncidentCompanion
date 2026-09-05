/**
 * **Claiming a fresh install, which had no route at all.**
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAdmin, type Harness } from './app-harness.js'

const runnable = await bootable()

describe.skipIf(!runnable)('claiming an install', () => {
  let harness: Harness

  beforeAll(async () => {
    harness = await boot()
    // Guarantees the install is claimed, whatever ran before this file.
    await sharedAdmin(harness)
  }, 90_000)

  afterAll(async () => {
    await harness?.close()
  })

  it('serves the question the client has always asked', async () => {
    const answer = await fetch(`${harness.base}/api/setup`)
    expect(answer.status, 'GET /api/setup is what the first-run screen reads').toBe(200)
    expect(await answer.json()).toEqual({ unclaimed: false })
  })

  /**
   * **Readable with no session, because nobody can hold one on a fresh
   * install.**
   */
  it('answers without a session', async () => {
    const answer = await fetch(`${harness.base}/api/setup`)
    expect(answer.status).toBe(200)
  })

  /**
   * **The claim refuses once there is an account, before it looks at the
   * token.**
   */
  it('refuses to claim an install that already has an account', async () => {
    const answer = await fetch(`${harness.base}/api/setup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        token: 'whatever',
        username: 'late@example.invalid',
        password: 'a-password-long-enough',
        repeat: 'a-password-long-enough',
      }),
    })
    expect(answer.status).toBe(403)
    expect(await answer.text()).toMatch(/already has an account/i)
  })

  /** The two passwords are checked here as well as in the form. */
  it('refuses a claim whose passwords disagree', async () => {
    const answer = await fetch(`${harness.base}/api/setup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        token: 'whatever',
        username: 'late@example.invalid',
        password: 'a-password-long-enough',
        repeat: 'a-different-password',
      }),
    })
    expect(answer.status).toBe(422)
  })

  /**
   * **A short password is refused by the route, not only by the form.**
   */
  it('refuses a claim with a short password', async () => {
    const answer = await fetch(`${harness.base}/api/setup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        token: 'whatever',
        username: 'late@example.invalid',
        password: 'short',
        repeat: 'short',
      }),
    })
    expect(answer.status).toBe(422)
  })
})
