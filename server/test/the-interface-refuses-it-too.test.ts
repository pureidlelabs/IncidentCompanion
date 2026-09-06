/**
 * **A rule enforced only in a screen is a rule nobody else obeys** -- the
 * constraint `openspec/specs/the-api/spec.md` puts on where behaviour lives:
 *
 * > Every capability MUST be reachable through the interface. A screen MUST
 * > NOT be able to do anything a caller with the same reach could not do by
 * > other means, and MUST NOT hold a private path.
 *
 * > #### Scenario: A rule is enforced only in the client
 * > - GIVEN a constraint on what an analyst may record
 * > - WHEN a caller submits a value the screen would refuse
 * > - **THEN the interface refuses it too**
 *
 * **The subject list is the collection registry**, not a field somebody picked.
 * A test naming three collections demonstrates those three, and the property is
 * about every door the product opens -- a collection added tomorrow with its
 * validation left to the form is exactly the case this exists to catch, and it
 * is the one a hand-written list cannot see.
 *
 * **What is asserted is the refusal, not the message.** The wording is the
 * screen's business and changes with it; that the door closes at all is the
 * interface's, and it is what a caller bypassing the screen meets.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { COLLECTIONS } from '../src/domain/collections.js'
import { boot, bootable, sharedAdmin, type Harness, type Persona } from './app-harness.js'

const runnable = await bootable()

/** Every collection the product publishes a door for, from its own registry. */
const NAMES = Object.keys(COLLECTIONS)

describe.skipIf(!runnable)('the interface refuses what the screen would', () => {
  let harness: Harness
  let admin: Persona
  let caseId: string

  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)
    const made = await fetch(`${harness.base}/api/cases`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: admin.cookie },
      body: JSON.stringify({ title: 'Bodies the schema refuses' }),
    })
    if (!made.ok) throw new Error(`could not open a case: ${String(made.status)}`)
    caseId = ((await made.json()) as { id: string }).id
  }, 90_000)

  afterAll(async () => {
    await harness?.close()
  })

  /**
   * **The vacuity guard.** A registry that stopped enumerating would leave
   * every case below sweeping nothing and reporting the rule kept.
   */
  it('has a registry of collections to sweep', () => {
    expect(NAMES.length, 'the collection registry is empty').toBeGreaterThan(5)
  })

  const post = (name: string, body: unknown) =>
    fetch(`${harness.base}/api/cases/${caseId}/${name}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: admin.cookie },
      body: JSON.stringify(body),
    })

  /**
   * **A body no collection's schema accepts, at every door the registry names.**
   *
   * **What this does and does not isolate, measured rather than assumed.**
   * Removing the strictness from the create path -- `this.schema` instead of
   * `this.schema.strict()` -- leaves all of these passing, because the probe
   * is missing every required field and is refused for that instead. Removing
   * the validation altogether fails every one of them.
   *
   * So this asserts *that the body is validated at all*, at every door,
   * which is the scenario's claim: a caller submitting what the screen would
   * refuse is refused too. It does **not** assert strictness; isolating that
   * needs a minimal valid body per collection, derived from each schema, and
   * that is a different test.
   */
  it.each(NAMES)('refuses a body carrying a field %s does not have', async (name) => {
    const answer = await post(name, { notAFieldAnybodyDeclared: 'x' })

    expect(
      answer.status,
      `POST /api/cases/{id}/${name} accepted a field the schema never declared`,
    ).toBeGreaterThanOrEqual(400)
    expect(answer.status, 'the refusal was a server fault rather than a refusal').toBeLessThan(500)
  }, 30_000)

  /**
   * **And an empty body, which is the other shape a screen would refuse.** A
   * collection whose every field is optional would legitimately accept this,
   * so the assertion is that it is *not a 500* -- a door that crashes on an
   * empty body is refusing by accident rather than by rule, and a caller
   * cannot tell an unacceptable body from a broken one.
   */
  it.each(NAMES)('answers an empty body to %s with a decision, never a fault', async (name) => {
    const answer = await post(name, {})

    expect(answer.status, `POST /api/cases/{id}/${name} faulted on an empty body`).toBeLessThan(500)
  }, 30_000)
})
