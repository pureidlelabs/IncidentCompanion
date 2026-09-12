/**
 * An import asked to open a case and fill it produces a case holding what the
 * analyst approved, and nothing they did not.
 *
 * *Where an import is asked to create the case as well as fill it, creating the
 * case and filling it MUST be one act.*
 *
 * > #### Scenario: An import asked to create a case succeeds
 * > - GIVEN an import asked to create a case and fill it
 * > - WHEN it succeeds
 * > - THEN the case exists and holds what was approved
 *
 * **Driven through both doors in the order an analyst uses them**, because the
 * candidate ids the approval names are minted by the preview and mean nothing
 * apart from it. A test that invented an id would be asserting against its own
 * fixture.
 *
 * **Approval is partial on purpose.** One of the two hosts is left out, so the
 * case is asserted to hold what was approved rather than to hold everything the
 * incident carried -- which a commit ignoring the approval list entirely would
 * also satisfy.
 *
 * **The case is read back through the API rather than the database**, since the
 * requirement is that the case *exists* -- a row nothing serves is not a case an
 * analyst can pick up.
 *
 * **The failing half is below**, and it is driven at the seam that used to
 * leave the case behind: the timeline write, which runs after the entities have
 * landed. A correction the timeline's own schema refuses is the deterministic
 * way to reach it from outside.
 */
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAdmin, type Harness, type Persona } from './app-harness.js'
import { cases } from '../src/db/schema/case.js'
import { openTestPool } from './database.js'

/** One incident naming two hosts, of which the analyst will take one. */
const KEPT = 'WKS-THE-ANALYST-APPROVED'
const DECLINED = 'WKS-THE-ANALYST-LEFT-OUT'

const host = (name: string) => ({
  kind: 'Host',
  properties: { hostName: name, dnsDomain: 'example.test' },
})

/** The provider's spelling, which this product's vocabulary refuses verbatim. */
const REPORTED_SEVERITY = 'High'
const MARKED = 'high'

const INCIDENT = {
  key: 'an-import-that-opens-a-case',
  title: 'Suspicious sign-in followed by lateral movement',
  severity: REPORTED_SEVERITY,
  alerts: [],
  entities: [host(KEPT), host(DECLINED)],
}

const TITLE = 'A case an import opened for itself'

/**
 * One that produces a timeline candidate as well as entities, so a correction
 * can be refused at the second write rather than the first.
 */
const WITH_AN_ALERT = {
  key: 'an-import-that-fails-halfway',
  title: 'Lateral movement following a phish',
  severity: 'Medium',
  alerts: [
    {
      id: 'alert-1',
      name: 'alert-1',
      properties: {
        alertDisplayName: 'Lateral movement following a phish',
        severity: 'High',
        tactics: ['LateralMovement'],
        timeGenerated: '2026-08-10T12:00:00Z',
      },
    },
  ],
  entities: [host('WKS-THE-IMPORT-WROTE-FIRST')],
}

let harness: Harness | null = null
let admin: Persona
let pool: ReturnType<typeof openTestPool> | null = null
let caseId = ''

