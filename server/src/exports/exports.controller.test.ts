/**
 * Exporting a collection, driven against a real case.
 *
 * **The escaping is tested in `csv.test.ts`; this tests that the route uses
 * it.** A writer that neutralises formulas and a route that bypasses the
 * writer both pass their own tests.
 */
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ExportsController } from './exports.controller.js'
import { ImportService } from './import.service.js'
import { CollectionService } from '../collections/collection.service.js'
import { DemoContentSeeder } from '../demos/content.seeder.js'
import { DemoSeederService } from '../demos/seeder.service.js'
import { cases, systems } from '../db/schema/index.js'
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

  /**
   * **Every column, from the table rather than a list.** A hand-written column
   * list is the copy that goes stale the first time a column is added, and the
   * symptom is an export quietly missing a field.
   */
  it('carries every column the table has', async () => {
    const csv = await controller.collectionCsv(caseId, 'systems')
    const header = csv.split('\n')[0]!.split(',')

    for (const column of ['id', 'case_id', 'hostname', 'version', 'created_at']) {
      expect(header).toContain(column)
    }
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
   * **The route has to use the writer.** A row whose hostname begins `=` must
   * arrive quoted; a route that assembled its own CSV would pass every test in
   * `csv.test.ts` and still ship the hole.
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
     * **A STIX bundle answered as `text/html` renders in the browser instead
     * of downloading**, and an automation reading the header to choose a
     * parser is told the wrong thing. Nest's default for a returned string is
     * exactly that, so this is the route's own decision to make.
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
     * **Refused rather than ignored.** A caller who asked for a marking and
     * got a file without one has been told nothing, and may pass it on
     * believing it is marked.
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
