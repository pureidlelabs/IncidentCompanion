/**
 * The batch door the Sentinel importer writes its timeline through.
 *
 * **The route did not exist and 2,602 lines of shipped feature posted to it.**
 * `useImportPlanSubmit.ts` sends `POST /cases/{id}/timeline/bulk` after
 * writing the entities, and `timeline.controller.ts` mounted `@Post()` alone --
 * so the wizard ran to its last step, wrote every entity, and 404'd on the
 * entries that give them meaning.
 *
 * **Driven through the app rather than the controller**, because the defect was
 * a route that was never mounted: `timeline.write.test.ts` constructs the
 * controller directly, and a call to a method that exists cannot see a missing
 * `@Post('bulk')`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAdmin, type Harness, type Persona } from './app-harness.js'

const runnable = await bootable()

describe.skipIf(!runnable)('writing a batch of timeline entries', () => {
  let harness: Harness
  let admin: Persona
  let caseId: string

  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)
    const created = await fetch(`${harness.base}/api/cases`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: admin.cookie },
      body: JSON.stringify({ title: 'Timeline bulk', customer: 'Bulk Ltd' }),
    })
    caseId = ((await created.json()) as { id: string }).id
  }, 120_000)

  afterAll(async () => {
    await harness.close()
  })

  const bulk = (entries: unknown[]) =>
    fetch(`${harness.base}/api/cases/${caseId}/timeline/bulk`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: admin.cookie },
      body: JSON.stringify({ entries }),
    })

  it('writes every entry and answers the ids in the order sent', async () => {
    const answer = await bulk([
      { kind: 'event', description: 'First contact', time: '2026-08-10T12:00:00Z' },
      { kind: 'action', description: 'Contained DC-01' },
    ])

    expect(answer.status, 'the importer posts here and got a 404').toBe(201)
    const { ids } = (await answer.json()) as { ids: string[] }
    expect(ids).toHaveLength(2)

    const listed = (await (
      await fetch(`${harness.base}/api/cases/${caseId}/timeline`, {
        headers: { cookie: admin.cookie },
      })
    ).json()) as { id: string; description: string }[]

    /**
     * **Positional, which is the whole of what the name claims.** An importer
     * maps its own rows to these ids by index, so an answer in any other order
     * attributes each row's id to a different row -- silently, and the case
     * then holds provenance pointing at the wrong entries.
     *
     * Read through the ids rather than off the listing, so the timeline's own
     * ordering is not on trial here: one of these entries carries no time.
     */
    const describing = new Map(listed.map((one) => [one.id, one.description]))
    expect(ids.map((id) => describing.get(id))).toEqual(['First contact', 'Contained DC-01'])
  }, 60_000)

  /**
   * **The stamp the client cannot make, which is why the client's failed.**
   * `provenance` and `unreviewed` are in the timeline's `OWNED` set, so the
   * strict write schema refuses a row that asserts either -- and the importer
   * asserted both, on the argument that nothing downstream would. This door is
   * that downstream, and a caller able to claim `imported` is exactly what the
   * omission exists to prevent.
   */
  it('stamps an imported entry as imported and unreviewed', async () => {
    const answer = await bulk([{ kind: 'event', description: 'Stamped by the server' }])
    expect(answer.status).toBe(201)

    const listed = (await (
      await fetch(`${harness.base}/api/cases/${caseId}/timeline`, {
        headers: { cookie: admin.cookie },
      })
    ).json()) as { description: string; provenance?: string; unreviewed?: boolean }[]
    const written = listed.find((one) => one.description === 'Stamped by the server')

    expect(written?.provenance, 'an imported row that reads as typed is unfindable').toBe('imported')
    expect(written?.unreviewed).toBe(true)
  }, 60_000)

  /**
   * **The same schema as the single create, or this is the way around it.**
   * A batch door that validated more loosely is how a rule the single write
   * enforces stops being a rule.
   */
  it('refuses the whole batch when one entry names a field the timeline lacks', async () => {
    const before = (await (
      await fetch(`${harness.base}/api/cases/${caseId}/timeline`, {
        headers: { cookie: admin.cookie },
      })
    ).json()) as unknown[]

    const answer = await bulk([
      { kind: 'event', description: 'Fine on its own' },
      { kind: 'event', description: 'Stamped', source: 'sentinel-import' },
    ])
    expect(answer.status).toBe(422)

    const after = (await (
      await fetch(`${harness.base}/api/cases/${caseId}/timeline`, {
        headers: { cookie: admin.cookie },
      })
    ).json()) as unknown[]
    expect(after.length, 'a batch is all or nothing').toBe(before.length)
  }, 60_000)
})
