/**
 * One analyst sends a report while another writes one of its parts, both
 * through the real routes and with nothing serialising the two requests.
 *
 * The write is fired at a delay spread across the time an unraced send takes,
 * so the early rounds land before the render, the late ones after the stamp,
 * and the middle ones inside it. Every round has to end in one of three
 * states: the write refused and absent, the write answered 2xx and in what was
 * sent, or the send refused and the report still a draft holding the write.
 *
 * Each round's draft is written and read back through the store, so the only
 * requests are the two under test. The rate limit counts in a store of this
 * file's own, since every file's requests arrive from one address, and the
 * rounds are paced under its burst tier.
 */
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAdmin, sharedAnalyst, type Harness } from './app-harness.js'
import { aCase, caller, type Block, type Call } from './report-writers.js'

const runnable = await bootable()
const ROUNDS = 30

interface Frozen {
  sections: { blockId?: string; heading?: string }[]
}

interface Part {
  write: (writer: Call, caseId: string, reportId: string, blocks: Block[]) => Promise<Response>
  /** Whether the write shows in the stored parts, and in the tree that was sent. */
  shows: (stored: Block[], frozen: Frozen | null, before: Block[]) => { stored: boolean; sent: boolean }
}

const HEADING = 'WRITTEN DURING THE SEND'

const parts: [string, Part][] = [
  [
    'a part is renamed',
    {
      write: (writer, caseId, _reportId, blocks) =>
        writer(`/cases/${caseId}/report_blocks/${blocks[0]!.id}`, 'PATCH', {
          version: blocks[0]!.version,
          heading: HEADING,
        }),
      shows: (stored, frozen, before) => ({
        stored: stored.find((block) => block.id === before[0]!.id)?.heading === HEADING,
        sent: frozen?.sections.find((section) => section.blockId === before[0]!.id)?.heading === HEADING,
      }),
    },
  ],
  [
    'the parts are reordered',
    {
      write: (writer, caseId, _reportId, blocks) =>
        writer(`/cases/${caseId}/report_blocks/order`, 'POST', {
          rows: blocks.map(({ id, version }) => ({ id, version })).reverse(),
        }),
      shows: (stored, frozen, before) => {
        const reversed = before.map((block) => block.id).reverse().join()
        const mine = new Set(before.map((block) => block.id))
        return {
          stored: stored.map((block) => block.id).join() === reversed,
          sent:
            (frozen?.sections ?? [])
              .flatMap((section) => (section.blockId && mine.has(section.blockId) ? [section.blockId] : []))
              .join() === reversed,
        }
      },
    },
  ],
  [
    'a part is added',
    {
      write: (writer, caseId, reportId) =>
        writer(`/cases/${caseId}/report_blocks`, 'POST', { reportId, heading: HEADING, position: 9 }),
      shows: (stored, frozen) => ({
        stored: stored.some((block) => block.heading === HEADING),
        sent: (frozen?.sections ?? []).some((section) => section.heading === HEADING),
      }),
    },
  ],
]

describe.skipIf(!runnable)('a send raced by a part write', () => {
  let harness: Harness
  let sender: Call
  let writer: Call
  let caseId: string
  let owner: Client

  beforeAll(async () => {
    harness = await boot([{ token: ThrottlerStorage, value: new ThrottlerStorageService() }])
    sender = caller(harness, await sharedAdmin(harness))
    writer = caller(harness, await sharedAnalyst(harness))
    caseId = await aCase(sender, 'A report sent while it is written')
    owner = new Client({ connectionString: process.env.TEST_DATABASE_URL })
    await owner.connect()
  }, 120_000)

  afterAll(async () => {
    await owner?.end()
    await harness?.close()
  })

  async function aDraft(): Promise<{ id: string; blocks: Block[] }> {
    const { rows } = await owner.query<{ id: string }>(
      `insert into reports (case_id, label) values ($1, 'Raced') returning id`,
      [caseId],
    )
    const id = rows[0]!.id
    for (const [position, heading] of ['Summary', 'Findings', 'Actions'].entries()) {
      await owner.query(`insert into report_blocks (case_id, report_id, heading, position) values ($1, $2, $3, $4)`, [
        caseId,
        id,
        heading,
        position,
      ])
    }
    return { id, blocks: await blocksOf(id) }
  }

  async function blocksOf(reportId: string): Promise<Block[]> {
    const { rows } = await owner.query<Block>(
      `select id, version, report_id as "reportId", position, kind, heading, heading_key as "headingKey" from report_blocks
        where report_id = $1 order by position`,
      [reportId],
    )
    return rows
  }

  async function reportRow(reportId: string): Promise<{ sentAt: Date | null; frozen: Frozen | null }> {
    const { rows } = await owner.query<{ sentAt: Date | null; frozen: Frozen | null }>(
      `select sent_at as "sentAt", frozen from reports where id = $1`,
      [reportId],
    )
    return rows[0]!
  }

  it.each(parts)('ends every round in a state somebody was told about when %s', async (_what, part) => {
    const unraced = await aDraft()
    const started = performance.now()
    expect((await sender(`/cases/${caseId}/reports/${unraced.id}/send`, 'POST')).ok).toBe(true)
    const span = performance.now() - started

    const tally: Record<string, number> = {}
    for (let round = 0; round < ROUNDS; round++) {
      await new Promise((wake) => setTimeout(wake, 100))
      const { id, blocks } = await aDraft()
      const [sent, wrote] = await Promise.all([
        sender(`/cases/${caseId}/reports/${id}/send`, 'POST'),
        new Promise((wake) => setTimeout(wake, (round / ROUNDS) * span * 1.2)).then(() =>
          part.write(writer, caseId, id, blocks),
        ),
      ])
      const row = await reportRow(id)
      const shows = part.shows(await blocksOf(id), row.frozen, blocks)

      const outcome =
        sent.ok && wrote.ok && shows.sent
          ? 'sent with the write'
          : sent.ok && wrote.status === 409 && !shows.stored && !shows.sent
            ? 'write refused'
            : sent.status === 409 && wrote.ok && row.sentAt === null && shows.stored
              ? 'send refused'
              : `send ${String(sent.status)}, write ${String(wrote.status)}, ${JSON.stringify(shows)}`
      tally[outcome] = (tally[outcome] ?? 0) + 1
    }

    expect(Object.keys(tally).filter((outcome) => !['sent with the write', 'write refused', 'send refused'].includes(outcome)), JSON.stringify(tally)).toEqual([])
    expect(Object.keys(tally).length, `the write never overlapped the send: ${JSON.stringify(tally)}`).toBeGreaterThan(1)
  }, 600_000)
})
