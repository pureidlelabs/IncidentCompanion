/**
 * An archive carries each report's and each note's prose as it reads, never how
 * it came to read that way, and reads back no prose document from its record.
 *
 * Attacked from an analyst who deletes text before a handover, removes a
 * section, and turns a section into one no view shows; and from a forged
 * archive whose record plants a note document of its own.
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
import { CASE_NAME, MANIFEST_NAME, PROSE_PREFIX, pack, readArchive } from '../src/archive/format.js'

const STAMP = String(Date.now())
const DELETED = `tenant password pasted by mistake ${STAMP}`
const KEPT = `The attacker used a phished credential ${STAMP}.`
const REMOVED = `a section the analyst removed ${STAMP}`
const HIDDEN = `prose under a section that is no longer written ${STAMP}`
const NOTE_DELETED = `a note line the analyst deleted ${STAMP}`
const NOTE_KEPT = `Mailbox rule found on the CFO account ${STAMP}.`
const PLANTED = `planted by a forged archive ${STAMP}`
const LIMITS = { memberBytes: 64 * 1024 * 1024, totalBytes: 128 * 1024 * 1024 }

describe.skipIf(!(await bootable()))('an archive carries the case as it reads', () => {
  let harness: Harness
  let analyst: Persona
  const made: string[] = []

  async function call(method: string, path: string, body?: unknown, type = 'application/json') {
    const response = await fetch(`${harness.base}${path}`, {
      method,
      headers: { cookie: analyst.cookie, 'content-type': type, origin: harness.origin },
      ...(body === undefined ? {} : { body: type === 'application/json' ? JSON.stringify(body) : (body as BodyInit) }),
    })
    return response
  }

  async function json<T>(method: string, path: string, body?: unknown, type?: string): Promise<T> {
    const response = await call(method, path, body, type)
    const text = await response.text()
    expect(response.status, `${method} ${path}: ${text}`).toBeLessThan(300)
    return JSON.parse(text) as T
  }

  /** Type into one fragment as the editor does, one transaction per act. */
  async function write(caseId: string, address: ProseRecord, fragmentName: string, acts: (text: Y.XmlText) => void) {
    const prose = harness.app.get(ProseService, { strict: false })
    const doc = await prose.open(caseId, address)
    const fragment = fragmentFor(doc, fragmentName)
    let text = fragment.length > 0 ? (fragment.get(0) as Y.XmlElement).get(0) as Y.XmlText | undefined : undefined
    if (!(text instanceof Y.XmlText)) {
      fragment.delete(0, fragment.length)
      const paragraph = new Y.XmlElement('paragraph')
      text = new Y.XmlText()
      paragraph.insert(0, [text])
      fragment.insert(0, [paragraph])
    }
    acts(text)
    await prose.flush(caseId, address)
    await prose.release(caseId, address)
  }

  async function archiveOf(caseId: string) {
    const out = await call('POST', `/api/cases/${caseId}/archive`, { includeFiles: false })
    expect(out.status).toBe(200)
    const bytes = Buffer.from(await out.arrayBuffer())
    return { bytes, ...(await readArchive(bytes, LIMITS)) }
  }

  let caseId = ''
  let reportId = ''
  let keptBlock = ''
  let noteId = ''

  beforeAll(async () => {
    harness = await boot()
    analyst = await sharedAnalyst(harness)

    caseId = (await json<{ id: string }>('POST', '/api/cases', { title: `Handover ${STAMP}` })).id
    made.push(caseId)
    reportId = (await json<{ id: string }>('POST', `/api/cases/${caseId}/reports`, { label: 'Handover' })).id
    const block = (position: number) =>
      json<{ id: string; version: number }>('POST', `/api/cases/${caseId}/report_blocks`, {
        reportId,
        kind: 'written',
        position,
      })
    const kept = await block(0)
    const removed = await block(1)
    const hidden = await block(2)
    keptBlock = kept.id

    const report = reportDocument(reportId)
    await write(caseId, report, kept.id, (text) => {
      text.insert(0, DELETED)
      text.delete(0, DELETED.length)
      text.insert(0, KEPT)
    })
    await write(caseId, report, removed.id, (text) => text.insert(0, REMOVED))
    await write(caseId, report, hidden.id, (text) => text.insert(0, HIDDEN))
    expect((await call('DELETE', `/api/cases/${caseId}/report_blocks/${removed.id}?version=${String(removed.version)}`)).status).toBe(200)
    await json('PATCH', `/api/cases/${caseId}/report_blocks/${hidden.id}`, { version: hidden.version, kind: 'timeline' })

    noteId = (await json<{ id: string }>('POST', `/api/cases/${caseId}/casenotes`, { note: 'first words' })).id
    await write(caseId, { table: 'casenotes', id: noteId }, NOTE_FRAGMENT, (text) => {
      text.delete(0, text.length)
      text.insert(0, NOTE_DELETED)
      text.delete(0, NOTE_DELETED.length)
      text.insert(0, NOTE_KEPT)
      text.format(0, NOTE_KEPT.length, { bold: true })
    })
  }, 120_000)

  afterAll(async () => {
    const pool = openTestPool(process.env['SEED_DATABASE_URL'] ?? process.env['DATABASE_URL']!, 'ic_seed')
    if (made.length > 0) await drizzle({ client: pool }).delete(cases).where(inArray(cases.id, made))
    await pool.end()
    await harness?.close()
  })

  it('carries each report as it reads, and none of how it came to', async () => {
    const { members } = await archiveOf(caseId)
    const member = members[`${PROSE_PREFIX}${reportId}.ydoc`]
    expect(member, 'the archive carried no prose for the report').toBeDefined()
    const raw = Buffer.from(member!).toString('utf8')
    const read = new Y.Doc()
    Y.applyUpdate(read, member!)

    expect({
      kept: fragmentFor(read, keptBlock).toJSON().includes(KEPT),
      deleted: raw.includes(DELETED),
      removed: raw.includes(REMOVED),
      hidden: raw.includes(HIDDEN),
    }).toEqual({ kept: true, deleted: false, removed: false, hidden: false })
  })

  it('carries a note as it reads, beside the record rather than inside it', async () => {
    const { members } = await archiveOf(caseId)
    const member = members[`${PROSE_PREFIX}casenotes/${noteId}.ydoc`]
    expect(member, 'the archive carried no prose for the note').toBeDefined()
    const read = new Y.Doc()
    Y.applyUpdate(read, member!)
    const record = JSON.parse(new TextDecoder().decode(members[CASE_NAME])) as { casenotes: Record<string, unknown>[] }

    expect({
      kept: read.getXmlFragment(NOTE_FRAGMENT).toJSON().includes(NOTE_KEPT),
      deleted: Buffer.from(member!).toString('utf8').includes(NOTE_DELETED),
      inRecord: record.casenotes.some((note) => 'document' in note),
    }).toEqual({ kept: true, deleted: false, inRecord: false })
  })

  // Bold is what the plain `note` column cannot carry, so only the document can bring it back.
  it('reads a note back as it was written', async () => {
    const { bytes } = await archiveOf(caseId)
    const read = await json<{ id: string }>('POST', '/api/cases/import', new Uint8Array(bytes), 'application/octet-stream')
    made.push(read.id)
    const [note] = await json<{ id: string }[]>('GET', `/api/cases/${read.id}/casenotes`)
    const prose = harness.app.get(ProseService, { strict: false })
    const address: ProseRecord = { table: 'casenotes', id: note!.id }
    const doc = await prose.open(read.id, address)
    const shown = doc.getXmlFragment(NOTE_FRAGMENT).toJSON()
    await prose.release(read.id, address)

    expect(shown).toContain(`<bold>${NOTE_KEPT}</bold>`)
  })

  it('reads no note document from an archive record, whatever it plants', async () => {
    const { members } = await archiveOf(caseId)
    const planted = new Y.Doc()
    const paragraph = new Y.XmlElement('paragraph')
    paragraph.insert(0, [new Y.XmlText(PLANTED)])
    planted.getXmlFragment(NOTE_FRAGMENT).insert(0, [paragraph])
    const record = JSON.parse(new TextDecoder().decode(members[CASE_NAME])) as { casenotes: Record<string, unknown>[] }
    record.casenotes = record.casenotes.map((note) => ({
      ...note,
      document: `\\x${Buffer.from(Y.encodeStateAsUpdate(planted)).toString('hex')}`,
    }))
    const forged = Object.fromEntries(
      Object.entries(members).filter(
        ([name]) => name !== MANIFEST_NAME && !name.startsWith(`${PROSE_PREFIX}casenotes/`),
      ),
    )
    forged[CASE_NAME] = new TextEncoder().encode(JSON.stringify(record))
    const archive = await pack(forged, 'omitted', [])

    const read = await json<{ id: string }>('POST', '/api/cases/import', new Uint8Array(archive), 'application/octet-stream')
    made.push(read.id)
    const [note] = await json<{ id: string }[]>('GET', `/api/cases/${read.id}/casenotes`)
    const prose = harness.app.get(ProseService, { strict: false })
    const address: ProseRecord = { table: 'casenotes', id: note!.id }
    const doc = await prose.open(read.id, address)
    const shown = doc.getXmlFragment(NOTE_FRAGMENT).toJSON()
    await prose.release(read.id, address)

    expect(shown, 'the editor opened a document the archive record planted').not.toContain(PLANTED)
  })

  // What sealing promises: an archive altered by somebody without the secret is refused at the door.
  it('refuses a sealed archive altered by somebody without its secret', async () => {
    const secret = `a passphrase long enough ${STAMP}`
    const out = await call('POST', `/api/cases/${caseId}/archive`, { includeFiles: false, passphrase: secret })
    expect(out.status).toBe(200)
    const sealed = new Uint8Array(await out.arrayBuffer())
    sealed[sealed.length - 40] = (sealed[sealed.length - 40]! + 1) % 256
    const read = await fetch(`${harness.base}/api/cases/import`, {
      method: 'POST',
      headers: {
        cookie: analyst.cookie,
        origin: harness.origin,
        'content-type': 'application/octet-stream',
        'x-archive-passphrase': secret,
      },
      body: sealed,
    })

    expect(read.status, await read.text()).toBe(422)
  })
})
