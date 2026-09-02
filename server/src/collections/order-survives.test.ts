/**
 * An arrangement an analyst made, against the two things that would undo it.
 *
 * **The requirement is about what must *not* move.** `collections` says an
 * order an analyst arranged must survive everything that does not change it,
 * and names the mechanism that would break it: order must not be inferred from
 * when a row was created or last changed, *because editing an entry would then
 * move it*.
 *
 * That failure is silent and it is not hypothetical -- ordering a list by
 * `updatedAt` is the obvious thing to write, reads correctly on a fresh case,
 * and quietly throws away the analyst's arrangement the first time somebody
 * fixes a typo. `reorder.test.ts` proves the reordering route renumbers; it
 * cannot see this, because nothing it does edits a row afterwards.
 *
 * Driven on `report_blocks`, which is the collection an analyst actually
 * arranges: a report is a sequence, and `entities.controller.ts` says in as
 * many words that blocks are ordered by `position` rather than by when they
 * were made.
 */
import { PATH_METADATA } from '@nestjs/common/constants'
import { and, eq, isNull } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { CollectionService } from './collection.service.js'
import { ENTITY_CONTROLLERS } from './entities.controller.js'
import { DemoContentSeeder } from '../demos/content.seeder.js'
import { DemoSeederService } from '../demos/seeder.service.js'
import { cases, reportBlocks, reports, user } from '../db/schema/index.js'
import { openTestPool } from '../../test/database.js'

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

const SEED_URL = process.env.SEED_DATABASE_URL ?? ''
const seedPool = SEED_URL ? openTestPool(SEED_URL, 'ic_seed') : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null

interface Session {
  user: { id: string }
}

interface Arrangeable {
  list(caseId: string): Promise<Record<string, unknown>[]>
  reorder(caseId: string, body: unknown, session: Session): Promise<{ ids: string[] }>
  update(caseId: string, id: string, body: unknown, session: Session): Promise<unknown>
  createMany(caseId: string, body: unknown, session: Session): Promise<{ ids: string[] }>
}

function controllerFor(name: string): Arrangeable {
  const found = ENTITY_CONTROLLERS.find(
    (c) => Reflect.getMetadata(PATH_METADATA, c) === `api/cases/:caseId/${name}`,
  )!
  const channel = {
    announce: () => {},
    othersOn: () => Promise.resolve([]),
    // Asked on a single-row update, to say whether somebody else holds the row.
    holderOf: () => Promise.resolve(null),
  }
  return new (found as new (s: CollectionService) => Arrangeable)(
    new CollectionService(db!, channel as never),
  )
}

afterAll(async () => {
  await pool?.end()
  await seedPool?.end()
})

