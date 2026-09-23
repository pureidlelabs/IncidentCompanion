/**
 * **A worker reads its own copy of a demo, never the seeded one.** Four workers
 * on one demo case let a writer in one empty a reader in another. -> #1065
 */
import { expect, test, type APIRequestContext } from '@playwright/test'

import { CASE_NAME, unpack } from '../src/archive/format.js'
import { demoCase } from './support/app.js'

const REFERENCE = 'DEMO-2026-001'

/** Which collections of a case hold at least one row, read off its archive. */
async function filled(request: APIRequestContext, caseId: string): Promise<string[]> {
  const exported = await request.post(`/api/cases/${caseId}/archive`, { data: {} })
  expect(exported.ok(), `exporting ${caseId} answered ${String(exported.status())}`).toBe(true)
  const { members } = await unpack(await exported.body(), {
    memberBytes: Number.MAX_SAFE_INTEGER,
    totalBytes: Number.MAX_SAFE_INTEGER,
  })
  const record = JSON.parse(Buffer.from(members[CASE_NAME]!).toString('utf8')) as Record<string, unknown>
  return Object.entries(record)
    .filter(([, value]) => Array.isArray(value) && value.length > 0)
    .map(([name]) => name)
    .sort()
}

test('a worker is handed its own copy of the demo, holding every collection the demo fills', async ({
  request,
}) => {
  const mine = await demoCase(request, REFERENCE)
  expect(await demoCase(request, REFERENCE), 'a second ask in one worker made another copy').toBe(mine)

  const rows = (await (await request.get('/api/cases')).json()) as {
    id: string
    reference?: string | null
    isDemo: boolean
  }[]
  const seeded = rows.find((row) => row.isDemo && row.reference === REFERENCE)
  expect(seeded, `no demo case with reference ${REFERENCE} is seeded`).toBeDefined()
  expect(mine, 'the worker was handed the demo every other worker reads').not.toBe(seeded!.id)
  expect(rows.find((row) => row.id === mine)?.isDemo, 'the copy reads as a demo').toBe(false)

  const demos = (await (await request.get('/api/demos')).json()) as { id: string }[]
  expect(demos.map((one) => one.id), 'the copy is offered on the demo screen').not.toContain(mine)

  expect(await filled(request, mine)).toEqual(await filled(request, seeded!.id))
})
