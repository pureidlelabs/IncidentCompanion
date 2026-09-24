/**
 * A report sent through the app, then written to through every route the app
 * serves, each as a browser would send it.
 *
 * Every refusal is the same 409 naming the report and its stamp, so a client
 * can say "sent at X" wherever it lands, and the install's audit records the
 * refusal with that status. The parts are what was sent.
 */
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAdmin, type Harness, type Persona } from './app-harness.js'
import { aCase, aDraft, blocksOf, caller, type Block, type Call } from './report-writers.js'

const runnable = await bootable()

describe.skipIf(!runnable)('a sent report, written to through the app', () => {
  let harness: Harness
  let admin: Persona
  let call: Call
  let caseId: string
  let sent: { id: string; version: number }
  let parts: Block[]
  let elsewhere: Block
  let corrected: { id: string; version: number }

  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)
    call = caller(harness, admin)
    caseId = await aCase(call, 'A report is filed')
    const draft = await aDraft(call, caseId, ['Summary', 'Findings'])
    const other = await aDraft(call, caseId, ['Elsewhere'])
    elsewhere = other.blocks[0]!
    const earlier = await aDraft(call, caseId, ['Earlier'])
    corrected = (await (await call(`/cases/${caseId}/reports/${earlier.id}`)).json()) as { id: string; version: number }
    const owner = new Client({ connectionString: process.env.TEST_DATABASE_URL })
    await owner.connect()
    await owner.query('update reports set supersedes = $1 where id = $2', [corrected.id, draft.id])
    await owner.end()
    const answered = await call(`/cases/${caseId}/reports/${draft.id}/send`, 'POST')
    expect(answered.ok, await answered.text()).toBe(true)
    const row = (await (await call(`/cases/${caseId}/reports/${draft.id}`)).json()) as { version: number }
    sent = { id: draft.id, version: row.version }
    parts = await blocksOf(call, caseId, sent.id)
  }, 120_000)

  afterAll(async () => {
    await harness?.close()
  })

  const doors: [string, () => Promise<Response>][] = [
    ['a part is added', () => call(`/cases/${caseId}/report_blocks`, 'POST', { reportId: sent.id, heading: 'Later' })],
    [
      'parts are added in bulk',
      () => call(`/cases/${caseId}/report_blocks/bulk`, 'POST', { entries: [{ reportId: sent.id, heading: 'Later' }] }),
    ],
    [
      'a part is rewritten',
      () => call(`/cases/${caseId}/report_blocks/${parts[0]!.id}`, 'PATCH', { version: parts[0]!.version, heading: 'Rewritten' }),
    ],
    [
      'parts are rewritten in bulk',
      () =>
        call(`/cases/${caseId}/report_blocks/bulk`, 'PATCH', {
          ids: parts.map(({ id, version }) => ({ id, version })),
          fields: { heading: 'Rewritten' },
        }),
    ],
    ['a part is removed', () => call(`/cases/${caseId}/report_blocks/${parts[0]!.id}?version=${String(parts[0]!.version)}`, 'DELETE')],
    [
      'its parts are reordered',
      () =>
        call(`/cases/${caseId}/report_blocks/order`, 'POST', {
          rows: [parts[1]!, parts[0]!].map(({ id, version }) => ({ id, version })),
        }),
    ],
    [
      'a draft part is moved into it',
      () => call(`/cases/${caseId}/report_blocks/${elsewhere.id}`, 'PATCH', { version: elsewhere.version, reportId: sent.id }),
    ],
    ['it is renamed', () => call(`/cases/${caseId}/reports/${sent.id}`, 'PATCH', { version: sent.version, label: 'Renamed' })],
    ['it is deleted', () => call(`/cases/${caseId}/reports/${sent.id}?version=${String(sent.version)}`, 'DELETE')],
    ['its missing sections are restored', () => call(`/cases/${caseId}/reports/${sent.id}/restore-sections`, 'POST')],
    ['it is sent again', () => call(`/cases/${caseId}/reports/${sent.id}/send`, 'POST')],
    [
      'the draft it corrects is deleted',
      () => call(`/cases/${caseId}/reports/${corrected.id}?version=${String(corrected.version)}`, 'DELETE'),
    ],
  ]

  it.each(doors)('answers 409 naming the report and its stamp when %s', async (_what, write) => {
    const answered = await write()
    const body = (await answered.json()) as { reportId?: string; sentAt?: string }
    expect({ status: answered.status, reportId: body.reportId }).toEqual({ status: 409, reportId: sent.id })
    expect(Number.isNaN(Date.parse(body.sentAt ?? ''))).toBe(false)
  })

  it('records every refused write in the audit with the status it answered', async () => {
    const owner = new Client({ connectionString: process.env.TEST_DATABASE_URL })
    await owner.connect()
    try {
      const since = (await owner.query<{ at: Date }>('select clock_timestamp() as at')).rows[0]!.at
      const answered = await doors[2]![1]()
      await new Promise((wake) => setTimeout(wake, 300))
      const { rows } = await owner.query<{ detail: { status?: string } }>(
        `select detail from install_activity where at >= $1 and target_label like 'PATCH %report_blocks%'`,
        [since],
      )
      expect(answered.status).toBe(409)
      expect(rows.map((row) => row.detail.status)).toEqual(['409'])
    } finally {
      await owner.end()
    }
  })

  it('holds the parts that were sent, and no others, and still names what it corrects', async () => {
    expect(await blocksOf(call, caseId, sent.id)).toEqual(parts)
    const row = (await (await call(`/cases/${caseId}/reports/${sent.id}`)).json()) as { supersedes: string | null }
    expect(row.supersedes).toBe(corrected.id)
  })
})
