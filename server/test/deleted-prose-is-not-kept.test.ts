/**
 * Text an analyst deletes, and a section they remove, are gone from the stored
 * record, so no door that reads it afterwards can hand them out.
 *
 * Read through the seeding role, beneath every door, so a projection at one of
 * them cannot hide a record that still holds the text.
 */
import { randomUUID } from 'node:crypto'

import { drizzle } from 'drizzle-orm/node-postgres'
import { eq, inArray } from 'drizzle-orm'
import * as encoding from 'lib0/encoding'
import { writeUpdate } from 'y-protocols/sync'
import * as Y from 'yjs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAdmin, sharedAnalyst, type Harness, type Persona } from './app-harness.js'
import { as } from './acting.js'
import { openTestPool } from './database.js'
import { Live, textOf } from './report-writers.js'
import { cases } from '../src/db/schema/case.js'
import { reports } from '../src/db/schema/report.js'
import { caseNotes } from '../src/db/schema/tracker.js'
import { NOTE_FRAGMENT, ProseService, reportDocument, type ProseRecord } from '../src/prose/prose.service.js'
import { fragmentFor } from '../src/domain/prose-fields.js'
import { actingAs } from '../src/db/scope.js'

const STAMP = String(Date.now())
const DELETED = `a customer's secret pasted by mistake ${STAMP}`
const REMOVED = `a section the analyst removed ${STAMP}`
const LATE = `typed offline into a section since removed ${STAMP}`
const KEPT = `a finding nobody removed ${STAMP}`

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
    const prose = as(analyst.id, harness.app.get(ProseService, { strict: false }))
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

  it('gives the next reader none of the text an analyst deleted over the live connection', async () => {
    const report = await json<{ id: string }>('POST', `/api/cases/${caseId}/reports`, { label: 'Typed live' })
    const block = await json<{ id: string }>('POST', `/api/cases/${caseId}/report_blocks`, {
      reportId: report.id,
      kind: 'written',
      position: 0,
    })
    const field = `reports:${report.id}:document`
    const writer = await Live.open(harness, analyst, caseId)
    const typing = new Y.Doc()
    await writer.openField(field, typing)
    typing.on('update', (update: Uint8Array) => {
      const encoder = encoding.createEncoder()
      writeUpdate(encoder, update)
      writer.send({ type: 'prose.sync', field, update: Buffer.from(encoding.toUint8Array(encoder)).toString('base64') })
    })
    const text = new Y.XmlText()
    const paragraph = new Y.XmlElement('paragraph')
    paragraph.insert(0, [text])
    fragmentFor(typing, block.id).insert(0, [paragraph])
    text.insert(0, DELETED)
    text.delete(0, DELETED.length)
    text.insert(0, KEPT)
    // The reader arrives while the writer still holds the document open.
    const reader = await Live.open(harness, await sharedAdmin(harness), caseId)
    await reader.openField(field, new Y.Doc())
    const served = reader.frames.find((frame) => frame.type === 'prose.sync' && frame.field === field)
    await reader.close()
    await writer.close()

    const stored = async () =>
      (await seed.select({ document: reports.document }).from(reports).where(eq(reports.id, report.id)))[0]?.document
    await expect.poll(async () => textOf((await stored()) ?? null, block.id), { timeout: 10_000 }).toContain(KEPT)

    expect({
      record: Buffer.from((await stored())!).toString('utf8').includes(DELETED),
      reader: Buffer.from(served!.update!, 'base64').toString('utf8').includes(DELETED),
      readerSees: Buffer.from(served!.update!, 'base64').toString('utf8').includes(KEPT),
    }).toEqual({ record: false, reader: false, readerSees: true })
  }, 60_000)

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

  it('keeps every section when the flush is asked for by somebody who reaches nothing', async () => {
    const report = await json<{ id: string }>('POST', `/api/cases/${caseId}/reports`, { label: 'Kept' })
    const block = await json<{ id: string }>('POST', `/api/cases/${caseId}/report_blocks`, {
      reportId: report.id,
      kind: 'written',
      position: 0,
    })
    const address = reportDocument(report.id)
    const prose = as(analyst.id, harness.app.get(ProseService, { strict: false }))
    const doc = await prose.open(caseId, address)
    const paragraph = new Y.XmlElement('paragraph')
    paragraph.insert(0, [new Y.XmlText(KEPT)])
    fragmentFor(doc, block.id).insert(0, [paragraph])

    await actingAs(randomUUID(), () => harness.app.get(ProseService, { strict: false }).flush(caseId, address))
    await prose.release(caseId, address)

    const [row] = await seed.select({ document: reports.document }).from(reports).where(eq(reports.id, report.id))
    expect(Buffer.from(row!.document ?? []).toString('utf8')).toContain(KEPT)
  })

  it('keeps nothing typed into a section after it was removed', async () => {
    const report = await json<{ id: string }>('POST', `/api/cases/${caseId}/reports`, { label: 'Late words' })
    const block = await json<{ id: string; version: number }>('POST', `/api/cases/${caseId}/report_blocks`, {
      reportId: report.id,
      kind: 'written',
      position: 0,
    })
    const address = reportDocument(report.id)
    const prose = as(analyst.id, harness.app.get(ProseService, { strict: false }))
    // A client synced with the section, then offline while it is removed.
    const server = await prose.open(caseId, address)
    const client = new Y.Doc()
    Y.applyUpdate(client, Y.encodeStateAsUpdate(server))
    await json('DELETE', `/api/cases/${caseId}/report_blocks/${block.id}?version=${String(block.version)}`)
    const before = Y.encodeStateVector(client)
    const paragraph = new Y.XmlElement('paragraph')
    paragraph.insert(0, [new Y.XmlText(LATE)])
    fragmentFor(client, block.id).insert(0, [paragraph])
    const encoder = encoding.createEncoder()
    writeUpdate(encoder, Y.encodeStateAsUpdate(client, before))

    await prose.apply(caseId, address, encoding.toUint8Array(encoder), 'a-socket', { id: analyst.id, label: 'A', headers: {} })
    await prose.flush(caseId, address)
    await prose.release(caseId, address)

    const [row] = await seed.select({ document: reports.document }).from(reports).where(eq(reports.id, report.id))
    expect(Buffer.from(row!.document ?? []).toString('utf8')).not.toContain(LATE)
  })

  /** A report, one section removed while a client typed into it offline, and that late edit applied. */
  async function lateEditIntoARemovedSection(label: string, words: string) {
    const report = await json<{ id: string }>('POST', `/api/cases/${caseId}/reports`, { label })
    const block = await json<{ id: string; version: number }>('POST', `/api/cases/${caseId}/report_blocks`, {
      reportId: report.id,
      kind: 'written',
      position: 0,
    })
    const address = reportDocument(report.id)
    const prose = as(analyst.id, harness.app.get(ProseService, { strict: false }))
    const server = await prose.open(caseId, address)
    const client = new Y.Doc()
    Y.applyUpdate(client, Y.encodeStateAsUpdate(server))
    await json('DELETE', `/api/cases/${caseId}/report_blocks/${block.id}?version=${String(block.version)}`)
    const before = Y.encodeStateVector(client)
    const paragraph = new Y.XmlElement('paragraph')
    paragraph.insert(0, [new Y.XmlText(words)])
    fragmentFor(client, block.id).insert(0, [paragraph])
    const encoder = encoding.createEncoder()
    writeUpdate(encoder, Y.encodeStateAsUpdate(client, before))
    await prose.apply(caseId, address, encoding.toUint8Array(encoder), 'a-socket', { id: analyst.id, label: 'A', headers: {} })
    return { report, address, prose }
  }

  it('seals a report for sending straight after a late edit into a removed section, without that edit', async () => {
    const words = `sealed at once ${STAMP}`
    const { report, address, prose } = await lateEditIntoARemovedSection('Sent at once', words)

    const sealed = await prose.seal(caseId, report.id).then(
      async (seal) => {
        const sent = Buffer.from(seal.bytes).toString('utf8')
        await seal.settle(null)
        return sent.includes(words) ? 'sealed with the removed section' : 'sealed'
      },
      (error: unknown) => String(error),
    )
    await prose.release(caseId, address)

    expect(sealed).toBe('sealed')
  })
})
