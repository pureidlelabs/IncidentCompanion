/**
 * **Claiming a fresh install, which had no route at all.**
 *
 * The client has always called `GET /api/setup` to decide whether to draw the
 * first-run screen, and this server answered 404. The client catches that and
 * shows the sign-in form - its own comment calls it "the safe wrong answer" -
 * so measured 2026-08-12, **a fresh Node install could not create its first
 * account from the UI**. `dev-node.sh` curls the sign-up route instead, which
 * is why it was never felt.
 *
 * **This runs against whatever the suite's database already holds**, so it
 * cannot claim anything: the assertions here are all about a *claimed* install
 * refusing, which is the state that persists.
 *
 * **The success path was verified against a genuinely empty install instead**,
 * 2026-08-12, by deleting every account and restarting: the token was printed
 * to the console, `GET /api/setup` answered `{unclaimed:true}`, a wrong token
 * was refused with 403, the right one answered `{claimed:true}` and set a
 * session cookie whose user came back with role `admin`, and a second claim
 * was refused. Automating that needs a database this tier can empty, which is
 * the hermetic tier's job and not this file's - recorded here so the gap is
 * visible rather than assumed covered.
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
   * install.** A guarded setup route only opens from inside the room it lets
   * you into.
   */
  it('answers without a session', async () => {
    const answer = await fetch(`${harness.base}/api/setup`)
    expect(answer.status).toBe(200)
  })

  /**
   * **The claim refuses once there is an account, before it looks at the
   * token.** Otherwise the route is a way to mint an administrator on a
   * running install for anyone who can reach the port.
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
   * **A short password is refused by the route, not only by the form.** The
   * first account on an install is the one that can never be reset by somebody
   * else, so it is the worst one to let through weak.
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
