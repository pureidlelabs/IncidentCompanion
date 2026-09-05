/**
 * What an install acquired does not reach the door that needs no session.
 *
 * *GIVEN an install carrying vocabularies and templates its operator added,
 * WHEN it is asked through the open door, THEN none of them appears.*
 *
 * The reason the door can be open at all is that it discloses only what reading
 * the source would disclose. An answer that moved when an operator added a
 * template would say that this install exists, that somebody configured it, and
 * roughly what they call things -- to a caller with no account.
 *
 * **The open door is `/api/openapi.json` and `/api/about`**, which is what the
 * install actually serves without a session: `/api/specs` and
 * `/api/collections` both answer 401, measured. `anonymous-access.test.ts`
 * holds that list and argues each entry; this asks what the entries *say*.
 *
 * **Compared byte for byte, before and after.** The requirement is that two
 * installs of one version answer identically, which cannot be run here with one
 * install -- so the same install is asked either side of being extended, which
 * is the same claim from the only angle a single install offers.
 *
 * **The template being visible through the session is the control.** An entry
 * that was never created, or created somewhere nothing reads, would leave the
 * open door unchanged for a reason that has nothing to do with the door.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAdmin, type Harness, type Persona } from './app-harness.js'

const ADDED = `An operator template ${String(Date.now())}`

let harness: Harness | null = null
let admin: Persona
let before: Record<string, string> = {}

/** Every door an anonymous caller may knock on, and what it answers. */
async function openDoor(): Promise<Record<string, string>> {
  const answers: Record<string, string> = {}
  for (const path of ['/api/openapi.json', '/api/about']) {
    const answer = await fetch(`${harness!.base}${path}`)
    expect(answer.status, `${path} refused an anonymous caller`).toBe(200)
    answers[path] = await answer.text()
  }
  return answers
}

describe.skipIf(!(await bootable()))('an install somebody has extended', () => {
  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)
    before = await openDoor()
  }, 90_000)

  afterAll(async () => {
    await harness?.close()
  })

  it('answers the anonymous caller at all, or there is no door to test', () => {
    expect(Object.keys(before)).toHaveLength(2)
    expect(before['/api/openapi.json']!.length).toBeGreaterThan(1000)
  })

  /**
   * *GIVEN a caller with no session, WHEN they ask what a case can hold, THEN
   * they are told.*
   *
   * **Read out of the same anonymous fetch as everything else here**, because
   * the question is what the *open* door says: `/api/specs`, which is where an
   * analyst reads field specs, answers 401.
   *
   * The vocabulary is the half worth asserting beyond the field names. *What
   * each field accepts* is the requirement's wording, and a document listing
   * `severity` without its five values tells a client author the name and
   * nothing they can act on.
   */
  it('tells an anonymous caller what a case can hold, and what a field takes', async () => {
    const doc = JSON.parse(before['/api/openapi.json']!) as {
      components?: { schemas?: Record<string, { properties?: Record<string, unknown> }> }
    }
    const shape = doc.components?.schemas?.['CaseDto_Output']
    expect(shape, 'the open document does not describe a case at all').toBeDefined()

    const fields = Object.keys(shape!.properties ?? {})
    expect(fields.length, 'a case is described with almost no fields').toBeGreaterThan(10)
    expect(fields).toContain('severity')

    const severity = JSON.stringify(shape!.properties?.['severity'] ?? {})
    expect(
      severity,
      'the document names the field and not what it accepts, so a caller is told half of it',
    ).toContain('critical')
  })

  it('takes the template the operator added', async () => {
    const made = await fetch(`${harness!.base}/api/library/templates`, {
      method: 'POST',
      headers: { cookie: admin.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ label: ADDED, description: 'Added by this test.' }),
    })
    const body = await made.text()
    expect(made.status, `creating the template answered ${body}`).toBe(200)
  })

  it('shows it to a caller who has a session, so the door below is a choice', async () => {
    const listed = await fetch(`${harness!.base}/api/library/templates`, {
      headers: { cookie: admin.cookie },
    })
    expect(listed.status).toBe(200)
    expect(
      await listed.text(),
      'the template is not visible even to a signed-in caller, so its absence from the ' +
        'open door says nothing',
    ).toContain(ADDED)
  })

  it('says exactly what it said before the install was extended', async () => {
    const after = await openDoor()

    for (const path of Object.keys(before)) {
      expect(
        after[path],
        `${path} moved when an operator added a template, so an anonymous caller can tell ` +
          'this install from a fresh one of the same version',
      ).toBe(before[path])
    }
  })
})
