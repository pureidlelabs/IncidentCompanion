/**
 * **Nothing signs itself up. The setup token claims the install, and an
 * administrator provisions every account after it.**
 *
 * Better Auth's `/sign-up/email` was a public route, reachable for the whole
 * life of an install - so anyone who could reach the port could give
 * themselves an analyst account on somebody else's investigation. That was
 * narrowed to "open while the install has no accounts", which left it as a
 * second, unauthenticated way to become the **first administrator**: exactly
 * what the setup token exists to prevent, and the token was the only one of
 * the two anybody had to hold.
 *
 * **So the route is not served at all now** - `disabledPaths` in
 * `auth.config.ts`. The property this file used to assert, that sign-up closes
 * once an account exists, is gone because the weaker half of it is gone: it is
 * closed at every moment, claimed or not.
 *
 * `POST /api/setup` with the token is the only door to the first account.
 * `POST /api/accounts` is the only door to every account after it, and it
 * holds the new account's password until they set their own.
 *
 * **The in-process call is not a bypass and cannot become one.**
 * `setup.controller.ts` reaches `auth.api.signUpEmail()` directly, which
 * `disabledPaths` does not intercept - it is enforced in `onRequest`, the
 * router's entry point. Nothing reaches that call without matching the token.
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
   * **The refusal has to leave nothing behind.** A route that half-ran would
   * answer an error and still have written the account, which is the same
   * outcome with a worse error message.
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
   * only way to claim a fresh install. It answers its claimed status to
   * anybody, which is what the setup screen reads before offering the form.
   */
  it('leaves the setup door standing', async () => {
    const answer = await fetch(`${harness.base}/api/setup`)
    expect(answer.ok, 'a fresh install would be unclaimable').toBe(true)
    expect((await answer.json()) as { unclaimed?: boolean }).toEqual({ unclaimed: false })
  })

  /**
   * **The one door `disabledPaths` cannot close, and the only thing that
   * closes it.** `/sign-up/email` is refused over HTTP before any hook runs,
   * so every case above is held by the path list. `setup.controller.ts` calls
   * `signUpEmail` *in process* to skip the origin check, and `disabledPaths`
   * does not intercept that -- which leaves the `before` hook in
   * `auth.config.ts` as the whole of the refusal on this path.
   *
   * **Written because deleting that hook left the whole server suite green**,
   * while its own docstring named this file as its coverage. The call is the one
   * `test/app-harness.ts` uses to make the first account, so this asserts the
   * install rule rather than a mock: the first sign-up claims the install and
   * every one after it is refused.
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