const post = async (path: string, body: unknown) => {
  const answer = await fetch(`${harness!.base}${path}`, {
    method: 'POST',
    headers: { cookie: admin.cookie, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const said = await answer.text()
  return { status: answer.status, said, body: said ? (JSON.parse(said) as unknown) : null }
}

describe.skipIf(!(await bootable()))('an import asked to open a case and fill it', () => {
  let approved: string[] = []
  let offered: { id: string; collection: string; fields: Record<string, unknown> }[] = []

  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)
    pool = openTestPool(process.env['SEED_DATABASE_URL'] ?? process.env['DATABASE_URL']!, 'ic_seed')

    const seen = await post('/api/imports/preview', {
      provider: 'sentinel',
      incidents: [INCIDENT],
    })
    expect(seen.status, `the preview was refused: ${seen.said}`).toBe(200)

    offered = (seen.body as { entities: typeof offered }).entities
    approved = offered
      .filter((one) => JSON.stringify(one.fields).includes(KEPT))
      .map((one) => one.id)
  }, 120_000)

  afterAll(async () => {
    if (pool && caseId !== '') {
      await drizzle({ client: pool }).delete(cases).where(eq(cases.id, caseId))
    }
    await pool?.end()
    await harness?.close()
  })

  it('offers both hosts, so approving one of them is a choice', () => {
    const names = JSON.stringify(offered)

    expect(approved.length, `the preview offered no candidate carrying ${KEPT}`).toBe(1)
    expect(
      names.includes(DECLINED),
      `the preview never offered ${DECLINED}, so leaving it out of the approval decides nothing`,
    ).toBe(true)
  })

  it('opens the case and answers with it', async () => {
    const started = await post('/api/imports/case', {
      provider: 'sentinel',
      title: TITLE,
      incidents: [INCIDENT],
      approved,
      edits: [],
    })
    expect(started.status, `the import would not open a case: ${started.said}`).toBe(201)

    caseId = (started.body as { caseId: string }).caseId
    expect(caseId, 'the import answered without naming the case it opened').toBeTruthy()
  })

  it('holds what was approved, and only that', async () => {
    const answer = await fetch(`${harness!.base}/api/cases/${caseId}/systems`, {
      headers: { cookie: admin.cookie },
    })
    const rows = (await answer.json()) as { hostname?: string }[]

    expect(answer.status, 'the case the import opened cannot be read').toBe(200)
    expect(
      rows.map((row) => row.hostname),
      'the case does not hold the host the analyst approved, so the import opened a case and ' +
        'did not fill it',
    ).toContain(KEPT)
    expect(
      rows.map((row) => row.hostname),
      'the case holds a host the analyst left out, so the approval decided nothing',
    ).not.toContain(DECLINED)
  })

  it('is the case the analyst asked for, not one the import named itself', async () => {
    const answer = await fetch(`${harness!.base}/api/cases/${caseId}`, {
      headers: { cookie: admin.cookie },
    })
    const kase = (await answer.json()) as { title?: string }

    expect(kase.title, 'the case carries a title nobody asked for').toBe(TITLE)
  })

  /**
   * *Creating the case and filling it MUST be one act. A failure MUST leave no
   * case.*
   *
   * **Driven at the second write.** The entities are written, then the timeline
   * rows are built and one of them is refused by the timeline's own schema.
   *
   * **The title is the assertion's handle**, because a refused create answers
   * no id: the only way to ask whether a case was left behind is to look for
   * one nobody else would have made.
   *
   * **What this establishes, and what it does not.** It shows the act fails at
   * the timeline schema and that no case survives; the tests above show the
   * same payload otherwise opens a case and fills it. It does not observe the
   * entity rows existing and then going -- nothing outside the transaction can,
   * which is the point of the transaction. So a refusal moved ahead of the case
   * insert would satisfy this test while proving something weaker, and the
   * assertion on the refused field is what makes that visible rather than
   * silent.
   */
  it('leaves no case behind when the import fails after the case was created', async () => {
    const TITLE_OF_THE_FAILURE = 'A case whose import was refused halfway'

    const plan = await post('/api/imports/preview', {
      provider: 'sentinel',
      incidents: [WITH_AN_ALERT],
    })
    expect(plan.status, `the preview was refused: ${plan.said}`).toBe(200)
    const offered = plan.body as { entities: { id: string }[]; timeline: { id: string }[] }
    const entry = offered.timeline[0]?.id
    expect(entry, 'the incident produced no timeline candidate to refuse').toBeTruthy()

    const refused = await post('/api/imports/case', {
      provider: 'sentinel',
      title: TITLE_OF_THE_FAILURE,
      incidents: [WITH_AN_ALERT],
      approved: [...offered.entities.map((one) => one.id), ...offered.timeline.map((one) => one.id)],
      // Outside the served vocabulary, so the timeline's own schema refuses it
      // -- after `createAcross` has written the entities. -> `edits.test.ts`
      edits: [{ id: entry!, field: 'severity', value: 'Critical' }],
    })

    expect(
      refused.status,
      `the refused correction did not refuse the import: ${refused.said}`,
    ).toBe(422)

    /**
     * **Which write refused, not merely that one did.** The whole claim is that
     * the case and its entity rows already existed when the act failed; a
     * refusal raised before the case insert would leave no case either, and
     * satisfy every other assertion here while proving nothing. `severity`
     * belongs to the timeline's schema, and the timeline is written after the
     * entities.
     */
    expect(
      JSON.stringify(refused.body),
      'the import was refused by something other than the timeline correction, so the ' +
        'failure may have happened before the case was ever written',
    ).toContain('severity')

    const all = (await (
      await fetch(`${harness!.base}/api/cases`, { headers: { cookie: admin.cookie } })
    ).json()) as { id: string; title: string }[]
    const wreckage = all.filter((one) => one.title === TITLE_OF_THE_FAILURE)

    // Leave nothing behind if the assertion is about to fail, or every later
    // run of this suite inherits the case this one is complaining about.
    if (pool && wreckage.length > 0) {
      const db = drizzle({ client: pool })
      for (const one of wreckage) await db.delete(cases).where(eq(cases.id, one.id))
    }

    expect(
      wreckage.map((one) => one.title),
      'the import failed and left its case in every list, indistinguishable from one an ' +
        'analyst opened and abandoned',
    ).toEqual([])
  })

  /**
   * **Read back through the API, because a level nothing serves is one no
   * analyst sees.** The browser never sent a severity: this is the payload's
   * own word, mapped by the tier that owns the provider's vocabulary.
   */
  it('carries the severity the provider reported, in this vocabulary', async () => {
    const answer = await fetch(`${harness!.base}/api/cases/${caseId}`, {
      headers: { cookie: admin.cookie },
    })
    const kase = (await answer.json()) as { severity?: string | null }

    expect(
      kase.severity,
      `the incident was reported ${REPORTED_SEVERITY} and the case it opened is marked ` +
        `${String(kase.severity)}, so the case lost what the provider already knew`,
    ).toBe(MARKED)
  })
})
