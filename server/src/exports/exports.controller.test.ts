/**
 * Exporting a collection, driven against a real case.
 */
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants'
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
 */
const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null

/** The actor an import is attributed to. A real row, not a made-up id. */
const IMPORTER = 'export-analyst'

describe.skipIf(!db)('exporting a collection as CSV', () => {
  let controller: ExportsController
  let caseId: string

  beforeAll(async () => {
    await seed!.delete(cases)
    await new DemoSeederService(seed!, seed, new DemoContentSeeder(seed)).reseed()
    const [row] = await seed!.select().from(cases).where(eq(cases.reference, 'DEMO-2026-001'))
    caseId = row!.id
    const collections = new CollectionService(db!)
    controller = new ExportsController(collections, new ImportService(collections))

    /**
     * **A real actor, because a refusal test needs the write to be *able* to
     * succeed.**
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

    // Header plus a line per row. Trailing newline, hence the filter.
    const lines = csv.split('\n').filter((line) => line.length > 0)
    expect(lines).toHaveLength(rows.length + 1)
    expect(lines[0]).toContain('hostname')
  })

  it('carries every column the table has', async () => {
    /**
     * **Asked of the database, not of Drizzle.**
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
   * **One customer's rows must not leave in another's file**, which is the whole
   * of what the `where` is for.
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
   * **An instruction the import does not offer is refused, and does not fall
   * back to one it does.**
   */
  describe('an instruction the import does not offer', () => {
    const oneRow = async function* () {
      yield Buffer.from('hostname\nWKS-NEVER-WRITTEN\n')
    }

    const session = { user: { id: IMPORTER } } as never

    // The empty string is what `?onDuplicate=` arrives as, and the
    // wrong-cased spelling is what a caller writing the query by hand sends.
    it.each(['replaces', 'REPLACE', 'merge', ''])(
      'refuses %o rather than reading it as skip',
      async (instruction) => {
        await expect(
          controller.importCsv(caseId, 'systems', instruction, oneRow(), session),
        ).rejects.toMatchObject({
          response: { message: expect.stringContaining('skip or replace') },
        })
      },
    )

    /**
     * The half a refusal alone does not prove: a guard that threw *after*
     * writing would satisfy every case above and still have imported the file.
     */
    it('writes nothing when it refuses', async () => {
      const before = await seed!.select().from(systems).where(eq(systems.caseId, caseId))

      await expect(
        controller.importCsv(caseId, 'systems', 'replaces', oneRow(), session),
      ).rejects.toThrow()

      const after = await seed!.select().from(systems).where(eq(systems.caseId, caseId))
      expect(after.length, 'a refused import wrote rows anyway').toBe(before.length)
      expect(
        after.some((row) => row.hostname === 'WKS-NEVER-WRITTEN'),
        'the refused row landed',
      ).toBe(false)
    })
  })

  /**
   * **The route has to use the writer.**
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
    /** Captures what the route set, so the content type is asserted not assumed. */
    function recorder(): { type(value: string): unknown; seen: string[] } {
      const seen: string[] = []
      return { seen, type: (value: string) => seen.push(value) }
    }

    /**
     * **The one thing the tests around it cannot see.** Every other case here
     * calls `controller.indicators(...)` positionally, so the query parameter's
     * *name* is never exercised - and the route bound `fmt` while the client
     * sends `?format=`. Result: `?format=stix` served CSV, and adding a TLP
     * answered 400 saying "Format csv carries no TLP marking" for a request
     * that said stix. Green on both suites for as long as it existed.
     *
     * Asserted off the route metadata, because that is where the wire spelling
     * actually lives.
     */
    it('reads the format off the query name the client sends', () => {
      const meta = Reflect.getMetadata(
        ROUTE_ARGS_METADATA,
        ExportsController,
        'indicators',
      ) as Record<string, { data?: unknown }>
      const named = Object.values(meta)
        .map((one) => one.data)
        .filter((one): one is string => typeof one === 'string')

      expect(named, 'the route no longer reads ?format').toContain('format')
      expect(named, 'fmt is the internal name, never the wire one').not.toContain('fmt')
    })

    it('serves CSV by default, and says so', async () => {
      const response = recorder()
      const body = await controller.indicators(caseId, response)

      expect(response.seen).toEqual(['text/csv'])
      // Spelled out rather than read off `INDICATOR_CSV_COLUMNS`, which would
      // assert the constant against itself. `source` and `case_id` are what a
      // downstream blocklist audits the row by.
      expect(body.split('\n')[0]).toBe(
        'type,value,disposition,context,source,blocked,case_id',
      )
    })

    /**
     * **A STIX bundle answered as `text/html` renders in the browser instead of
     * downloading**, and an automation reading the header to choose a parser is
     * told the wrong thing.
     */
    it('serves a STIX bundle as JSON, not as the default text/html', async () => {
      const response = recorder()
      const body = await controller.indicators(caseId, response, 'stix')

      expect(response.seen).toEqual(['application/json'])
      expect(JSON.parse(body)['type']).toBe('bundle')
    })

    it('refuses a format nobody defined, naming the ones that exist', async () => {
      await expect(controller.indicators(caseId, recorder(), 'xlsx')).rejects.toMatchObject({
        response: { message: expect.stringContaining('csv, stix') },
      })
    })

    /**
     * **Refused rather than ignored.**
     */
    it('refuses a TLP on a format that cannot carry one', async () => {
      await expect(controller.indicators(caseId, recorder(), 'csv', 'amber')).rejects.toMatchObject(
        { response: { message: expect.stringContaining('carries no TLP') } },
      )
    })

    it('refuses a TLP colour nobody defined', async () => {
      await expect(controller.indicators(caseId, recorder(), 'stix', 'taupe')).rejects.toMatchObject(
        { response: { message: expect.stringContaining('No TLP marking') } },
      )
    })

    it('reads across all three tables, not just the network one', async () => {
      const body = await controller.indicators(caseId, recorder())
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
