/**
 * A sent report, attacked through every door that can write one.
 */
import { ConflictException } from '@nestjs/common'
import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CasesService } from '../cases/cases.service.js'
import { CollectionService } from '../collections/collection.service.js'
import {
  REPORT_BLOCKS_COLLECTION,
  REPORTS_COLLECTION,
  ReportsController,
} from '../collections/entities.controller.js'
import { DemoContentSeeder } from '../demos/content.seeder.js'
import { DEMO_REPORTS } from '../demos/reports.js'
import { DemoSeederService } from '../demos/seeder.service.js'
import { cases, reportBlocks, reports, user } from '../db/schema/index.js'
import { patchSchema } from '../domain/field-spec.js'
import { reportSchema } from '../domain/entities/report.js'
import { ProseService } from '../prose/prose.service.js'
import { ReportLifecycleService } from './lifecycle.service.js'
import { ReportRenderService } from './render.service.js'
import { english } from './document/packs.js'
import { openTestPool } from '../../test/database.js'
import { EvidenceStore } from '../evidence/store.js'

/**
 * A store no test here reads through.
 */
const noFigures = (): EvidenceStore =>
  new EvidenceStore({ get: () => undefined } as unknown as ConstructorParameters<typeof EvidenceStore>[0])

const englishOnly = {
  translatorFor: () => Promise.resolve(english()),
  coverageOf: () => Promise.resolve(1),
} as never

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null

const STAMP = '2020-01-01T00:00:00.000Z'

