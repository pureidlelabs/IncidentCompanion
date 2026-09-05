/**
 * **Nothing signs itself up. The setup token claims the install, and an
 * administrator provisions every account after it.**
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { AuthService } from '@thallesp/nestjs-better-auth'

import type { Auth } from '../src/auth/auth.config.js'

import { boot, bootable, sharedAdmin, type Harness } from './app-harness.js'

const runnable = await bootable()

const signUpBody = (email: string) =>
  JSON.stringify({ email, password: 'a-password-long-enough', name: 'Uninvited' })

describe.skipIf(!runnable)('signing yourself up', () => {
  let harness: Harness

  beforeAll(async () => {
    harness = await boot()
    // The install is claimed either way; the route answers the same on both.
    await sharedAdmin(harness)
  }, 90_000)

  afterAll(async () => {
    await harness?.close()
  })

  const attempt = (email: string) =>
    fetch(`${harness.base}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: signUpBody(email),
    })

  /**
   * **404 rather than 403**, because the route is not mounted rather than
   * refused. A 403 says "not you"; this says the door is not there.
   */
  it('is not a route this server serves', async () => {
    const answer = await attempt('uninvited@example.invalid')
    expect(answer.status, 'anyone who can reach the port could join otherwise').toBe(404)
  })

  /**
   * **The refusal has to leave nothing behind.**
   */
  it('creates no account', async () => {
    const email = 'never-created@example.invalid'
    await attempt(email)

    const signIn = await fetch(`${harness.base}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'a-password-long-enough' }),
    })
    expect(signIn.ok, 'the refused sign-up left an account behind').toBe(false)
  })

  /**
   * **The setup route is still there**, or closing sign-up would have shut the
   * only way to claim a fresh install.
   */
  it('leaves the setup door standing', async () => {
    const answer = await fetch(`${harness.base}/api/setup`)
    expect(answer.ok, 'a fresh install would be unclaimable').toBe(true)
    expect((await answer.json()) as { unclaimed?: boolean }).toEqual({ unclaimed: false })
  })

  /**
   * **The one door `disabledPaths` cannot close, and the only thing that closes
   * it.**
   */
  it('refuses an in-process sign-up once the install has an account', async () => {
    const auth = harness.app.get<AuthService<Auth>>(AuthService)
    const email = 'second-first-admin@example.invalid'

    await expect(
      auth.api.signUpEmail({ body: { email, password: 'a-password-long-enough', name: 'Second' } }),
    ).rejects.toThrow(/not open for sign-up/)

    const signIn = await fetch(`${harness.base}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'a-password-long-enough' }),
    })
    expect(signIn.ok, 'the refused sign-up left an account behind').toBe(false)
  })
})
