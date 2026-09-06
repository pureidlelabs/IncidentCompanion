/**
 * **Claiming a fresh install, which had no route at all.**
 *
 * The client calls `GET /api/setup` to decide whether to draw the first-run
 * screen, and catches a failure by showing the sign-in form - its own comment
 * calls it "the safe wrong answer". So a server without this route leaves a
 * fresh install unable to create its first account from the UI, and
 * `dev-node.sh` curls the sign-up route instead, which is why nobody feels it.
 *
 * **This runs against whatever the suite's database already holds**, so it
 * cannot claim anything: the assertions here are all about a *claimed* install
 * refusing, which is the state that persists.
 *
 * **The success path is covered by hand, against a genuinely empty install**:
 * every account deleted and the server restarted, then the token read from the
 * console, `GET /api/setup` answering `{unclaimed:true}`, a wrong token refused
 * with 403, the right one answering `{claimed:true}` and setting a session
 * cookie whose user comes back with role `admin`, and a second claim refused.
 * Automating it needs a database this tier can empty, which is the hermetic
 * tier's job and not this file's - recorded here so the gap is visible rather
 * than assumed covered.
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
