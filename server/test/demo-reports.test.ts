/**
 * **The demo reports, as the server actually seeds them.**
 *
 * `server/src/demos/reports.test.ts` checks the *data* against the vocabularies it names;
 * this checks that seeding it works - the rows land, the blocks land in order,
 * and the prose comes back out of the CRDT.
 *
 * **The prose is the half a unit test cannot reach.** It is not a column: the
 * seeder builds a Yjs document keyed by block ids that only exist after the
 * blocks are inserted, so nothing about that ordering is visible until a real
 * database has done it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, seedDemoContent, sharedAdmin, type Harness } from './app-harness.js'

const runnable = await bootable()

interface ReportRow {
  id: string
  label: string
  template: string
  status: string
}

describe.skipIf(!runnable)('the reports a demo case is seeded with', () => {
  let harness: Harness
  let cookie: string
  let caseId: string

  beforeAll(async () => {
    harness = await boot()
    await seedDemoContent(harness)
    cookie = (await sharedAdmin(harness)).cookie

    // `GET /api/cases` answers the array itself, not an envelope around it.
    const cases = (await (
      await fetch(`${harness.base}/api/cases`, { headers: { cookie } })
    ).json()) as { id: string; reference?: string | null }[]
    caseId = cases.find((one) => one.reference === 'DEMO-2026-001')?.id ?? ''
  }, 90_000)

  afterAll(async () => {
    await harness?.close()
  })

  const reportsOf = async (): Promise<ReportRow[]> => {
    const answer = await fetch(`${harness.base}/api/cases/${caseId}/reports`, {
      headers: { cookie },
    })
    const body = (await answer.json()) as { rows?: ReportRow[] } | ReportRow[]
    return Array.isArray(body) ? body : (body.rows ?? [])
  }

  it('seeded the guided case at all', () => {
    expect(caseId, 'the guided demo case is not in the picker').not.toBe('')
  })

  it('gives the case the reports the demo declares', async () => {
    const rows = await reportsOf()
    expect(rows.map((row) => row.label)).toEqual(['Customer RCA', 'Shift handover brief'])
  })

  /**
   * **The layout is carried, not defaulted.** A report seeded with an empty
   * template cannot answer what it is missing, since the derivation reads the
   * layout by name.
   */
  it('records which layout each report came from', async () => {
    const rows = await reportsOf()
    for (const row of rows) expect(row.template).not.toBe('')
  })

  /** One of them is filed, which is the half of the lifecycle a draft never shows. */
  it('files the handover brief', async () => {
    const rows = await reportsOf()
    expect(rows.find((row) => row.label === 'Shift handover brief')?.status).toBe('final')
  })

  /**
   * **The written prose survives the round trip into the CRDT.** The seeder
   * writes markdown into a fragment per block; if it keyed the document on the
   * wrong ids the report still has all its sections and every written one is
   * empty - which reads as a half-finished port rather than as a defect.
   */
  it('carries the written prose into the exported document', async () => {
    const rows = await reportsOf()
    const rca = rows.find((row) => row.label === 'Customer RCA')
    const painted = await fetch(
      `${harness.base}/api/cases/${caseId}/report.md?report=${rca!.id}&lang=en`,
      { headers: { cookie } },
    )
    // Read once: a Response body is a stream, and reading it for the failure
    // message consumes the assertion's own copy.
    const text = await painted.text()
    expect(painted.status, text.slice(0, 300)).toBe(200)
    expect(text).toContain('phishing email delivered to two finance mailboxes')
    // A marker rather than a mark means the markdown arrived as literal text.
    /**
     * **The emphasis survives as emphasis, in the right place.** Seeding built
     * the runs in reverse and let the bold bleed to the end of the paragraph;
     * both painted plausible-looking prose, and both are invisible to an
     * assertion that only asks whether the words are present.
     */
    expect(text).toContain('**not** blocked by policy')
  }, 30_000)
})
