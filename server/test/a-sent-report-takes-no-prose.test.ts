/**
 * An analyst types into a report over a real case socket while another sends
 * it through the app.
 *
 * What was sent and what the report stores afterwards have to be the same
 * prose, and anything typed that did not go out has to have been refused to
 * the typist. A send that fails keeps everything typed while it was deciding.
 */
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as Y from 'yjs'

import { boot, bootable, sharedAdmin, sharedAnalyst, type Harness, type Persona } from './app-harness.js'
import { aCase, aDraft, caller, Live, typed, type Call } from './report-writers.js'
import { PresenceStore } from '../src/live/presence.store.js'

const runnable = await bootable()

const pause = (ms: number) => new Promise((wake) => setTimeout(wake, ms))
const LINE = /TYPED-\d+/g
const lines = (text: string) => new Set(text.match(LINE) ?? [])

describe.skipIf(!runnable)('prose typed around a send', () => {
  let harness: Harness
  let typist: Persona
  let sender: Call
  let caseId: string
  let owner: Client
  const open: Live[] = []

  beforeAll(async () => {
    harness = await boot()
    sender = caller(harness, await sharedAdmin(harness))
    typist = await sharedAnalyst(harness)
    caseId = await aCase(sender, 'A report typed into while it is sent')
    owner = new Client({ connectionString: process.env.TEST_DATABASE_URL })
    await owner.connect()
  }, 120_000)

  afterAll(async () => {
    await Promise.all(open.map((live) => live.close()))
    await owner?.end()
    await harness?.close()
  })

  /** Types a numbered line every few milliseconds until `stop` resolves. */
  async function typeUntil(live: Live, field: string, fragment: string, stop: Promise<unknown>): Promise<string[]> {
    const doc = new Y.Doc()
    const sent: string[] = []
    let done = false
    void stop.finally(() => {
      done = true
    })
    for (let n = 0; !done || sent.length < 3; n++) {
      const text = `TYPED-${String(n)}`
      live.send({ type: 'prose.sync', field, update: typed(doc, fragment, text) })
      sent.push(text)
      await pause(3)
    }
    // A little past the answer, so frames arrive after the stamp too.
    for (let n = sent.length; n < sent.length + 20; n++) {
      live.send({ type: 'prose.sync', field, update: typed(doc, fragment, `TYPED-${String(n)}`) })
      await pause(3)
    }
    return sent
  }

  /** The stored document once every reader has left, and the tree that was sent. */
  async function afterwards(
    reportId: string,
    fragment: string,
    live: Live,
  ): Promise<{ stored: string; frozen: string; sentAt: Date | null }> {
    await live.close()
    await pause(1500)
    const { rows } = await owner.query<{ document: Buffer | null; frozen: unknown; sent_at: Date | null }>(
      'select document, frozen, sent_at from reports where id = $1',
      [reportId],
    )
    const doc = new Y.Doc()
    if (rows[0]!.document) Y.applyUpdate(doc, new Uint8Array(rows[0]!.document))
    return { stored: JSON.stringify(doc.getXmlFragment(fragment).toJSON()), frozen: JSON.stringify(rows[0]!.frozen), sentAt: rows[0]!.sent_at }
  }

  it('stores exactly the prose that was sent, and refuses the typist the rest', async () => {
    const { id, blocks } = await aDraft(sender, caseId, ['Assessment'])
    const field = `reports:${id}:document`
    const live = await Live.open(harness, typist, caseId)
    open.push(live)
    await live.openField(field, new Y.Doc())

    const sending = pause(40).then(() => sender(`/cases/${caseId}/reports/${id}/send`, 'POST'))
    await typeUntil(live, field, blocks[0]!.id, sending)
    expect((await sending).ok).toBe(true)
    await pause(300)
    const refused = live.frames.filter((frame) => frame.type === 'prose.refused').map((frame) => frame.reason)

    const { stored, frozen } = await afterwards(id, blocks[0]!.id, live)
    expect(lines(frozen).size, 'nothing typed reached the send, so this proves nothing').toBeGreaterThan(0)
    expect([...lines(stored)].sort()).toEqual([...lines(frozen)].sort())
    expect(refused).toContain('report-sent')
  }, 60_000)

  it('refuses prose after the send when the announcement of it never arrives', async () => {
    const store = harness.app.get(PresenceStore)
    const publish = store.publish.bind(store)
    store.publish = (id: string, payload: string) =>
      payload.includes('"case.changed"') ? Promise.reject(new Error('the announcement is lost')) : publish(id, payload)
    try {
      const { id, blocks } = await aDraft(sender, caseId, ['Assessment'])
      const field = `reports:${id}:document`
      const live = await Live.open(harness, typist, caseId)
      open.push(live)
      await live.openField(field, new Y.Doc())

      expect((await sender(`/cases/${caseId}/reports/${id}/send`, 'POST')).ok).toBe(true)
      live.send({ type: 'prose.sync', field, update: typed(new Y.Doc(), blocks[0]!.id, 'TYPED-AFTER') })
      const refusal = await live.until((frame) => frame.type === 'prose.refused' && frame.reason === 'report-sent')

      const { stored, sentAt } = await afterwards(id, blocks[0]!.id, live)
      expect(stored).not.toContain('TYPED-AFTER')
      expect(refusal.sentAt).toBe(sentAt?.toISOString())
    } finally {
      store.publish = publish
    }
  }, 60_000)

  it('keeps everything typed while a send that fails was deciding', async () => {
    const { id, blocks } = await aDraft(sender, caseId, ['Assessment'])
    // A section this build cannot draw, so the render refuses and the send with it.
    await owner.query(
      `insert into report_blocks (case_id, report_id, kind, position) values ($1, $2, 'no-such-kind', 5)`,
      [caseId, id],
    )
    const field = `reports:${id}:document`
    const live = await Live.open(harness, typist, caseId)
    open.push(live)
    await live.openField(field, new Y.Doc())

    const sending = pause(40).then(() => sender(`/cases/${caseId}/reports/${id}/send`, 'POST'))
    const typedLines = await typeUntil(live, field, blocks[0]!.id, sending)
    expect((await sending).status).toBe(400)
    await pause(300)

    expect(live.frames.filter((frame) => frame.type === 'prose.refused')).toEqual([])
    const { stored, sentAt } = await afterwards(id, blocks[0]!.id, live)
    expect(sentAt).toBeNull()
    expect(typedLines.filter((line) => !lines(stored).has(line))).toEqual([])
  }, 60_000)
})
