/**
 * Two analysts hold one report and one note open over real case sockets; one
 * of them writes.
 *
 * Every saved change to prose names each analyst who wrote into it, on the
 * row, in a feed row written in the same transaction as the words, and in the
 * install's audit, as any write through the collection routes does. Somebody
 * who only held it open is named nowhere.
 */
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as Y from 'yjs'

import { boot, bootable, sharedAdmin, sharedAnalyst, type Harness, type Persona } from './app-harness.js'
import { aCase, aDraft, caller, Live, typed, type Call } from './report-writers.js'
import { NOTE_FRAGMENT } from '../src/prose/prose.service.js'

const runnable = await bootable()

const pause = (ms: number) => new Promise((wake) => setTimeout(wake, ms))

describe.skipIf(!runnable)('prose two analysts hold open', () => {
  let harness: Harness
  let reader: Persona
  let writer: Persona
  let call: Call
  let caseId: string
  let owner: Client
  const open: Live[] = []

  beforeAll(async () => {
    harness = await boot()
    reader = await sharedAdmin(harness)
    writer = await sharedAnalyst(harness)
    call = caller(harness, reader)
    caseId = await aCase(call, 'Prose with two analysts present')
    owner = new Client({ connectionString: process.env.TEST_DATABASE_URL })
    await owner.connect()
  }, 120_000)

  afterAll(async () => {
    await Promise.all(open.map((live) => live.close()))
    await owner?.end()
    await harness?.close()
  })

  async function both(field: string): Promise<[Live, Live]> {
    const lives = await Promise.all([reader, writer].map((who) => Live.open(harness, who, caseId)))
    open.push(...lives)
    for (const live of lives) await live.openField(field, new Y.Doc())
    return lives as [Live, Live]
  }

  const now = async () => (await owner.query<{ at: Date }>('select clock_timestamp() as at')).rows[0]!.at

  /** Who the row, the feed and the audit name for writes to `table`/`id` since `since`. */
  async function named(table: 'reports' | 'casenotes', id: string, since: Date) {
    const row = (
      await owner.query<{ updated_by: string | null; wrote: string }>(
        `select updated_by, xmin::text as wrote from ${table} where id = $1`,
        [id],
      )
    ).rows[0]!
    const feed = (
      await owner.query<{ actor_id: string; xmin: string }>(
        'select actor_id, xmin::text from change_feed where entity = $1 and entity_id = $2 and at >= $3',
        [table, id, since],
      )
    ).rows
    const audit = (
      await owner.query<{ actor_id: string }>(
        `select actor_id from install_activity where at >= $1 and target_label = $2 and detail->>'record' = $3`,
        [since, `live prose.sync ${table}`, id],
      )
    ).rows
    return {
      updatedBy: row.updated_by,
      feed: [...new Set(feed.map((one) => one.actor_id))].sort(),
      inTheWritingTransaction: feed.some((one) => one.xmin === row.wrote),
      audit: [...new Set(audit.map((one) => one.actor_id))].sort(),
    }
  }

  it.each([
    ['a report', 'reports'],
    ['a note', 'casenotes'],
  ] as const)('names the one who wrote into %s, and not the one who read it', async (_what, table) => {
    const { id, fragment } =
      table === 'reports'
        ? await aDraft(call, caseId, ['Assessment']).then((draft) => ({ id: draft.id, fragment: draft.blocks[0]!.id }))
        : {
            id: ((await (await call(`/cases/${caseId}/casenotes`, 'POST', { note: 'Seeded' })).json()) as { id: string }).id,
            fragment: NOTE_FRAGMENT,
          }
    const field = `${table}:${id}:document`
    const [, typing] = await both(field)
    const since = await now()

    typing.send({ type: 'prose.sync', field, update: typed(new Y.Doc(), fragment, 'Written by the writer') })
    await pause(1500)

    expect(await named(table, id, since)).toEqual({
      updatedBy: writer.id,
      feed: [writer.id],
      inTheWritingTransaction: true,
      audit: [writer.id],
    })
  }, 60_000)

  it('names both when both write before one save', async () => {
    const { id, blocks } = await aDraft(call, caseId, ['Assessment'])
    const field = `reports:${id}:document`
    const [first, second] = await both(field)
    const since = await now()

    first.send({ type: 'prose.sync', field, update: typed(new Y.Doc(), blocks[0]!.id, 'One sentence') })
    await pause(100)
    second.send({ type: 'prose.sync', field, update: typed(new Y.Doc(), blocks[0]!.id, 'and another') })
    await pause(1500)

    expect(await named('reports', id, since)).toEqual({
      updatedBy: writer.id,
      feed: [reader.id, writer.id].sort(),
      inTheWritingTransaction: true,
      audit: [reader.id, writer.id].sort(),
    })
  }, 60_000)
})
