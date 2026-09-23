/**
 * Every act on a report's lifecycle leaves a feed row naming whoever did it,
 * written in the same transaction as the rows it changed.
 *
 * "The same transaction" is read off `xmin`, the id of the transaction that
 * wrote each row version, so a record written a moment later by a second act
 * fails here however close the two are in time.
 */
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAdmin, type Harness, type Persona } from './app-harness.js'
import { aCase, aDraft, caller, type Call } from './report-writers.js'

const runnable = await bootable()

describe.skipIf(!runnable)('the feed a report act leaves', () => {
  let harness: Harness
  let admin: Persona
  let call: Call
  let caseId: string
  let owner: Client

  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)
    call = caller(harness, admin)
    caseId = await aCase(call, 'Every act is recorded')
    owner = new Client({ connectionString: process.env.TEST_DATABASE_URL })
    await owner.connect()
  }, 120_000)

  afterAll(async () => {
    await owner?.end()
    await harness?.close()
  })

  /** Each row's writing transaction beside the transaction of the feed rows naming it. */
  async function recorded(table: 'reports' | 'report_blocks', ids: readonly string[]) {
    const { rows } = await owner.query<{ id: string; wrote: string; fed: string[]; by: string[] }>(
      `select t.id::text, t.xmin::text as wrote,
              array(select f.xmin::text from change_feed f where f.entity = $1 and f.entity_id = t.id::text) as fed,
              array(select f.actor_id from change_feed f where f.entity = $1 and f.entity_id = t.id::text) as by
         from ${table} t where t.id = any($2::uuid[]) order by t.id`,
      [table, ids],
    )
    return rows
  }

  const inTheSameAct = (row: { wrote: string; fed: string[]; by: string[] }) =>
    row.fed.includes(row.wrote) && row.by.includes(admin.id)

  it('records a send', async () => {
    const { id } = await aDraft(call, caseId, ['Summary'])
    expect((await call(`/cases/${caseId}/reports/${id}/send`, 'POST')).ok).toBe(true)

    const rows = await recorded('reports', [id])
    expect(rows.filter((row) => !inTheSameAct(row)), JSON.stringify(rows)).toEqual([])
  })

  it('records a correction, and every part it carries over', async () => {
    const { id } = await aDraft(call, caseId, ['Summary', 'Findings'])
    expect((await call(`/cases/${caseId}/reports/${id}/send`, 'POST')).ok).toBe(true)
    const answered = await call(`/cases/${caseId}/reports/${id}/supersede`, 'POST')
    const { id: successor } = (await answered.json()) as { id: string }
    const { rows: parts } = await owner.query<{ id: string }>('select id from report_blocks where report_id = $1', [successor])

    const rows = [...(await recorded('reports', [successor])), ...(await recorded('report_blocks', parts.map((p) => p.id)))]
    expect(rows).toHaveLength(3)
    expect(rows.filter((row) => !inTheSameAct(row)), JSON.stringify(rows)).toEqual([])
  })

  it('records every section a restore puts back', async () => {
    const made = await call(`/cases/${caseId}/reports`, 'POST', { label: 'Short', template: 'nis2-final' })
    const { id } = (await made.json()) as { id: string }
    const answered = (await (await call(`/cases/${caseId}/reports/${id}/restore-sections`, 'POST')).json()) as {
      restored: unknown[]
    }
    const { rows: parts } = await owner.query<{ id: string }>('select id from report_blocks where report_id = $1', [id])

    const rows = await recorded('report_blocks', parts.map((p) => p.id))
    expect(rows.length, 'the layout restored nothing, so this proves nothing').toBe(answered.restored.length)
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.filter((row) => !inTheSameAct(row)), JSON.stringify(rows)).toEqual([])
  })
})
