/**
 * A report sent through the app, then written to through every route the app
 * serves, each as a browser would send it.
 *
 * Every refusal is the same 409 naming the report and its stamp, so a client
 * can say "sent at X" wherever it lands, and the parts are what was sent.
 */
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

  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)
    call = caller(harness, admin)
    caseId = await aCase(call, 'A report is filed')
    const draft = await aDraft(call, caseId, ['Summary', 'Findings'])
    const other = await aDraft(call, caseId, ['Elsewhere'])
    elsewhere = other.blocks[0]!
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
      () => call(`/cases/${caseId}/report_blocks/order`, 'POST', { ids: [parts[1]!.id, parts[0]!.id] }),
    ],
    [
      'a draft part is moved into it',
      () => call(`/cases/${caseId}/report_blocks/${elsewhere.id}`, 'PATCH', { version: elsewhere.version, reportId: sent.id }),
    ],
    ['it is renamed', () => call(`/cases/${caseId}/reports/${sent.id}`, 'PATCH', { version: sent.version, label: 'Renamed' })],
    ['it is deleted', () => call(`/cases/${caseId}/reports/${sent.id}?version=${String(sent.version)}`, 'DELETE')],
    ['its missing sections are restored', () => call(`/cases/${caseId}/reports/${sent.id}/restore-sections`, 'POST')],
    ['it is sent again', () => call(`/cases/${caseId}/reports/${sent.id}/send`, 'POST')],
  ]

  it.each(doors)('answers 409 naming the report and its stamp when %s', async (_what, write) => {
    const answered = await write()
    const body = (await answered.json()) as { reportId?: string; sentAt?: string }
    expect({ status: answered.status, reportId: body.reportId }).toEqual({ status: 409, reportId: sent.id })
    expect(Number.isNaN(Date.parse(body.sentAt ?? ''))).toBe(false)
  })

  it('holds the parts that were sent, and no others', async () => {
    expect(await blocksOf(call, caseId, sent.id)).toEqual(parts)
  })
})
