/**
 * A first word whose acceptance is still being recorded when the report is
 * sent is either in what is stored or refused to the typist, never neither,
 * and its acceptance does not outlive it.
 *
 * **The attack slows the acceptance down** with a trigger on the store, so the
 * send lands between the word arriving and the word being applied.
 */
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as Y from 'yjs'

import {
  boot,
  bootable,
  sharedAdmin,
  sharedAnalyst,
  type Harness,
  type Persona,
} from './app-harness.js'
import { aCase, aDraft, caller, Live, typed, type Call } from './report-writers.js'

const pause = (ms: number) => new Promise((wake) => setTimeout(wake, ms))

describe.skipIf(!(await bootable()))('a first word raced by a send', () => {
  let harness: Harness
  let typist: Persona
  let sender: Call
  let caseId: string
  let owner: Client
  const slow = `slow_acceptance_${String(process.pid)}`

  beforeAll(async () => {
    harness = await boot()
    sender = caller(harness, await sharedAdmin(harness))
    typist = await sharedAnalyst(harness)
    caseId = await aCase(sender, 'A word raced by a send')
    owner = new Client({ connectionString: process.env.TEST_DATABASE_URL })
    await owner.connect()
  }, 120_000)

  afterAll(async () => {
    await owner.query(`drop trigger if exists ${slow} on prose_acceptances`)
    await owner.query(`drop function if exists ${slow}()`)
    await owner?.end()
    await harness?.close()
  })

  it('is stored or refused', async () => {
    const { id, blocks } = await aDraft(sender, caseId, ['Assessment'])
    const field = `reports:${id}:document`
    const live = await Live.open(harness, typist, caseId)
    await live.openField(field, new Y.Doc())
    await owner.query(
      `create or replace function ${slow}() returns trigger language plpgsql as $f$ begin perform pg_sleep(1.5); return new; end $f$`,
    )
    await owner.query(
      `create trigger ${slow} before insert on prose_acceptances for each row execute function ${slow}()`,
    )
    live.send({
      type: 'prose.sync',
      field,
      update: typed(new Y.Doc(), blocks[0]!.id, 'RACED-WORD'),
    })
    await pause(100)
    const sent = await sender(`/cases/${caseId}/reports/${id}/send`, 'POST')
    expect(sent.ok, `the send answered ${String(sent.status)}`).toBe(true)
    await pause(3_000)
    const refused = live.frames.filter((frame) => frame.type === 'prose.refused').length
    await live.close()
    await pause(1_500)
    const { rows } = await owner.query<{ document: Buffer | null }>(
      'select document from reports where id = $1',
      [id],
    )
    const doc = new Y.Doc()
    if (rows[0]!.document) Y.applyUpdate(doc, new Uint8Array(rows[0]!.document))
    const stored = JSON.stringify(doc.getXmlFragment(blocks[0]!.id).toJSON()).includes('RACED-WORD')
    const left = await owner.query('select 1 from prose_acceptances where record_id = $1', [id])

    expect({ stored, refused: refused > 0 }).not.toEqual({ stored: false, refused: false })
    expect(left.rowCount, 'an acceptance outlived the word it was for').toBe(0)
  }, 60_000)
})
