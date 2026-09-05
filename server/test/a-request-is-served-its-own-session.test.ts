/**
 * **A request is served through the session of the caller who made it, never
 * another's** -- the first sentence of `accounts-and-access`'s session
 * requirement, and the one nothing asserted.
 *
 * Every other test in this tier signs in as one persona and checks what that
 * persona gets. That shape cannot see the defect this sentence is about: a
 * caller's identity held somewhere a second caller can reach it -- a
 * module-level variable, a provider that should be request-scoped and is not, a
 * cache keyed on something that is not the session. Each of those serves one
 * analyst another's data, and each passes every single-caller test in the tree.
 *
 * **So the property needs concurrency to be visible at all**, and it is an
 * invariant rather than an expected value: whatever each analyst stored, that
 * is what each must be handed back, however the requests interleave.
 *
 * `GET /api/appearance` is the subject because it is per-caller by
 * construction -- `preferences.read(session.user.id)` -- so a wrong answer is
 * unambiguous rather than a shared default.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  boot,
  bootable,
  sharedAdmin,
  sharedAnalyst,
  signIn,
  type Harness,
  type Persona,
} from './app-harness.js'

const runnable = await bootable()

/**
 * Rounds of one concurrent request per analyst.
 *
 * **Three in flight at a time rather than a volley of thirty-six.** What the
 * property needs is requests from *different sessions* overlapping; it does not
 * need volume, and volume runs into the credential rate limiter -- measured, a
 * volley of twelve each left the third analyst served nothing at all, which the
 * vacuity guard below caught.
 */
const ROUNDS = 4

describe.skipIf(!runnable)('a request is served its own session', () => {
  let harness: Harness
  let people: { who: Persona; initials: string }[]

  beforeAll(async () => {
    harness = await boot()
    const admin = await sharedAdmin(harness)
    const analyst = await sharedAnalyst(harness)

    /**
     * A third, made here, so the set is not two accounts the rest of the tier
     * also holds -- a leak between exactly two is the easiest to write by
     * accident and the easiest to miss.
     */
    const email = `own-session-${process.pid}@harness.test`
    const password = 'own-session-password-1234'
    const made = await fetch(`${harness.base}/api/accounts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: admin.cookie },
      body: JSON.stringify({
        username: email,
        displayName: 'Own session harness',
        password,
        role: 'analyst',
      }),
    })
    if (!made.ok && made.status !== 409) {
      throw new Error(`could not make the third account: ${String(made.status)}`)
    }
    const issued = await signIn(harness, email, password)
    const changed = await fetch(`${harness.base}/api/change-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: issued.cookie },
      body: JSON.stringify({ current: password, password: `${password}-x`, repeat: `${password}-x` }),
    })
    const third = changed.ok ? await signIn(harness, email, `${password}-x`) : issued

    // Initials are free text and per analyst, so each can be told apart by
    // what it stored rather than by anything the server derives.
    people = [
      { who: admin, initials: 'AA' },
      { who: analyst, initials: 'BB' },
      { who: third, initials: 'CC' },
    ]

    for (const { who, initials } of people) {
      const wrote = await fetch(`${harness.base}/api/appearance`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: who.cookie },
        body: JSON.stringify({ initials }),
      })
      if (!wrote.ok) throw new Error(`could not store initials: ${String(wrote.status)}`)
    }
  }, 120_000)

  afterAll(async () => {
    await harness?.close()
  })

  /**
   * One read, reporting its status rather than asserting it.
   *
   * **A burst is rate limited, and that is the app working.** The limiter
   * answers 429 to part of a concurrent volley, so the property is asserted
   * over the answers that were *served*: a 429 tells us nothing about whose
   * session it would have been served from, and demanding 200 would be a test
   * fighting a control rather than exercising one.
   */
  const readAs = async (
    who: Persona,
  ): Promise<{ status: number; initials: string | null }> => {
    const answer = await fetch(`${harness.base}/api/appearance`, { headers: { cookie: who.cookie } })
    if (answer.status !== 200) return { status: answer.status, initials: null }
    const body = (await answer.json()) as { initials?: string | null }
    return { status: 200, initials: body.initials ?? null }
  }

  /** The premise: the three are distinguishable at all before anything races. */
  it('hands each analyst what that analyst stored', async () => {
    for (const { who, initials } of people) {
      const got = await readAs(who)
      expect(got.status).toBe(200)
      expect(got.initials).toBe(initials)
    }
  }, 30_000)

  /**
   * **The property.** Requests from three sessions, interleaved and in flight
   * together, each answered from its own. A single shared slot anywhere on the
   * path shows up here as one analyst reading another's initials.
   *
   * Asserted as a set of mismatches rather than a count, so a failure names
   * *who was served whose* rather than only that something was wrong.
   */
  it('does not serve one analyst the settings of another', async () => {
    const answers: { wanted: string; got: { status: number; initials: string | null } }[] = []
    for (let round = 0; round < ROUNDS; round += 1) {
      // One per analyst, released together: the overlap is between sessions,
      // which is what the property is about, rather than between requests.
      answers.push(
        ...(await Promise.all(
          people.map(({ who, initials }) =>
            readAs(who).then((got) => ({ wanted: initials, got })),
          ),
        )),
      )
    }

    const served = answers.filter((one) => one.got.status === 200)

    const wrong = served
      .filter((one) => one.got.initials !== one.wanted)
      .map((one) => `expected ${one.wanted}, was served ${String(one.got.initials)}`)
    expect(wrong, 'a request was answered from the wrong session').toEqual([])

    /**
     * **The vacuity guard, and it is the assertion most likely to fail first.**
     * If the limiter refused nearly everything, the check above passes over
     * almost nothing and reports the property held. Every analyst has to have
     * been served at least twice for the interleaving to have meant anything.
     */
    for (const { who, initials } of people) {
      const mine = served.filter((one) => one.wanted === initials)
      expect(
        mine.length,
        `${who.email} was served ${String(mine.length)} of ${String(ROUNDS)}; too few to say anything`,
      ).toBeGreaterThanOrEqual(2)
    }
  }, 60_000)
})
