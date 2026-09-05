/**
 * `POST /api/cases/:caseId/:collection/order` against a real database.
 */
import { PATH_METADATA } from '@nestjs/common/constants'
import { and, eq, isNull, ne } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { CollectionService } from './collection.service.js'
import { ENTITY_CONTROLLERS } from './entities.controller.js'
import { DemoContentSeeder } from '../demos/content.seeder.js'
import { DemoSeederService } from '../demos/seeder.service.js'
import { cases, changeFeed, reportBlocks, reports, user } from '../db/schema/index.js'
import { openTestPool } from '../../test/database.js'

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null
/** Fixtures are arranged as the seed role, like every sibling suite. */
const SEED_URL = process.env.SEED_DATABASE_URL ?? ''
const seedPool = SEED_URL ? openTestPool(SEED_URL, 'ic_seed') : null
const seed = seedPool ? drizzle({ client: seedPool }) : null

interface Session {
  user: { id: string }
}

interface Reorderable {
  reorder(caseId: string, body: unknown, session: Session): Promise<{ ids: string[] }>
}

/** What `CaseChannel.announce` was told, in call order. */
const announced: { caseId: string; scopes: string[]; by: string }[] = []

function controllerFor(name: string): Reorderable {
  const found = ENTITY_CONTROLLERS.find(
    (c) => Reflect.getMetadata(PATH_METADATA, c) === `api/cases/:caseId/${name}`,
  )!
  const channel = {
    announce: (caseId: string, scopes: string[], by: string) => {
      announced.push({ caseId, scopes, by })
    },
    othersOn: () => Promise.resolve([]),
  }
  return new (found as new (s: CollectionService) => Reorderable)(
    new CollectionService(db!, channel as never),
  )
}

afterAll(async () => {
  await pool?.end()
  await seedPool?.end()
})

