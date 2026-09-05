/**
 * **Every row in the file is accounted for in what the import reports back.**
 */
import { parse } from 'csv-parse/sync'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { ExportsController } from './exports.controller.js'
import { ImportService, type OnDuplicate } from './import.service.js'
import { CollectionService } from '../collections/collection.service.js'
import { DemoContentSeeder } from '../demos/content.seeder.js'
import { DemoSeederService } from '../demos/seeder.service.js'
import { cases, user } from '../db/schema/index.js'
import { IMPORTABLE } from '../domain/collections.js'
import { TABLES, type BulkTarget } from '../collections/registry.js'
import { openTestPool } from '../../test/database.js'

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null

const ME = 'conservation-analyst'

/**
 * What the collections an import can write and a selection can export have in
 * common.
 */
const SWEPT = IMPORTABLE.filter((name): name is BulkTarget => name in TABLES)

interface Counted {
  added: number
  skipped: number
  replaced: number
  refused: number
}

/**
 * The data rows in a CSV, counted with the same library that writes it.
 */
function dataRows(csv: string): number {
  return (parse(csv, { bom: true, skip_empty_lines: true, relax_column_count: true }) as unknown[])
    .length - 1
}

/** Every row the import says it did something with. */
const accountedFor = (result: Counted) =>
  result.added + result.skipped + result.replaced + result.refused

describe.skipIf(!db)('every row in the file is accounted for', () => {
  let service: ImportService
  let exports_: ExportsController
  let caseId: string
  let emptyCaseId: string

  beforeEach(async () => {
    await seed!.delete(cases)
    await new DemoSeederService(seed!, seed, new DemoContentSeeder(seed)).reseed()
    const [row] = await seed!.select().from(cases).where(eq(cases.reference, 'DEMO-2026-001'))
    caseId = row!.id

    const now = new Date()
    await seed!
      .insert(user)
      .values({
        id: ME,
        name: 'Conservation Analyst',
        email: 'conservation@example.test',
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()

    const [blank] = await seed!.insert(cases).values({ title: 'Blank' }).returning()
    emptyCaseId = blank!.id

    const collections = new CollectionService(db!)
    service = new ImportService(collections)
    exports_ = new ExportsController(collections, service)
  })

  afterAll(async () => {
    await seed!.delete(cases)
    await pool!.end()
  })

  /** An empty sweep would pass every case below without importing anything. */
  it('has collections to sweep', () => {
    expect(SWEPT.length).toBeGreaterThan(4)
  })

  describe.each(SWEPT)('%s', (collection) => {
    it('adds up to the number of rows in the file, on each route through', async (ctx) => {
      const csv = await exports_.collectionCsv(caseId, collection)
      const inFile = dataRows(csv)
      // Visible as a skip rather than as a pass: a collection the demo case
      // does not populate has no file to conserve, and returning green here
      // would be a case that asserted nothing.
      if (inFile === 0) return ctx.skip()

      /**
       * Three routes, in order, against the same case: the first import finds
       * nothing to collide with, the second collides with everything it just
       * wrote, and the third is asked to replace rather than skip.
       */
      const routes: [string, OnDuplicate][] = [
        ['into an empty case', 'skip'],
        ['over rows it just wrote', 'skip'],
        ['over rows it just wrote, replacing', 'replace'],
      ]

      for (const [what, onDuplicate] of routes) {
        const result = await service.fromCsv(collection, emptyCaseId, csv, ME, onDuplicate)
        expect(
          accountedFor(result),
          `${collection}, ${what}: ${JSON.stringify(result)} for ${String(inFile)} rows`,
        ).toBe(inFile)
      }
    })

    /**
     * The first import of a file into a case that holds nothing has one honest
     * answer, and it is the strongest of the three: everything was added.
     */
    it('adds every row of a file the case has never seen', async (ctx) => {
      const csv = await exports_.collectionCsv(caseId, collection)
      const inFile = dataRows(csv)
      if (inFile === 0) return ctx.skip()

      const result = await service.fromCsv(collection, emptyCaseId, csv, ME, 'skip')

      expect(result.added).toBe(inFile)
      expect(result.skipped + result.replaced + result.refused).toBe(0)
    })
  })
})
