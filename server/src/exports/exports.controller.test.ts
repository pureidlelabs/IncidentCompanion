/**
 * Exporting a collection, driven against a real case.
 *
 * **The escaping is tested in `csv.test.ts`; this tests that the route uses
 * it.** A writer that neutralises formulas and a route that bypasses the
 * writer both pass their own tests.
 */
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ExportsController } from './exports.controller.js'
import { ImportService } from './import.service.js'
import { CollectionService } from '../collections/collection.service.js'
import { DemoContentSeeder } from '../demos/content.seeder.js'
import { DemoSeederService } from '../demos/seeder.service.js'
import { cases, systems, user } from '../db/schema/index.js'
import { openTestPool } from '../../test/database.js'

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

/**
 * The handle fixtures arrange rows through.
 *
 * **`ic_seed`, because a fixture writes across cases and the app role may
 * not.** Row-level security refuses an unscoped write, so a fixture on the
 * app handle fails before the test it was arranging ever runs. The subject
 * under test keeps `db` - if it forgets to scope itself, it fails here.
 */
const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null

const IMPORTER = 'export-analyst'

describe.skipIf(!db)('exporting a collection as CSV', () => {
  let controller: ExportsController
  let caseId: string

  beforeAll(async () => {
    await seed!.delete(cases)
    await new DemoSeederService(seed!, seed, new DemoContentSeeder()).reseed()
    const [row] = await seed!.select().from(cases).where(eq(cases.reference, 'DEMO-2026-001'))
    caseId = row!.id
    const collections = new CollectionService(db!)
    controller = new ExportsController(collections, new ImportService(collections))

    /**
     * **A real actor, because a refusal test needs the write to be *able* to
     * succeed.** `createdBy` is a foreign key: with a made-up id an import that
     * wrongly proceeded would die on the insert, and a case asserting "nothing
     * was written" would pass on the defect it exists to catch.
     */
    const now = new Date()
    await seed!
      .insert(user)
      .values({
        id: IMPORTER,
        name: 'Export Analyst',
        email: 'export-analyst@example.test',
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
  })

  afterAll(async () => {
    await seed!.delete(cases)
    await pool!.end()
  })

  it('writes a header and one line per row', async () => {
    const rows = await seed!.select().from(systems).where(eq(systems.caseId, caseId))
    expect(rows.length).toBeGreaterThan(0)

    const csv = await controller.collectionCsv(caseId, 'systems')

    const lines = csv.split('\n').filter((line) => line.length > 0)
    expect(lines).toHaveLength(rows.length + 1)
    expect(lines[0]).toContain('hostname')
  })

  it('carries every column the table has', async () => {
    /**
     * **Asked of the database, not of Drizzle.** The exporter builds its
     * header from the ORM's view of the table, so comparing against that same
     * view is the constant checked against itself -- a column the schema file
     * never declared is absent from both sides and the case still passes.
     * `information_schema` is the one answer to *what columns does this table
     * have* that is not the thing under test.
     */
    const found = await seed!.execute(sql`
      select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'systems'
    `)
    const columns = (found.rows as { column_name: string }[]).map((row) => row.column_name)
    expect(columns.length, 'no columns came back, so the sweep swept nothing').toBeGreaterThan(5)

    const csv = await controller.collectionCsv(caseId, 'systems')
    const header = csv.split('\n')[0]!.split(',')

    expect([...header].sort()).toEqual([...columns].sort())
  })

  /**
   * **One customer's rows must not leave in another's file**, which is the
   * whole of what the `where` is for. Asserted on a value planted in the other
   * case rather than on its id: a row's *content* is what leaks, and a test
   * that only checks the id passes on an export that carried the hostname.
   */
  it('exports only the case asked for', async () => {
    const [other] = await seed!.select().from(cases).where(eq(cases.reference, 'DEMO-2026-014'))
    await seed!
      .insert(systems)
      .values({ caseId: other!.id, hostname: 'THEIR-SECRET-HOST', systemType: 'server' })

    const csv = await controller.collectionCsv(caseId, 'systems')

    expect(csv).not.toContain('THEIR-SECRET-HOST')
    expect(csv).not.toContain(other!.id)
  })

  it('answers 400 for a collection that does not exist, naming the ones that do', async () => {
    await expect(controller.collectionCsv(caseId, 'nonsense')).rejects.toMatchObject({
      response: { message: expect.stringContaining('systems') },
    })
  })

  /**
   * **The route goes through the shared writer**, which is where a leading `=`,
   * `+`, `-` or `@` is neutralised. A route assembling its own CSV passes every
   * other case in this file and hands a spreadsheet a formula out of the
   * database.
   *
   * Restored after a cut that took it along with the validation cases beside
   * it: it is about the writer, and nothing else here holds the route to it.
   */
  it('neutralises a formula that came out of the database', async () => {
    await seed!
      .insert(systems)
      .values({ caseId, hostname: '=cmd|/c calc', systemType: 'laptop' })
      .returning()

    const csv = await controller.collectionCsv(caseId, 'systems')

    expect(csv).toContain("'=cmd|/c calc")
    expect(csv).not.toMatch(/(^|,)=cmd/m)
  })

  describe('the indicator feed', () => {
    function recorder(): { type(value: string): unknown; seen: string[] } {
      const seen: string[] = []
      return { seen, type: (value: string) => seen.push(value) }
    }

    it('serves CSV by default, and says so', async () => {
      const response = recorder()
      const body = await controller.indicators(caseId, response, { format: 'csv' })

      expect(response.seen).toEqual(['text/csv'])
      // Spelled out rather than read off `INDICATOR_CSV_COLUMNS`, which would
      // assert the constant against itself. `source` and `case_id` are what a
      // downstream blocklist audits the row by.
      expect(body.split('\n')[0]).toBe(
        'type,value,disposition,context,source,blocked,case_id',
      )
    })

    it('serves a STIX bundle as JSON, not as the default text/html', async () => {
      const response = recorder()
      const body = await controller.indicators(caseId, response, { format: 'stix' })

      expect(response.seen).toEqual(['application/json'])
      expect(JSON.parse(body)['type']).toBe('bundle')
    })

    it('refuses a TLP on a format that cannot carry one', async () => {
      await expect(
        controller.indicators(caseId, recorder(), { format: 'csv', tlp: 'amber' }),
      ).rejects.toMatchObject({ response: { message: expect.stringContaining('carries no TLP') } })
    })

    it('reads across all three tables, not just the network one', async () => {
      const body = await controller.indicators(caseId, recorder(), { format: 'csv' })
      const types = body
        .split('\n')
        .slice(1)
        .map((line) => line.split(',')[0])
      // The demo case carries malware with digests; the point is that the feed
      // is not one table's worth.
      expect(new Set(types).size).toBeGreaterThan(1)
    })
  })

  it('writes a header and nothing else for a case with no rows', async () => {
    const [empty] = await seed!
      .insert(cases)
      .values({ title: 'Empty', createdBy: null, updatedBy: null })
      .returning()

    const csv = await controller.collectionCsv(empty!.id, 'systems')

    expect(csv.split('\n').filter((line) => line.length > 0)).toHaveLength(1)
  })
})
