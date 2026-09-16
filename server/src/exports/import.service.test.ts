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
import { CSV_IMPORT, ImportService } from './import.service.js'
import { CollectionService } from '../collections/collection.service.js'
import { DemoContentSeeder } from '../demos/content.seeder.js'
import { DemoSeederService } from '../demos/seeder.service.js'
import { accounts, cases, changeFeed, evidence, impact, systems, timeline, user } from '../db/schema/index.js'
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
    await new DemoSeederService(seed!, seed, new DemoContentSeeder()).reseed()
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
   * The contract `csv-import.ts` opens by stating: the file this app hands out
   * is a file it must be able to take back.
   *
   * **Both kinds in one file**, because that is what an export of a real case
   * produces and a parser given the union of two shapes is the half most
   * likely to be wrong.
   */
  it('takes back the timeline file it just wrote, both kinds of row', async () => {
    const before = await seed!.select().from(timeline).where(eq(timeline.caseId, caseId))
    expect(
      new Set(before.map((row) => row.kind)).size,
      'the fixture holds one kind of entry, so this would not test the dispatch',
    ).toBeGreaterThan(1)

    const csv = await exports_.collectionCsv(caseId, 'timeline')
    const { added } = await service.fromCsv('timeline', emptyCaseId, csv, ME)

    expect(added).toBe(before.length)
    const after = await seed!.select().from(timeline).where(eq(timeline.caseId, emptyCaseId))
    expect(after.map((row) => row.kind).sort()).toEqual(before.map((row) => row.kind).sort())
  })

  it('re-imports into the case it came from without an id collision', async () => {
    // **The property is that the app's own export is importable**, which the
    // exported `id` column could break by colliding. A re-import recognises
    // every row and adds none, so the count staying put is the observation and
    // the skip count is what says the file was read rather than refused.
    const before = await seed!.select().from(systems).where(eq(systems.caseId, caseId))
    const csv = await exports_.collectionCsv(caseId, 'systems')

    const result = await service.fromCsv('systems', caseId, csv, ME)

    const after = await seed!.select().from(systems).where(eq(systems.caseId, caseId))
    expect(after).toHaveLength(before.length)
    expect(result).toEqual({ added: 0, skipped: before.length, replaced: 0, refused: 0, unlinked: 0, unlinkedBy: {} })
  })

  it('attributes the imported rows to the caller', async () => {
    await service.fromCsv('systems', emptyCaseId, 'hostname\nWKS-NEW\n', ME)
    const [row] = await seed!.select().from(systems).where(eq(systems.caseId, emptyCaseId))
    expect(row!.createdBy).toBe(ME)
  })

  /**
   * Covers the stamp, not the refusal beside it: the parse drops a `source`
   * column before this point, so nothing here shows a file's own claim denied.
   */
  it('says a row came through the file door, not that somebody typed it', async () => {
    await service.fromCsv('systems', emptyCaseId, 'hostname\nWKS-IMPORTED\n', ME)
    const [row] = await seed!.select().from(systems).where(eq(systems.caseId, emptyCaseId))

    expect(row!.source, 'an imported row claims a door it did not come through').not.toBe('manual')
    expect(row!.source).toBe(CSV_IMPORT)
  })

  /**
   * **The collection that had nowhere to record it.** `impact` took the stamp
   * and stored nothing, because the query builder drops a key naming no column
   * without a word -- so the row read as an analyst's own work. -> #732
   *
   * Asserted on the change feed as well as the row: the feed is where the
   * difference was visible while the column was missing.
   */
  it('names the door on a collection whose stamp used to land nowhere', async () => {
    await service.fromCsv('impact', emptyCaseId, 'label,category\nMailbox down,credentials\n', ME)
    const [row] = await seed!.select().from(impact).where(eq(impact.caseId, emptyCaseId))
    const [change] = await seed!
      .select()
      .from(changeFeed)
      .where(eq(changeFeed.caseId, emptyCaseId))

    expect(row!.source, 'an imported impact row claims somebody typed it').toBe(CSV_IMPORT)
    expect(change!.fields, 'the change feed does not record where the row came from').toContain(
      'source',
    )
  })

  it('believes no file about where its own rows came from', async () => {
    const csv = 'hostname,source\nWKS-CLAIMED,Microsoft Sentinel\n'
    await service.fromCsv('systems', emptyCaseId, csv, ME)
    const [row] = await seed!.select().from(systems).where(eq(systems.caseId, emptyCaseId))

    expect(row!.source, 'a file named its own origin and was believed').not.toBe(
      'Microsoft Sentinel',
    )
    expect(row!.source).toBe(CSV_IMPORT)
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

  it('ignores a trailing blank line', async () => {
    expect(await service.fromCsv('systems', emptyCaseId, 'hostname\nWKS-A\n\n', ME)).toEqual({
      added: 1,
      skipped: 0,
      replaced: 0,
      refused: 0,
      unlinked: 0,
      unlinkedBy: {},
    })
  })

  /**
   * **The property the whole of `identity.ts` exists for**, and the one a
   * round trip cannot see: importing a file the case already holds must not
   * double it. A re-import that adds every row again reports success.
   */
  it('adds nothing on a second import of the same file', async () => {
    const csv = 'hostname,system_type\nWKS-FIN01,laptop\nSRV-DC01,server\n'
    expect(await service.fromCsv('systems', emptyCaseId, csv, ME)).toEqual({
      added: 2,
      skipped: 0,
      replaced: 0,
      refused: 0,
      unlinked: 0,
      unlinkedBy: {},
    })
    expect(await service.fromCsv('systems', emptyCaseId, csv, ME)).toEqual({
      added: 0,
      skipped: 2,
      replaced: 0,
      refused: 0,
      unlinked: 0,
      unlinkedBy: {},
    })
  })

  it('matches on identity rather than on the whole row', async () => {
    // The same host with a different type is the same host. A key over every
    // column would call this new and add it, which is dedup that does nothing.
    await service.fromCsv('systems', emptyCaseId, 'hostname,system_type\nWKS-A,laptop\n', ME)
    expect(
      await service.fromCsv('systems', emptyCaseId, 'hostname,system_type\nWKS-A,server\n', ME),
    ).toEqual({ added: 0, skipped: 1, replaced: 0, refused: 0, unlinked: 0, unlinkedBy: {} })
  })

  it('does not merge two rows that differ in what identity is made of', async () => {
    const csv =
      'account_name,domain\nadmin,corp.local\nadmin,partner.example\n'
    expect(await service.fromCsv('accounts', emptyCaseId, csv, ME)).toEqual({
      added: 2,
      skipped: 0,
      replaced: 0,
      refused: 0,
      unlinked: 0,
      unlinkedBy: {},
    })
  })

  it('does not import one file twice against itself', async () => {
    expect(
      await service.fromCsv('systems', emptyCaseId, 'hostname\nWKS-DUP\nwks-dup\n', ME),
    ).toEqual({ added: 1, skipped: 1, replaced: 0, refused: 0, unlinked: 0, unlinkedBy: {} })
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
    ).toEqual({ added: 0, skipped: 0, replaced: 1, refused: 0, unlinked: 0, unlinkedBy: {} })
  })

  /**
   * **A replace against a row somebody else has open must not abandon the
   * import.** `update` throws when another analyst holds a row, and an uncaught
   * throw commits the fresh rows and leaves every later collision unattempted -
   * a partial import, which is the worst outcome.
   *
   * The service every other case here builds has no live channel, so the claim
   * check is inert in all of them; this one wires a holder to switch it on.
   */
  it('carries on when another analyst is holding one of the rows', async () => {
    const held = new CollectionService(db!, {
      announce: () => {},
      othersOn: () => Promise.resolve([]),
      holderOf: () => Promise.resolve({ userId: 'robin', username: 'Robin' }),
    } as never)
    const withClaims = new ImportService(held)

    await withClaims.fromCsv('systems', emptyCaseId, 'hostname\nWKS-HELD\n', ME)

    const result = await withClaims.fromCsv(
      'systems',
      emptyCaseId,
      'hostname,system_type\nWKS-HELD,server\n',
      ME,
      'replace',
    )
    expect(result).toEqual({ added: 0, skipped: 0, replaced: 0, refused: 1, unlinked: 0, unlinkedBy: {} })

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

  it('refuses a value the domain schema would refuse from a form', async () => {
    await expect(
      service.fromCsv('systems', emptyCaseId, 'hostname,system_type\nWKS-A,teapot\n', ME),
    ).rejects.toMatchObject({ response: { message: expect.stringContaining('row 2') } })
  })

  /** What is left to refuse is a name that is no collection at all. */
  it('refuses a collection it has never heard of, naming the ones it knows', async () => {
    await expect(
      service.fromCsv('teapots' as never, emptyCaseId, 'label\nnope\n', ME),
    ).rejects.toMatchObject({ response: { message: expect.stringContaining('systems') } })
  })

  /**
   * 6,000 rows is past Postgres' bound-parameter ceiling for a single
   * statement, so an insert that is not chunked fails on this file.
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
      unlinkedBy: {},
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
   * worse than a flat refusal.
   */
  it('keeps the resolvable half of a list reference and reports only the rest', async () => {
    const [mine] = await seed!
      .insert(evidence)
      .values({ caseId: emptyCaseId, name: 'Local exhibit', createdBy: ME, updatedBy: ME })
      .returning()

    const csv =
      'label,category,evidence_ids\n' + 'Mixed,credentials,Local exhibit;Never heard of it\n'

    const result = await service.fromCsv('impact', emptyCaseId, csv, ME)

    expect(result.added).toBe(1)
    expect(result.unlinked).toBe(1)
    expect(result.unlinkedBy).toEqual({ evidence: 1 })

    const [landed] = await seed!.select().from(impact).where(eq(impact.caseId, emptyCaseId))
    expect(landed!.evidenceIds).toEqual([mine!.id])
  })

  /**
   * **A file naming where a row was kept reaches nothing**, which is the half
   * of the reference design that is a security property rather than a
   * convenience: an id is unique across the install, so a file that could name
   * one would be a way to point at a case the importing analyst may not open.
   *
   * It needs no rule of its own. A uuid is not a hostname, so it answers to no
   * row in the destination and is reported like any other name the case does
   * not hold.
   */
  it('resolves nothing from a file that names where a row was kept', async () => {
    const [theirs] = await seed!.select().from(systems).where(eq(systems.caseId, caseId))

    const csv = 'label,category,system_id\n' + `Named by id,credentials,${theirs!.id}\n`
    const result = await service.fromCsv('impact', emptyCaseId, csv, ME)

    expect(result.added).toBe(1)
    expect(result.unlinked).toBe(1)
    expect(result.unlinkedBy).toEqual({ systems: 1 })

    const [landed] = await seed!.select().from(impact).where(eq(impact.caseId, emptyCaseId))
    expect(landed!.systemId, 'a file named a row by its id and was believed').toBeNull()
  })

  /**
   * **The case a reference exists for**: a file taken out of one case and
   * imported into another that holds the same host keeps the link, against
   * that case's own row.
   */
  it('resolves a reference against the destination case', async () => {
    const [theirs] = await seed!.select().from(systems).where(eq(systems.caseId, caseId))
    const [mine] = await seed!
      .insert(systems)
      .values({
        caseId: emptyCaseId,
        hostname: theirs!.hostname,
        createdBy: ME,
        updatedBy: ME,
      })
      .returning()

    const csv = 'label,category,system_id\n' + `Moved with a link,credentials,${theirs!.hostname}\n`
    const result = await service.fromCsv('impact', emptyCaseId, csv, ME)

    expect(result.added).toBe(1)
    expect(result.unlinked, 'a host the destination holds was reported as lost').toBe(0)

    const [landed] = await seed!.select().from(impact).where(eq(impact.caseId, emptyCaseId))
    expect(landed!.systemId, 'the reference did not reach the destination own host').toBe(mine!.id)
  })

  /**
   * **Export, then import into the case it came from.** The headline case for
   * references, and the one that cannot be faked: a hand-written file proves
   * the parser and a hand-written row proves the writer, while the two go on
   * disagreeing about what a reference column holds.
   *
   * `impact` carries `systemId`, a real foreign key, and the demo case has
   * both halves already linked.
   */
  it('points at the same row after a round trip through its own case', async () => {
    const before = await seed!.select().from(impact).where(eq(impact.caseId, caseId))
    const linked = before.find((row) => row.systemId !== null)
    expect(linked, 'the demo case holds no linked impact row to round-trip').toBeDefined()

    const csv = await exports_.collectionCsv(caseId, 'impact')

    // **The file says what the host is called, not where it was kept.**
    const [host] = await seed!
      .select()
      .from(systems)
      .where(eq(systems.id, linked!.systemId!))
    expect(csv, 'the export wrote a row id into a reference column').not.toContain(linked!.systemId!)
    expect(csv).toContain(host!.hostname)

    // Imported back with every row already there, so nothing is added and the
    // question is only what the references resolved to.
    const result = await service.fromCsv('impact', caseId, csv, ME, 'replace')

    expect(result.unlinked, 'a case could not resolve a reference to its own row').toBe(0)

    const after = await seed!.select().from(impact).where(eq(impact.caseId, caseId))
    const same = after.find((row) => row.id === linked!.id)
    expect(same!.systemId, 'a round trip through its own case moved the reference').toBe(
      linked!.systemId,
    )
  })

  /**
   * **A row that was skipped never landed, so nothing was lost carrying it.**
   *
   * Resolution runs over the whole parsed file, before the duplicate pass
   * decides what to write -- so a total counted there told an analyst a
   * reference could not be carried on a re-import that wrote nothing at all,
   * under a screen saying "the rows landed without them". -> #51
   */
  it('reports no lost reference for a row it skipped', async () => {
    const csv = 'hostname,method_id\nWKS-SKIPPED,Never heard of it\n'

    const first = await service.fromCsv('systems', emptyCaseId, csv, ME)
    expect(first.added, 'the first import did not write the row').toBe(1)
    expect(first.unlinked, 'the first import carried a reference it could not have').toBe(1)

    const again = await service.fromCsv('systems', emptyCaseId, csv, ME)

    expect(again.added).toBe(0)
    expect(again.skipped).toBe(1)
    expect(again.unlinked, 'an import that wrote nothing reported a reference lost').toBe(0)
    expect(again.unlinkedBy).toEqual({})
  })

  /**
   * **The timeline, which carries more references than anything else.**
   *
   * It publishes no single write schema, so a lookup through
   * `COLLECTION_SCHEMAS` saw none of its eight reference fields and wrote
   * every one as a row id -- silently, and in the one export the security
   * half of this design is about. -> #51
   */
  it('writes no row id into the timeline export, which has the most references', async () => {
    const csv = await exports_.collectionCsv(caseId, 'timeline')
    const head = csv.split('\n')[0] ?? ''

    expect(head, 'the timeline export carries no reference column to check').toContain('system_id')

    const rows = await seed!.select().from(systems).where(eq(systems.caseId, caseId))
    expect(rows.length, 'the demo case holds no host to be named by').toBeGreaterThan(0)
    for (const host of rows) {
      expect(csv, `the timeline export named a host by its id: ${host.id}`).not.toContain(host.id)
    }
  })

  /**
   * **A case holding two accounts of one name keeps both links.**
   *
   * The round trip is through the case's *own* file, which is the ordinary way
   * to move work -- so a name less discriminating than the row's identity
   * loses a link that the id it replaced did not. `admin@corp.local` and
   * `admin@partner.local` are this project's own example of why an account is
   * the pair. -> #51
   */
  it('keeps the link where two accounts share a name and differ in domain', async () => {
    const [mine] = await seed!
      .insert(accounts)
      .values({
        caseId: emptyCaseId,
        accountName: 'admin',
        domain: 'corp.local',
        createdBy: ME,
        updatedBy: ME,
      })
      .returning()
    await seed!.insert(accounts).values({
      caseId: emptyCaseId,
      accountName: 'admin',
      domain: 'partner.local',
      createdBy: ME,
      updatedBy: ME,
    })

    const csv = 'label,category,account_id\nTwo of one name,credentials,admin@corp.local\n'
    const result = await service.fromCsv('impact', emptyCaseId, csv, ME)

    expect(result.unlinked, 'a qualified name was reported as uncarryable').toBe(0)

    const [landed] = await seed!.select().from(impact).where(eq(impact.caseId, emptyCaseId))
    expect(landed!.accountId, 'the reference did not reach the account the file named').toBe(
      mine!.id,
    )
  })

  /**
   * **A name is not an identity.** Two rows answering to one name make the
   * reference unanswerable: picking either would attach the row to whichever
   * the scan reached first, which is a guess dressed as a link.
   */
  it('resolves nothing where two rows answer to the name', async () => {
    for (const _ of [0, 1]) {
      await seed!
        .insert(systems)
        .values({ caseId: emptyCaseId, hostname: 'WKS-TWICE', createdBy: ME, updatedBy: ME })
    }

    const csv = 'label,category,system_id\nAmbiguous,credentials,WKS-TWICE\n'
    const result = await service.fromCsv('impact', emptyCaseId, csv, ME)

    expect(result.added).toBe(1)
    expect(result.unlinkedBy).toEqual({ systems: 1 })

    const [landed] = await seed!.select().from(impact).where(eq(impact.caseId, emptyCaseId))
    expect(landed!.systemId, 'a reference was attached to one of two equal candidates').toBeNull()
  })
})
