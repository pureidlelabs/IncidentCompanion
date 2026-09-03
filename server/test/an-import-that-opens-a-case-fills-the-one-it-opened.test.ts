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
 * **What this does not cover:** the failing half of the same requirement. The
 * case is created in one transaction and filled in another, and
 * `import.controller.ts` documents the seam -- *a failure after that leaves an
 * empty case rather than nothing* -- so a failure does leave a case. -> #50
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

const INCIDENT = {
  key: 'an-import-that-opens-a-case',
  title: 'Suspicious sign-in followed by lateral movement',
  alerts: [],
  entities: [host(KEPT), host(DECLINED)],
}

const TITLE = 'A case an import opened for itself'

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
      severity: 'medium',
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
})