describe.skipIf(!db)('a report that has been sent', () => {
  let collections: CollectionService
  let lifecycle: ReportLifecycleService
  let controller: ReportsController
  let caseId: string
  let actorId: string
  let session: { user: { id: string } }

  /** A report with two written sections, and no send stamp. */
  async function draftReport(label: string): Promise<{ id: string; version: number }> {
    const [report] = await seed!
      .insert(reports)
      .values({ caseId, label, language: 'en', createdBy: actorId })
      .returning()
    for (const position of [0, 1]) {
      await seed!.insert(reportBlocks).values({
        caseId,
        reportId: report!.id,
        kind: 'written',
        heading: `Section ${String(position)}`,
        position,
        createdBy: actorId,
      })
    }
    return { id: report!.id, version: report!.version }
  }

  const blocksOf = (reportId: string) =>
    seed!
      .select()
      .from(reportBlocks)
      .where(and(eq(reportBlocks.caseId, caseId), eq(reportBlocks.reportId, reportId)))
      .orderBy(asc(reportBlocks.position))

  beforeAll(async () => {
    actorId = 'freeze-analyst'
    const now = new Date()
    await seed!
      .insert(user)
      .values({
        id: actorId,
        name: 'Freeze Analyst',
        email: 'freeze-analyst@example.test',
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
    session = { user: { id: actorId } }

    const cases_ = new CasesService(db!, {
      announce: () => {},
      othersOn: () => Promise.resolve([]),
    } as never)
    const row = await cases_.create({ title: 'A filed report' }, actorId)
    caseId = row.id

    const prose = new ProseService(db!)
    const render = new ReportRenderService(db!, cases_, prose, englishOnly, noFigures())
    lifecycle = new ReportLifecycleService(db!, { entry: () => Promise.resolve(undefined) } as never, render, prose)
    collections = new CollectionService(db!)
    controller = new ReportsController(collections)
  })

  afterAll(async () => {
    await seed!.delete(cases).where(eq(cases.id, caseId))
    await pool!.end()
  })

  /**
   * **Case 1: the stamp has no door but `send`.**
   */
  it('refuses the stamp in a create body and in a patch', () => {
    expect(reportSchema.strict().safeParse({ label: 'x', sentAt: STAMP }).success).toBe(false)
    // **`.strict()` refuses rather than dropping**, so this is a 422 naming the
    // key rather than a patch that quietly changes nothing.
    expect(patchSchema(reportSchema).safeParse({ sentAt: STAMP }).success).toBe(false)
  })

  it('leaves the row untouched when a PATCH tries to stamp it sent', async () => {
    const draft = await draftReport('Stampable')

    await expect(
      controller.update(
        caseId,
        draft.id,
        { version: draft.version, sentAt: STAMP },
        session as never,
      ),
    ).rejects.toThrow()

    const [row] = await seed!.select().from(reports).where(eq(reports.id, draft.id))
    expect(row!.sentAt).toBeNull()
    expect(row!.version).toBe(draft.version)
  })

  /**
   * **Case 2: a sent report refuses every block write.**
   */
  describe('its sections', () => {
    let sentId: string
    let before: Record<string, unknown>[]

    beforeAll(async () => {
      const draft = await draftReport('Filed')
      await lifecycle.send(caseId, draft.id, actorId, 'en')
      sentId = draft.id
      before = await blocksOf(sentId)
    })

    const doors: [string, (blocks: Record<string, unknown>[]) => Promise<unknown>][] = [
      [
        'create',
        () =>
          collections.create(
            REPORT_BLOCKS_COLLECTION,
            caseId,
            { reportId: sentId, kind: 'written', heading: 'Added later', position: 9 },
            actorId,
          ),
      ],
      [
        'createMany',
        () =>
          collections.createMany(
            REPORT_BLOCKS_COLLECTION,
            caseId,
            [{ reportId: sentId, kind: 'written', heading: 'Added later', position: 9 }],
            actorId,
          ),
      ],
      [
        'update',
        (blocks) =>
          collections.update(
            REPORT_BLOCKS_COLLECTION,
            caseId,
            blocks[0]!['id'] as string,
            blocks[0]!['version'] as number,
            { heading: 'Rewritten after filing' },
            actorId,
          ),
      ],
      [
        'updateMany',
        (blocks) =>
          collections.updateMany(
            REPORT_BLOCKS_COLLECTION,
            caseId,
            blocks.map((block) => ({
              id: block['id'] as string,
              version: block['version'] as number,
            })),
            { heading: 'Rewritten after filing' },
            actorId,
          ),
      ],
      [
        'remove',
        (blocks) =>
          collections.remove(
            REPORT_BLOCKS_COLLECTION,
            caseId,
            blocks[0]!['id'] as string,
            blocks[0]!['version'] as number,
            actorId,
          ),
      ],
    ]

    it.each(doors)('refuses %s', async (_name, write) => {
      await expect(write(before)).rejects.toBeInstanceOf(ConflictException)
    })

    /**
     * **The body, not only the class.**
     */
    it.each(doors)('names the report and the stamp on %s', async (_name, write) => {
      await expect(write(before)).rejects.toMatchObject({
        response: { reportId: sentId, sentAt: expect.any(String) },
      })
    })

    /**
     * **The blocks are what `send` froze, field for field.**
     */
    it('leaves the sections exactly as they were frozen', async () => {
      const now = (await blocksOf(sentId)) as unknown as Record<string, unknown>[]
      expect(now).toEqual(before)

      const [row] = await seed!.select().from(reports).where(eq(reports.id, sentId))
      const frozen = row!.frozen as { sections: { blockId: string }[] }
      expect(frozen.sections.map((section) => section.blockId)).toEqual(
        now.map((block) => block['id']),
      )
    })

    /** The report's own row is closed too, not only its sections. */
    it('refuses a patch to the report row itself', async () => {
      const [row] = await seed!.select().from(reports).where(eq(reports.id, sentId))
      await expect(
        collections.update(
          REPORTS_COLLECTION,
          caseId,
          sentId,
          row!.version,
          { label: 'Renamed after filing' },
          actorId,
        ),
      ).rejects.toBeInstanceOf(ConflictException)
    })

    /**
     * **Moving a block into a sent report is a write to that report.**
     */
    it('refuses a block reparented into it from a draft', async () => {
      const draft = await draftReport('Elsewhere')
      const [block] = await blocksOf(draft.id)

      await expect(
        collections.update(
          REPORT_BLOCKS_COLLECTION,
          caseId,
          block!.id,
          block!.version,
          { reportId: sentId },
          actorId,
        ),
      ).rejects.toBeInstanceOf(ConflictException)
    })
  })

  /**
   * **Case 3: every write door is enumerated.**
   */
  it('has exactly the methods the guard was placed on', () => {
    const prototype = CollectionService.prototype as unknown as Record<string, unknown>
    const methods = Object.getOwnPropertyNames(prototype)
      .filter((name) => name !== 'constructor')
      // Getters are excluded by reading the descriptor rather than the value:
      // touching `database` on the prototype would invoke it.
      .filter((name) => typeof Object.getOwnPropertyDescriptor(prototype, name)?.value === 'function')
      .sort()

    const writes = [
      'create',
      'createMany',
      // Writes several collections on one handle, for an import. It asks
      // `refuseIfClosed` per group before the transaction opens, exactly as
      // `createMany` does -- a frozen report refuses the whole import rather
      // than the group that named it.
      'createAcross',
      'remove',
      'reorder',
      'update',
      'updateMany',
    ]
    /**
     * **`removeMany` is a write and carries no guard**, because reports are not
     * reachable through it: `TABLES` is the bulk half of the registry and has
     * never held `reports` or `report_blocks`. -> `collections/registry.ts`
     */
    const otherwise = [
      'announce',
      'coerceTimes',
      'columns',
      'get',
      'list',
      // Reads to decide, and edits the row in memory before anybody inserts
      // it. No statement of its own, so no closed-row guard: `createMany`,
      // which calls it, carries one.
      'dropForeignReferences',
      'refuseDanglingReferences',
      // Reads a stored row and throws; it writes nothing, so it needs no
      // closed-row guard of its own -- the write it guards already has one.
      'refuseIfCrossFieldRuleBroken',
      'refuseIfHeldByAnother',
      'removeMany',
      // The shared body of `createMany` and `createAcross`, on a transaction
      // its caller opened. Both callers ask `refuseIfClosed` first, which is
      // the only place that question can be asked before a handle exists.
      'insertWithin',
    ]
    expect(methods).toEqual([...writes, ...otherwise].sort())
  })
})

/**
 * **Case 4: the seeder is the third write door.**
 */
describe.skipIf(!db)('the demo cases', () => {
  beforeAll(async () => {
    await new DemoSeederService(seed!, seed, new DemoContentSeeder(seed)).reseed()
  }, 90_000)

  it('declares reports that were filed, so this is not vacuous', () => {
    const declared = Object.values(DEMO_REPORTS)
      .flat()
      .filter((report) => report.sentAtMinute !== undefined)
    expect(declared.length).toBeGreaterThan(0)
  })

  it('seeds no report that is stamped sent with nothing frozen', async () => {
    const broken = await seed!
      .select({ id: reports.id, label: reports.label })
      .from(reports)
      .where(and(isNotNull(reports.sentAt), isNull(reports.frozen)))

    expect(broken.map((row) => row.label)).toEqual([])
  })
})