describe.skipIf(!db)('an arrangement an analyst made', () => {
  let caseId: string
  let reportId: string
  let session: Session

  beforeAll(async () => {
    const actorId = 'order-analyst'
    const now = new Date()
    await seed!
      .insert(user)
      .values({
        id: actorId,
        name: 'Order Analyst',
        email: 'order@example.test',
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
    session = { user: { id: actorId } }
  })

  beforeEach(async () => {
    await seed!.delete(cases)
    await new DemoSeederService(seed!, seed, new DemoContentSeeder(seed)).reseed()
    const [one] = await seed!.select().from(cases).where(eq(cases.reference, 'DEMO-2026-001'))
    caseId = one!.id
    // A draft, because a sent report refuses every block write.
    const [report] = await seed!
      .select()
      .from(reports)
      .where(and(eq(reports.caseId, caseId), isNull(reports.sentAt)))
      .limit(1)
    reportId = report!.id
  })

  /** The blocks of the report under test, in the order the collection serves. */
  const served = async (): Promise<Record<string, unknown>[]> => {
    const rows = await controllerFor('report_blocks').list(caseId)
    return rows.filter((row) => row['reportId'] === reportId)
  }

  /** Puts the first two blocks the other way round, and answers the new order. */
  async function arrange(): Promise<string[]> {
    const before = (await served()).map((row) => row['id'] as string)
    expect(before.length, 'the demo report needs blocks to arrange').toBeGreaterThan(2)

    const moved = [before[1]!, before[0]!, ...before.slice(2)]
    await controllerFor('report_blocks').reorder(caseId, { ids: moved }, session)
    expect((await served()).map((row) => row['id'] as string)).toEqual(moved)
    return moved
  }

  it('is not disturbed by editing one of the rows in it', async () => {
    const arranged = await arrange()

    // The row an analyst is most likely to touch after arranging: the one they
    // just moved to the top.
    const [target] = (await served()).filter((row) => row['id'] === arranged[0])
    await controllerFor('report_blocks').update(
      caseId,
      target!['id'] as string,
      { version: target!['version'] as number, heading: 'Renamed after arranging' },
      session,
    )

    const after = (await served()).map((row) => row['id'] as string)
    expect(after, 'editing a row moved it, so the order is a property of the data').toEqual(
      arranged,
    )
  })

  /**
   * **The row edited last is the one an order-by-`updatedAt` would put first**,
   * so this edits a row in the *middle* as well: a list that happens to be
   * ordered by change would move it, and moving the top row alone could
   * coincidentally leave the sequence looking right.
   */
  it('is not disturbed by editing a row in the middle of it', async () => {
    const arranged = await arrange()

    const [target] = (await served()).filter((row) => row['id'] === arranged[1])
    await controllerFor('report_blocks').update(
      caseId,
      target!['id'] as string,
      { version: target!['version'] as number, heading: 'Edited in the middle' },
      session,
    )

    expect((await served()).map((row) => row['id'] as string)).toEqual(arranged)
  })

  it('is not disturbed by rows arriving afterwards', async () => {
    const arranged = await arrange()

    await controllerFor('report_blocks').createMany(
      caseId,
      {
        entries: [
          { reportId, kind: 'written', heading: 'Arrived later' },
          { reportId, kind: 'written', heading: 'Arrived later still' },
        ],
      },
      session,
    )

    const after = (await served()).map((row) => row['id'] as string)
    expect(after.length, 'the new rows did not land at all').toBe(arranged.length + 2)

    /**
     * **The relative order of what was already there, not a prefix.** The
     * requirement protects the arrangement of the existing rows; where a new
     * row lands among them is a separate decision, and measured, they do not
     * land at the end -- see the case below for why that matters.
     */
    expect(
      after.filter((id) => arranged.includes(id)),
      'rows that were already arranged came back in a different order',
    ).toEqual(arranged)
  })

  /**
   * **A known gap, asserted as it behaves today so that closing it turns this
   * red.** The name says `does NOT` because that is what is pinned. Not
   * `it.fails`, which inverts the whole test and cannot tell "still open" from
   * "stopped running".
   *
   * `reportBlockSchema` gives `position` a default of `0`, so a row created
   * through the collection door lands on top of whichever row the analyst
   * arranged into first place. Two rows sharing a position are served in
   * whatever order the database happens to return, which is not an
   * arrangement at all: the list can differ between two reads with nothing
   * written in between.
   *
   * **The report's own door does this correctly**, which is the shape of the
   * defect rather than an aside: `report/lifecycle.service.ts` reads the last
   * position and appends past it, and the generic collection create does not.
   *
   * Asserted on the stored column rather than on a listing, because a listing
   * that happens to look right is exactly what a tie produces.
   */
  it('does NOT give an arriving row a position of its own', async () => {
    await arrange()

    await controllerFor('report_blocks').createMany(
      caseId,
      { entries: [{ reportId, kind: 'written', heading: 'Arrived later' }] },
      session,
    )

    const stored = await seed!
      .select({ id: reportBlocks.id, position: reportBlocks.position })
      .from(reportBlocks)
      .where(eq(reportBlocks.reportId, reportId))

    const positions = stored.map((row) => row.position)
    const duplicated = positions.filter((one, index) => positions.indexOf(one) !== index)
    expect(
      duplicated,
      'an arriving row now gets a position of its own -- the gap is closed, so ' +
        'delete this test and close the issue it pins',
    ).not.toEqual([])
  })

  /**
   * **The order is stored, not derived**, which is the sentence the
   * requirement rests on. Read straight off the column so the claim is about
   * the row rather than about what a list happened to return: two rows sharing
   * a position would serve in some order, and it would not be an arrangement.
   */
  it('is a column an analyst set, and the positions are distinct', async () => {
    const arranged = await arrange()

    const stored = await seed!
      .select({ id: reportBlocks.id, position: reportBlocks.position })
      .from(reportBlocks)
      .where(eq(reportBlocks.reportId, reportId))

    const positions = stored.map((row) => row.position)
    expect(new Set(positions).size, 'two blocks share a position').toBe(positions.length)

    const byPosition = [...stored].sort((a, b) => a.position - b.position).map((row) => row.id)
    expect(byPosition).toEqual(arranged)
  })
})
