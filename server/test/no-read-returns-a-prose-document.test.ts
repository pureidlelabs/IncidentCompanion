/**
 * No HTTP answer carries a report's or a note's prose document.
 *
 * The editor reads prose over the socket, so a document in a row answer is
 * something nobody asked for, and it carries every deletion the record keeps.
 */
import { drizzle } from 'drizzle-orm/node-postgres'
import { inArray } from 'drizzle-orm'
import * as Y from 'yjs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAnalyst, type Harness, type Persona } from './app-harness.js'
import { openTestPool } from './database.js'
import { cases } from '../src/db/schema/case.js'
import { NOTE_FRAGMENT, ProseService, reportDocument, type ProseRecord } from '../src/prose/prose.service.js'
import { fragmentFor } from '../src/domain/prose-fields.js'

/** Every path under `value` that names a `document`. */
function documentsIn(value: unknown, path = '$'): string[] {
  if (Array.isArray(value)) return value.flatMap((one, at) => documentsIn(one, `${path}[${String(at)}]`))
  if (value === null || typeof value !== 'object') return []
  return Object.entries(value).flatMap(([key, one]) => [
    ...(key === 'document' ? [`${path}.document`] : []),
    ...documentsIn(one, `${path}.${key}`),
  ])
}

describe.skipIf(!(await bootable()))('what a read of prose-bearing rows answers', () => {
  let harness: Harness
  let analyst: Persona
  let caseId = ''
  const answers: Record<string, unknown> = {}
  let csvHeader = ''

  async function answer(label: string, method: string, path: string, body?: unknown) {
    const response = await fetch(`${harness.base}${path}`, {
      method,
      headers: { cookie: analyst.cookie, 'content-type': 'application/json', origin: harness.origin },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const text = await response.text()
    expect(response.status, `${label}: ${text}`).toBeLessThan(300)
    answers[label] = JSON.parse(text) as unknown
    return answers[label] as { id: string; version: number }
  }

  async function write(address: ProseRecord, fragment: string, words: string) {
    const prose = harness.app.get(ProseService, { strict: false })
    const doc = await prose.open(caseId, address)
    const paragraph = new Y.XmlElement('paragraph')
    paragraph.insert(0, [new Y.XmlText(words)])
    fragmentFor(doc, fragment).insert(0, [paragraph])
    await prose.flush(caseId, address)
    await prose.release(caseId, address)
  }

  beforeAll(async () => {
    harness = await boot()
    analyst = await sharedAnalyst(harness)
    caseId = (await answer('create case', 'POST', '/api/cases', { title: 'Prose on the wire' })).id

    const report = await answer('create report', 'POST', `/api/cases/${caseId}/reports`, { label: 'Draft' })
    const block = await answer('create block', 'POST', `/api/cases/${caseId}/report_blocks`, {
      reportId: report.id,
      kind: 'written',
      position: 0,
    })
    await write(reportDocument(report.id), block.id, 'Findings so far.')
    const note = await answer('create note', 'POST', `/api/cases/${caseId}/casenotes`, { note: 'first words' })
    await write({ table: 'casenotes', id: note.id }, NOTE_FRAGMENT, ' and more.')

    const [storedReport] = (await answer('list reports', 'GET', `/api/cases/${caseId}/reports`)) as unknown as {
      version: number
    }[]
    await answer('patch report', 'PATCH', `/api/cases/${caseId}/reports/${report.id}`, {
      version: storedReport!.version,
      label: 'Handover',
    })
    const [storedNote] = (await answer('list notes', 'GET', `/api/cases/${caseId}/casenotes`)) as unknown as {
      version: number
    }[]
    await answer('patch note', 'PATCH', `/api/cases/${caseId}/casenotes/${note.id}`, {
      version: storedNote!.version,
      tags: 'handover',
    })
    await answer('read case', 'GET', `/api/cases/${caseId}`)
    const csv = await fetch(`${harness.base}/api/cases/${caseId}/casenotes.csv`, { headers: { cookie: analyst.cookie } })
    expect(csv.status).toBe(200)
    csvHeader = (await csv.text()).split('\n')[0] ?? ''
  }, 120_000)

  afterAll(async () => {
    const pool = openTestPool(process.env['SEED_DATABASE_URL'] ?? process.env['DATABASE_URL']!, 'ic_seed')
    if (caseId) await drizzle({ client: pool }).delete(cases).where(inArray(cases.id, [caseId]))
    await pool.end()
    await harness?.close()
  })

  it('carries no prose document in any answer', () => {
    const carried = Object.entries(answers).flatMap(([label, body]) =>
      documentsIn(body).map((path) => `${label}: ${path}`),
    )

    expect(carried).toEqual([])
  })

  it('exports no prose document in a note CSV', () => {
    expect(csvHeader.split(',')).not.toContain('document')
  })
})
