/**
 * Text an analyst deletes, and a section they remove, are gone from the stored
 * record, so no door that reads it afterwards can hand them out.
 *
 * Read through the seeding role, beneath every door, so a projection at one of
 * them cannot hide a record that still holds the text.
 */
import { drizzle } from 'drizzle-orm/node-postgres'
import { eq, inArray } from 'drizzle-orm'
import * as Y from 'yjs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAnalyst, type Harness, type Persona } from './app-harness.js'
import { openTestPool } from './database.js'
import { cases } from '../src/db/schema/case.js'
import { reports } from '../src/db/schema/report.js'
import { caseNotes } from '../src/db/schema/tracker.js'
import { NOTE_FRAGMENT, ProseService, reportDocument, type ProseRecord } from '../src/prose/prose.service.js'
import { fragmentFor } from '../src/domain/prose-fields.js'

const STAMP = String(Date.now())
const DELETED = `a customer's secret pasted by mistake ${STAMP}`
const REMOVED = `a section the analyst removed ${STAMP}`

describe.skipIf(!(await bootable()))('what the stored record keeps of prose', () => {
  let harness: Harness
  let analyst: Persona
  const pool = openTestPool(process.env['SEED_DATABASE_URL'] ?? process.env['DATABASE_URL']!, 'ic_seed')
  const seed = drizzle({ client: pool })
  let caseId = ''

  async function json<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${harness.base}${path}`, {
      method,
      headers: { cookie: analyst.cookie, 'content-type': 'application/json', origin: harness.origin },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const text = await response.text()
    expect(response.status, `${method} ${path}: ${text}`).toBeLessThan(300)
    return (text ? JSON.parse(text) : undefined) as T
  }

  /** Acts on one fragment's text as the editor does, then stores and lets the document go. */
  async function write(address: ProseRecord, fragment: string, acts: (text: Y.XmlText) => void) {
    const prose = harness.app.get(ProseService, { strict: false })
    const doc = await prose.open(caseId, address)
    const paragraph = new Y.XmlElement('paragraph')
    const text = new Y.XmlText()
    paragraph.insert(0, [text])
    fragmentFor(doc, fragment).insert(0, [paragraph])
    acts(text)
    await prose.flush(caseId, address)
    await prose.release(caseId, address)
  }

  beforeAll(async () => {
    harness = await boot()
    analyst = await sharedAnalyst(harness)
    caseId = (await json<{ id: string }>('POST', '/api/cases', { title: `Kept prose ${STAMP}` })).id
  }, 120_000)

  afterAll(async () => {
    if (caseId) await seed.delete(cases).where(inArray(cases.id, [caseId]))
    await pool.end()
    await harness?.close()
  })

  it('keeps no text deleted from a report', async () => {
    const report = await json<{ id: string }>('POST', `/api/cases/${caseId}/reports`, { label: 'Draft' })
    const block = await json<{ id: string }>('POST', `/api/cases/${caseId}/report_blocks`, {
      reportId: report.id,
      kind: 'written',
      position: 0,
    })
    await write(reportDocument(report.id), block.id, (text) => {
      text.insert(0, DELETED)
      text.delete(0, DELETED.length)
      text.insert(0, 'What remains.')
    })

    const [row] = await seed.select({ document: reports.document }).from(reports).where(eq(reports.id, report.id))
    expect(Buffer.from(row!.document!).toString('utf8')).not.toContain(DELETED)
  })

  it('keeps no text deleted from a note', async () => {
    const note = await json<{ id: string }>('POST', `/api/cases/${caseId}/casenotes`, { note: 'first words' })
    await write({ table: 'casenotes', id: note.id }, NOTE_FRAGMENT, (text) => {
      text.insert(0, DELETED)
      text.delete(0, DELETED.length)
    })

    const [row] = await seed.select({ document: caseNotes.document }).from(caseNotes).where(eq(caseNotes.id, note.id))
    expect(Buffer.from(row!.document!).toString('utf8')).not.toContain(DELETED)
  })

  it('keeps nothing of a section once it is removed', async () => {
    const report = await json<{ id: string }>('POST', `/api/cases/${caseId}/reports`, { label: 'Two parts' })
    const block = await json<{ id: string; version: number }>('POST', `/api/cases/${caseId}/report_blocks`, {
      reportId: report.id,
      kind: 'written',
      position: 0,
    })
    await write(reportDocument(report.id), block.id, (text) => text.insert(0, REMOVED))

    await json('DELETE', `/api/cases/${caseId}/report_blocks/${block.id}?version=${String(block.version)}`)

    const [row] = await seed.select({ document: reports.document }).from(reports).where(eq(reports.id, report.id))
    expect(Buffer.from(row!.document ?? []).toString('utf8')).not.toContain(REMOVED)
  })
})
