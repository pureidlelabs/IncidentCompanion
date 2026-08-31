/**
 * Importing a CSV, driven against a real case.
 *
 * **The headline case is export-then-import**, because that is the only one
 * that exercises both halves against each other. A parser tested on a
 * hand-written file and a writer tested on hand-written rows can each pass
 * while disagreeing about ids, quoting and column spelling.
 */
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { ExportsController } from './exports.controller.js'
import { ImportService } from './import.service.js'
import { CollectionService } from '../collections/collection.service.js'
import { DemoContentSeeder } from '../demos/content.seeder.js'
import { DemoSeederService } from '../demos/seeder.service.js'
import { cases, evidence, impact, systems, user } from '../db/schema/index.js'
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

const ME = 'import-analyst'

describe.skipIf(!db)('importing a CSV', () => {
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
        name: 'Import Analyst',
        email: 'import@example.test',
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

  /**
   * **The whole point of both modules.** The export writes ids and quotes
   * formulas; the import has to drop the one and undo the other, or the file
   * this app hands out is a file it will not take back.
   */
  it('takes back the file it just wrote, into another case', async () => {
    const before = await seed!.select().from(systems).where(eq(systems.caseId, caseId))
    const csv = await exports_.collectionCsv(caseId, 'systems')

    const { added } = await service.fromCsv('systems', emptyCaseId, csv, ME)

    expect(added).toBe(before.length)
    const after = await seed!.select().from(systems).where(eq(systems.caseId, emptyCaseId))
    expect(after.map((row) => row.hostname).sort()).toEqual(
      before.map((row) => row.hostname).sort(),
    )
  })

  /**
   * **Re-imported into its own case, the rows are added and not collided.**
   * The ids are dropped, so this is a duplicate rather than a conflict - which
   * is the behaviour the id-stripping rule exists to produce.
   */
  it('re-imports into the case it came from without an id collision', async () => {
    // **The property is that the app's own export is importable**, which the
    // exported `id` column could break by colliding. It used to be observed by
    // the row count doubling; since 2026-08-14 a re-import recognises every row
    // and adds none, so the count staying put is the same observation and the
    // skip count is what says the file was read rather than refused.
    const before = await seed!.select().from(systems).where(eq(systems.caseId, caseId))
    const csv = await exports_.collectionCsv(caseId, 'systems')

    const result = await service.fromCsv('systems', caseId, csv, ME)

    const after = await seed!.select().from(systems).where(eq(systems.caseId, caseId))
    expect(after).toHaveLength(before.length)
    expect(result).toEqual({ added: 0, skipped: before.length, replaced: 0, refused: 0, unlinked: 0 })
  })

  it('attributes the imported rows to the caller', async () => {
    await service.fromCsv('systems', emptyCaseId, 'hostname\nWKS-NEW\n', ME)
    const [row] = await seed!.select().from(systems).where(eq(systems.caseId, emptyCaseId))
    expect(row!.createdBy).toBe(ME)
  })

  it('accepts the app spelling of a column as well as the database one', async () => {
    await service.fromCsv('systems', emptyCaseId, 'hostname,systemType\nWKS-A,laptop\n', ME)
    await service.fromCsv('systems', emptyCaseId, 'hostname,system_type\nWKS-B,server\n', ME)

    const rows = await seed!.select().from(systems).where(eq(systems.caseId, emptyCaseId))
    expect(rows.map((row) => row.systemType).sort()).toEqual(['laptop', 'server'])
  })

  /**
   * **All or nothing.** A file whose later row is bad must leave the case
   * exactly as it was - a partial import is the worst outcome, because the
   * analyst cannot tell what landed without reading every row.
   */
  it('writes nothing at all when a later row is invalid', async () => {
    const bad = 'hostname,system_type\nWKS-GOOD,laptop\n,\n'

    await expect(service.fromCsv('systems', emptyCaseId, bad, ME)).rejects.toThrow()

    expect(await seed!.select().from(systems).where(eq(systems.caseId, emptyCaseId))).toHaveLength(0)
  })

  /**
   * **The row number counts the header as line 1**, which is what an analyst
   * sees in a spreadsheet - so the third data row is "row 4" and matches the
   * line they are looking at.
   */
  it('names the row that failed, so a 4000-line file is actionable', async () => {
    const bad = 'hostname,system_type\nWKS-A,laptop\nWKS-B,server\nWKS-C,teapot\n'
    await expect(service.fromCsv('systems', emptyCaseId, bad, ME)).rejects.toMatchObject({
      response: { message: expect.stringContaining('row 4') },
    })
  })

  /** A trailing blank line is a text editor, not a bad file. */
  it('ignores a trailing blank line', async () => {
    expect(await service.fromCsv('systems', emptyCaseId, 'hostname\nWKS-A\n\n', ME)).toEqual({
      added: 1,
      skipped: 0,
      replaced: 0,
      refused: 0,
      unlinked: 0,
    })
  })

  /**
   * **The property the whole of `identity.ts` exists for**, and the one a
   * round trip cannot see: importing a file the case already holds must not
   * double it. Before this, a re-import of the app's own export added every
   * row again and reported success.
   */
  it('adds nothing on a second import of the same file', async () => {
    const csv = 'hostname,system_type\nWKS-FIN01,laptop\nSRV-DC01,server\n'
    expect(await service.fromCsv('systems', emptyCaseId, csv, ME)).toEqual({
      added: 2,
      skipped: 0,
      replaced: 0,
      refused: 0,
      unlinked: 0,
    })
    expect(await service.fromCsv('systems', emptyCaseId, csv, ME)).toEqual({
      added: 0,
      skipped: 2,
      replaced: 0,
      refused: 0,
      unlinked: 0,
    })
  })

  it('matches on identity rather than on the whole row', async () => {
    // The same host with a different type is the same host. A key over every
    // column would call this new and add it, which is dedup that does nothing.
    await service.fromCsv('systems', emptyCaseId, 'hostname,system_type\nWKS-A,laptop\n', ME)
    expect(
      await service.fromCsv('systems', emptyCaseId, 'hostname,system_type\nWKS-A,server\n', ME),
    ).toEqual({ added: 0, skipped: 1, replaced: 0, refused: 0, unlinked: 0 })
  })

  it('does not merge two rows that differ in what identity is made of', async () => {
    // The over-broad direction, through the route rather than the unit: two
    // accounts sharing a name at different domains are two accounts.
    const csv =
      'account_name,domain\nadmin,corp.local\nadmin,partner.example\n'
    expect(await service.fromCsv('accounts', emptyCaseId, csv, ME)).toEqual({
      added: 2,
      skipped: 0,
      replaced: 0,
      refused: 0,
      unlinked: 0,
    })
  })

  it('does not import one file twice against itself', async () => {
    // A file listing the same host twice is the same defect arriving through
    // the file rather than through the case.
    expect(
      await service.fromCsv('systems', emptyCaseId, 'hostname\nWKS-DUP\nwks-dup\n', ME),
    ).toEqual({ added: 1, skipped: 1, replaced: 0, refused: 0, unlinked: 0 })
  })

  /*
   * **No route-level case for a row with no identity**: `systems` requires a
   * hostname, so a blank one is refused by the schema before dedup sees it, and
   * every keyed collection is the same. The property - an absent key never
   * matches, including another absent key - is held in `identity.test.ts`,
   * where it is reachable.
   */

  it('replaces instead of skipping when the analyst asks it to', async () => {
    await service.fromCsv('systems', emptyCaseId, 'hostname,system_type\nWKS-R,laptop\n', ME)
    expect(
      await service.fromCsv(
        'systems',
        emptyCaseId,
        'hostname,system_type\nWKS-R,server\n',
        ME,
        'replace',
      ),
    ).toEqual({ added: 0, skipped: 0, replaced: 1, refused: 0, unlinked: 0 })
  })

  /**
   * **A replace against a row somebody else has open used to abandon the
   * import.** `update` throws when another analyst holds a row, and an
   * uncaught throw left the fresh rows committed and every later collision
   * unattempted - a partial import, which this module's header calls the worst
   * outcome. The suite could not see it: the service above is built with no
   * channel, so the claim check is inert in every other test here.
   */
  it('carries on when another analyst is holding one of the rows', async () => {
    const held = new CollectionService(db!, {
      announce: () => {},
      othersOn: () => Promise.resolve([]),
      holderOf: () => Promise.resolve({ userId: 'robin', username: 'Robin' }),
    } as never)
    const withClaims = new ImportService(held)

    await withClaims.fromCsv('systems', emptyCaseId, 'hostname\nWKS-HELD\n', ME)

    // The replace is refused because Robin holds it - and the import returns
    // rather than throwing, with the refusal counted and the row untouched.
    const result = await withClaims.fromCsv(
      'systems',
      emptyCaseId,
      'hostname,system_type\nWKS-HELD,server\n',
      ME,
      'replace',
    )
    expect(result).toEqual({ added: 0, skipped: 0, replaced: 0, refused: 1, unlinked: 0 })

    const rows = await seed!.select().from(systems).where(eq(systems.caseId, emptyCaseId))
    expect(rows.map((row) => row.systemType)).not.toContain('server')
  })

  /**
   * That the conflicts service can actually be injected, which `@Optional()`
   * hides: unwired, it is `undefined` and every refusal records nothing with
   * the suite green.
   *
   * Asserted on the module metadata rather than by booting the graph, which
   * would drag in every transitive provider and fail on unrelated wiring.
   */
  it('can be injected with a conflicts service, rather than silently without one', async () => {
    const { ExportsModule } = await import('./exports.module.js')
    const { CollectionsModule } = await import('../collections/collections.module.js')
    const { ConflictsService } = await import('../collections/conflicts.service.js')

    const imports = Reflect.getMetadata('imports', ExportsModule) as unknown[]
    const providers = Reflect.getMetadata('providers', ExportsModule) as unknown[]
    const exported = Reflect.getMetadata('exports', CollectionsModule) as unknown[]

    expect(providers).toContain(ImportService)
    expect(imports).toContain(CollectionsModule)
    expect(exported).toContain(ConflictsService)
  })

  /** An import is not a back door: a value a form refuses, a file refuses too. */
  it('refuses a value the domain schema would refuse from a form', async () => {
    await expect(
      service.fromCsv('systems', emptyCaseId, 'hostname,system_type\nWKS-A,teapot\n', ME),
    ).rejects.toMatchObject({ response: { message: expect.stringContaining('row 2') } })
  })

  it('refuses a collection that has no single schema, naming the ones that do', async () => {
    await expect(
      service.fromCsv('timeline', emptyCaseId, 'kind\nevent\n', ME),
    ).rejects.toMatchObject({ response: { message: expect.stringContaining('systems') } })
  })

  /**
   * Past Postgres' bound-parameter ceiling for one statement. 6,000 is the
   * first size that failed before the insert was chunked, so it is the size
   * asserted.
   */
  it('imports past the single-statement parameter ceiling', async () => {
    const rows = Array.from({ length: 6000 }, (_, at) => `WKS-${at},laptop`).join('\n')

    const { added } = await service.fromCsv(
      'systems',
      emptyCaseId,
      `hostname,system_type\n${rows}\n`,
      ME,
    )

    expect(added).toBe(6000)
    expect(await seed!.select().from(systems).where(eq(systems.caseId, emptyCaseId))).toHaveLength(
      6000,
    )
  }, 60_000)

  it('reads a header-only file as nothing to do', async () => {
    expect(await service.fromCsv('systems', emptyCaseId, 'hostname\n', ME)).toEqual({
      added: 0,
      skipped: 0,
      replaced: 0,
      refused: 0,
      unlinked: 0,
    })
  })

  /**
   * **Handing a case its own export is the normal way to move work**, and the
   * file names the source case's rows. The reference cannot mean anything in
   * the destination, but the rows can: dropping the link keeps the import,
   * where refusing the reference loses the file -- including every line that
   * carried no reference at all.
   *
   * Asserted on `impact`, whose `systemId` is a real foreign key.
   */
  it('lands a file exported from another case, without its references', async () => {
    const [theirs] = await seed!.select().from(systems).where(eq(systems.caseId, caseId))
    const csv =
      'label,category,system_id\n' +
      `Moved with a link,credentials,${theirs!.id}\n` +
      'Moved without one,credentials,\n'

    const result = await service.fromCsv('impact', emptyCaseId, csv, ME)

    expect(result.added).toBe(2)
    expect(result.unlinked).toBe(1)

    const landed = await seed!.select().from(impact).where(eq(impact.caseId, emptyCaseId))
    expect(landed).toHaveLength(2)
    expect(landed.every((row) => row.systemId === null)).toBe(true)
  })

  /**
   * **A multi-valued reference keeps the ids that resolve.** `evidenceIds` is
   * the only list-shaped reference, and it is `NOT NULL` with a `[]` default:
   * nulling the field for one foreign id would discard the ones that were fine
   * *and* die on a not-null violation, taking the whole import with it --
   * worse than the refusal this replaced.
   */
  it('keeps the resolvable half of a list reference and drops only the foreign ids', async () => {
    const [mine] = await seed!
      .insert(evidence)
      .values({ caseId: emptyCaseId, name: 'Local exhibit', createdBy: ME, updatedBy: ME })
      .returning()
    const [theirs] = await seed!.select().from(evidence).where(eq(evidence.caseId, caseId))

    // A list cell is `;`-separated, so a comma inside it is not a new column.
    const csv =
      'label,category,evidence_ids\n' +
      `Mixed,credentials,${theirs!.id};${mine!.id}\n`

    const result = await service.fromCsv('impact', emptyCaseId, csv, ME)

    expect(result.added).toBe(1)
    expect(result.unlinked).toBe(1)

    const [landed] = await seed!.select().from(impact).where(eq(impact.caseId, emptyCaseId))
    expect(landed!.evidenceIds).toEqual([mine!.id])
  })
})