describe.skipIf(!db)('reordering a collection that carries a position', () => {
  let caseId: string
  let reportId: string
  let session: Session

  beforeAll(async () => {
    const actorId = 'reorder-analyst'
    const now = new Date()
    await seed!
      .insert(user)
      .values({
        id: actorId,
        name: 'Reorder Analyst',
        email: 'reorder@example.test',
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
    const [report] = await seed!
      .select()
      .from(reports)
      .where(and(eq(reports.caseId, caseId), isNull(reports.sentAt)))
      .limit(1)
    reportId = report!.id
  })

  const blocksOf = async (): Promise<{ id: string; position: number }[]> =>
    await seed!
      .select({ id: reportBlocks.id, position: reportBlocks.position })
      .from(reportBlocks)
      .where(eq(reportBlocks.reportId, reportId))
      .orderBy(reportBlocks.position)

  it('renumbers to the order it was sent, and answers with it', async () => {
    const before = await blocksOf()
    expect(before.length, 'the demo report has blocks to move').toBeGreaterThan(2)

    const moved = [before[1]!.id, before[0]!.id, ...before.slice(2).map((b) => b.id)]
    const { ids } = await controllerFor('report_blocks').reorder(caseId, { ids: moved }, session)

    expect(ids).toEqual(moved)
    expect((await blocksOf()).map((b) => b.id)).toEqual(moved)
  })

  it('refuses a list that is not the whole collection', async () => {
    // **The refusal is the useful answer.** A partial list means somebody added
    // a block while this screen was open, and applying it would interleave two
    // orders into one neither analyst chose.
    const before = await blocksOf()
    await expect(
      controllerFor('report_blocks').reorder(
        caseId,
        { ids: before.slice(1).map((b) => b.id) },
        session,
      ),
    ).rejects.toMatchObject({ status: 422 })
    expect((await blocksOf()).map((b) => b.id)).toEqual(before.map((b) => b.id))
  })

  it('refuses an id that is not in this case', async () => {
    const before = await blocksOf()
    const foreign = before.map((b) => b.id)
    foreign[0] = '00000000-0000-4000-8000-000000000000'
    await expect(
      controllerFor('report_blocks').reorder(caseId, { ids: foreign }, session),
    ).rejects.toMatchObject({ status: 422 })
  })

  it('feeds the blocks that moved and not the ones that did not', async () => {
    const before = await blocksOf()
    await seed!.delete(changeFeed).where(eq(changeFeed.caseId, caseId))

    const moved = [before[1]!.id, before[0]!.id, ...before.slice(2).map((b) => b.id)]
    await controllerFor('report_blocks').reorder(caseId, { ids: moved }, session)

    const feed = await seed!
      .select()
      .from(changeFeed)
      .where(and(eq(changeFeed.caseId, caseId), eq(changeFeed.entity, 'report_blocks')))

    // **Swapping the first two moves two rows, not the whole report.**
    // Renumbering every block on every reorder would repaint every other
    // analyst's open screen for rows that did not change.
    expect(new Set(feed.map((row) => row.entityId))).toEqual(
      new Set([before[0]!.id, before[1]!.id]),
    )
    expect(new Set(feed.map((row) => row.actorId))).toEqual(new Set(['reorder-analyst']))
    expect(new Set(feed.flatMap((row) => row.fields))).toEqual(new Set(['position']))
  })

  it('repaints every other screen open on the case', async () => {
    /**
     * **Every other write path ends with `announce` and this one did not.**
     */
    const before = await blocksOf()
    const moved = [before[1]!.id, before[0]!.id, ...before.slice(2).map((b) => b.id)]
    announced.length = 0
    await controllerFor('report_blocks').reorder(caseId, { ids: moved }, session)

    expect(announced).toHaveLength(1)
    expect(announced[0]?.caseId).toBe(caseId)
  })

  it('refuses a list that names one row twice', async () => {
    // A duplicate is not a partial list, so the completeness check cannot see
    // it: the count still matches. Two positions would be written for one row
    // and the last write would win silently.
    const before = await blocksOf()
    const doubled = [before[0]!.id, ...before.slice(1).map((b) => b.id)]
    doubled[1] = before[0]!.id
    await expect(
      controllerFor('report_blocks').reorder(caseId, { ids: doubled }, session),
    ).rejects.toMatchObject({ status: 422 })
    expect((await blocksOf()).map((b) => b.id)).toEqual(before.map((b) => b.id))
  })

  it('refuses a list spanning two reports, at the length that gets past the count', async () => {
    /**
     * **One of this report's blocks swapped for one of another's, so the count
     * still matches.**
     */
    const before = await blocksOf()
    const [other] = await seed!
      .select({ id: reports.id })
      .from(reports)
      .where(and(eq(reports.caseId, caseId), ne(reports.id, reportId)))
      .limit(1)
    expect(other, 'the demo case has a second report').toBeDefined()
    const [stranger] = await seed!
      .select({ id: reportBlocks.id })
      .from(reportBlocks)
      .where(eq(reportBlocks.reportId, other!.id))
      .limit(1)
    expect(stranger, 'the second report has a block').toBeDefined()

    const mixed = [...before.slice(0, -1).map((b) => b.id), stranger!.id]
    expect(mixed).toHaveLength(before.length)

    await expect(
      controllerFor('report_blocks').reorder(caseId, { ids: mixed }, session),
    ).rejects.toMatchObject({ status: 422, response: { message: /one reportId at a time/ } })
    expect((await blocksOf()).map((b) => b.id)).toEqual(before.map((b) => b.id))
  })

  it('refuses to reorder the blocks of a report that has been sent', async () => {
    const before = await blocksOf()
    await seed!.update(reports).set({ sentAt: new Date() }).where(eq(reports.id, reportId))

    await expect(
      controllerFor('report_blocks').reorder(
        caseId,
        { ids: [before[1]!.id, before[0]!.id, ...before.slice(2).map((b) => b.id)] },
        session,
      ),
    ).rejects.toMatchObject({ status: 409 })
    expect((await blocksOf()).map((b) => b.id)).toEqual(before.map((b) => b.id))
  })

  it('says nothing when the order it was sent is the order already stored', async () => {
    /**
     * **The other half of the announce, and the half that was untested.**
     */
    const before = await blocksOf()
    announced.length = 0
    await controllerFor('report_blocks').reorder(
      caseId,
      { ids: before.map((b) => b.id) },
      session,
    )
    expect(announced).toEqual([])
  })

  it('refuses a collection that has no order to write, on a complete list', async () => {
    /**
     * **An empty list proves nothing here.**
     */
    const rows = await seed!
      .select({ id: reports.id })
      .from(reports)
      .where(eq(reports.caseId, caseId))
    expect(rows.length, 'the demo case has reports').toBeGreaterThan(0)

    await expect(
      controllerFor('reports').reorder(caseId, { ids: rows.map((row) => row.id) }, session),
    ).rejects.toMatchObject({ status: 422 })
  })
})
