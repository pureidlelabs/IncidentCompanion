/**
 * A note's words are its live document's, and the collection routes are not a
 * second way to write them.
 *
 * Its text is taken on create, as the document's first words, and refused on
 * every later write, so nothing answered 200 is replaced by the next save of
 * the document. A note opened and left untouched keeps those first words once,
 * however many times it is reopened by a client still holding them.
 */
import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readSyncMessage, writeSyncStep1, writeSyncStep2 } from 'y-protocols/sync'
import * as Y from 'yjs'

import { boot, bootable, sharedAdmin, sharedAnalyst, type Harness, type Persona } from './app-harness.js'
import { aCase, caller, Live, typed, type Call } from './report-writers.js'
import { NOTE_FRAGMENT } from '../src/prose/prose.service.js'

const runnable = await bootable()

const pause = (ms: number) => new Promise((wake) => setTimeout(wake, ms))
const frame = (write: (encoder: encoding.Encoder) => void) => {
  const encoder = encoding.createEncoder()
  write(encoder)
  return Buffer.from(encoding.toUint8Array(encoder)).toString('base64')
}

describe.skipIf(!runnable)("a note's words", () => {
  let harness: Harness
  let admin: Persona
  let call: Call
  let analyst: Call
  let caseId: string
  let owner: Client
  const open: Live[] = []

  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)
    call = caller(harness, admin)
    analyst = caller(harness, await sharedAnalyst(harness))
    caseId = await aCase(call, 'A note has one writer')
    owner = new Client({ connectionString: process.env.TEST_DATABASE_URL })
    await owner.connect()
  }, 120_000)

  afterAll(async () => {
    await Promise.all(open.map((live) => live.close()))
    await owner?.end()
    await harness?.close()
  })

  async function aNote(text: string): Promise<{ id: string; version: number }> {
    return (await (await call(`/cases/${caseId}/casenotes`, 'POST', { note: text })).json()) as {
      id: string
      version: number
    }
  }

  const stored = async (id: string) =>
    (await owner.query<{ note: string }>('select note from casenotes where id = $1', [id])).rows[0]!.note

  it('refuses its words on a write, naming them, and keeps what an analyst typed', async () => {
    const note = await aNote('Seeded')
    const field = `casenotes:${note.id}:document`
    const live = await Live.open(harness, admin, caseId)
    open.push(live)
    await live.openField(field, new Y.Doc())
    live.send({ type: 'prose.sync', field, update: typed(new Y.Doc(), NOTE_FRAGMENT, 'Typed in the editor') })
    await pause(1200)

    const single = await analyst(`/cases/${caseId}/casenotes/${note.id}`, 'PATCH', {
      version: note.version,
      note: 'Written through the API',
    })
    const bulk = await analyst(`/cases/${caseId}/casenotes/bulk`, 'PATCH', {
      ids: [{ id: note.id, version: note.version }],
      fields: { note: 'Written through the API' },
    })
    const answers = await Promise.all(
      [single, bulk].map(async (answer) => ({ status: answer.status, body: JSON.stringify(await answer.json()) })),
    )

    expect(answers.map((answer) => answer.status)).toEqual([422, 422])
    for (const answer of answers) expect(answer.body).toContain('note')
    live.send({ type: 'prose.sync', field, update: typed(new Y.Doc(), NOTE_FRAGMENT, 'Typed again') })
    await pause(1200)
    expect(await stored(note.id)).not.toContain('Written through the API')
    expect(await stored(note.id)).toContain('Typed in the editor')
  }, 60_000)

  it('still takes a write to the rest of the note', async () => {
    const note = await aNote('Seeded')
    const answer = await analyst(`/cases/${caseId}/casenotes/${note.id}`, 'PATCH', {
      version: note.version,
      tags: 'phishing',
    })
    expect(answer.status).toBe(200)
  })

  it('keeps the words it was created with once, when a client that saw them reconnects', async () => {
    const note = await aNote('Seeded words')
    const field = `casenotes:${note.id}:document`
    const mine = new Y.Doc()

    /** Opens the field holding `mine`, takes what the server has, and gives it what `mine` has. */
    const exchange = async () => {
      const live = await Live.open(harness, admin, caseId)
      open.push(live)
      const seen = live.frames.length
      live.send({ type: 'prose.sync', field, update: frame((encoder) => writeSyncStep1(encoder, mine)) })
      await live.until((one) => live.frames.indexOf(one) >= seen && one.type === 'prose.sync' && one.field === field)
      await pause(200)
      for (const one of live.frames.slice(seen)) {
        if (one.type !== 'prose.sync' || one.field !== field || !one.update) continue
        readSyncMessage(decoding.createDecoder(new Uint8Array(Buffer.from(one.update, 'base64'))), encoding.createEncoder(), mine, 'server')
      }
      live.send({ type: 'prose.sync', field, update: frame((encoder) => writeSyncStep2(encoder, mine)) })
      await pause(200)
      await live.close()
      await pause(1200)
    }

    await exchange()
    await exchange()

    expect(await stored(note.id)).toBe('Seeded words')
  }, 60_000)
})
