/**
 * Two analysts reorder one report's sections at the same moment, each sending
 * the versions they read, as two overlapping requests over many rounds.
 *
 * The two orders cross - each moves rows the other moves, in the opposite
 * sequence - which is the shape that makes two unordered writers deadlock.
 * Every round has to end with one reorder stored whole and the other refused
 * naming what moved: never a mix, never two sections on one position, never a
 * server error.
 */
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAdmin, sharedAnalyst, type Harness } from './app-harness.js'
import { aCase, caller, type Call } from './report-writers.js'

const runnable = await bootable()
const ROUNDS = 30

describe.skipIf(!runnable)('two reorders of one report at once', () => {
  let harness: Harness
  let one: Call
  let other: Call
  let caseId: string
  let owner: Client

  beforeAll(async () => {
    // Every file's requests arrive from one address, so the rate limit counts
    // in a store of this file's own.
    harness = await boot([{ token: ThrottlerStorage, value: new ThrottlerStorageService() }])
    one = caller(harness, await sharedAdmin(harness))
    other = caller(harness, await sharedAnalyst(harness))
    caseId = await aCase(one, 'Two reorders at once')
    owner = new Client({ connectionString: process.env.TEST_DATABASE_URL })
    await owner.connect()
  }, 120_000)

  afterAll(async () => {
    await owner?.end()
    await harness?.close()
  })

  /** A draft with four sections, written through the store so only the reorders are requests. */
  async function sections(): Promise<{ id: string; version: number }[]> {
    const { rows } = await owner.query<{ id: string }>(
      `insert into reports (case_id, label) values ($1, 'Reordered') returning id`,
      [caseId],
    )
    for (const position of [0, 1, 2, 3]) {
      await owner.query(`insert into report_blocks (case_id, report_id, position) values ($1, $2, $3)`, [
        caseId,
        rows[0]!.id,
        position,
      ])
    }
    return (
      await owner.query<{ id: string; version: number }>(
        'select id, version from report_blocks where report_id = $1 order by position',
        [rows[0]!.id],
      )
    ).rows
  }

  const stored = async (ids: readonly string[]) =>
    (
      await owner.query<{ id: string; position: number }>(
        'select id, position from report_blocks where id = any($1::uuid[]) order by position, id',
        [ids],
      )
    ).rows

  it('stores one of the two whole, and refuses the other naming what moved', async () => {
    const bad: string[] = []
    for (let round = 0; round < ROUNDS; round++) {
      await new Promise((wake) => setTimeout(wake, 100))
      const [a, b, c, d] = await sections()
      const mine = [d!, c!, b!, a!]
      const theirs = [b!, a!, d!, c!]

      const answers = await Promise.all(
        [
          [one, mine],
          [other, theirs],
        ].map(async ([who, order]) => {
          const answer = await (who as Call)(`/cases/${caseId}/report_blocks/order`, 'POST', { rows: order })
          return { order: order as typeof mine, status: answer.status, body: (await answer.json()) as { refused?: string[] } }
        }),
      )
      const after = await stored([a!.id, b!.id, c!.id, d!.id])
      const won = answers.filter((answer) => answer.status === 200)
      const lost = answers.filter((answer) => answer.status === 409)
      const ids = new Set([a!.id, b!.id, c!.id, d!.id])

      const fine =
        won.length === 1 &&
        lost.length === 1 &&
        after.map((row) => row.id).join() === won[0]!.order.map((row) => row.id).join() &&
        new Set(after.map((row) => row.position)).size === after.length &&
        (lost[0]!.body.refused ?? []).length > 0 &&
        (lost[0]!.body.refused ?? []).every((id) => ids.has(id))
      if (!fine) bad.push(JSON.stringify({ statuses: answers.map((answer) => answer.status), after }))
    }
    expect(bad).toEqual([])
  }, 300_000)

  it('answers each row with the version it now holds, so the next move from the same screen is taken', async () => {
    const [a, b, c, d] = await sections()
    const first = await one(`/cases/${caseId}/report_blocks/order`, 'POST', { rows: [b!, a!, c!, d!] })
    const { rows } = (await first.json()) as { rows: { id: string; version: number }[] }
    const now = new Map(rows.map((row) => [row.id, row.version]))
    const next = [b!, c!, a!, d!].map((row) => ({ id: row.id, version: now.get(row.id)! }))

    const second = await one(`/cases/${caseId}/report_blocks/order`, 'POST', { rows: next })

    expect({ first: first.status, second: second.status, order: (await stored(rows.map((row) => row.id))).map((row) => row.id) }).toEqual({
      first: 200,
      second: 200,
      order: [b!.id, c!.id, a!.id, d!.id],
    })
  }, 60_000)
})
