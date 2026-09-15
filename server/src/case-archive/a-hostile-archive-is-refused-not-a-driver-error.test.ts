/**
 * **An archive's rows are checked before they are written, like every other
 * row this application takes from outside.**
 *
 * `archive/format.ts` opens with *"Everything here treats the archive as
 * hostile"*, and `unpack` earns it for the envelope: member names cannot
 * traverse, digests are checked, an unlisted member is refused. The case
 * record inside got none of it -- every collection's rows were copied field by
 * field into a typed table on trust, so a hand-built `.iccase` reached the
 * database with whatever it liked and failed as a driver error naming column
 * names. -> #625
 *
 * **A refusal, not a rescue.** An archive this build cannot read is refused
 * whole. Repairing one row would leave the operator a case that is quietly
 * not the case they exported.
 *
 * **What this does not cover:** the envelope, which `round-trip.test.ts` and
 * `archive/` already hold, and whether any other path writes rows from a file.
 */
import { defaultPolicy } from '../policy/read.js'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CasesService } from '../cases/cases.service.js'
import { EvidenceStore } from '../evidence/store.js'
import { ArchiveExportService } from './export.service.js'
import { ARCHIVE_IMPORT, ArchiveImportService } from './import.service.js'
import { CASE_NAME, MANIFEST_NAME, pack, readArchive } from '../archive/format.js'
import { cases, cloudApps, systems, timeline, user } from '../db/schema/index.js'
import { openTestPool } from '../../test/database.js'

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null

const LIMITS = { memberBytes: 256 * 1024 * 1024, totalBytes: 512 * 1024 * 1024 }
const policy = { read: () => Promise.resolve(defaultPolicy()) } as never

describe.skipIf(!db)('an archive carrying a row this build cannot write', () => {
  let exporter: ArchiveExportService
  let importer: ArchiveImportService
  let store: EvidenceStore
  let root: string
  let actorId: string
  let minted = 0

  beforeAll(async () => {
    actorId = 'hostile-archive-analyst'
    const now = new Date()
    await seed!
      .insert(user)
      .values({
        id: actorId,
        name: 'Hostile Archive Analyst',
        email: 'hostile-archive@example.test',
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()

    root = await mkdtemp(join(tmpdir(), 'ic-hostile-'))
    store = new EvidenceStore({ get: () => root } as never, policy)
    const cases_ = new CasesService(
      db!,
      { announce: () => {}, othersOn: () => Promise.resolve([]) } as never,
    )
    exporter = new ArchiveExportService(cases_, store, policy)
    importer = new ArchiveImportService(db!, store, policy)
  })

  afterAll(async () => {
    await seed!.delete(cases)
    await rm(root, { recursive: true, force: true })
  })

  /**
   * A case with one system and one timeline action, exported.
   *
   * **Furnished, because an empty case proves nothing.** The control below
   * imports what this builds; with no collection rows in it, a check that
   * refused every row would still pass. -> the review of #625
   */
  async function exported() {
    minted += 1
    const made = await db!
      .insert(cases)
      .values({
        title: 'Hostile archive',
        reference: `INC-HOSTILE-${String(minted)}`,
        createdBy: actorId,
        updatedBy: actorId,
      })
      .returning()
    const row = made[0]!
    await seed!.insert(systems).values({
      caseId: row.id,
      hostname: `HOST-${String(minted)}`,
      // **Provenance, which the write schema does not carry.** A round trip
      // that never states it cannot see `CARRIED` dropping it.
      source: 'sentinel',
      createdBy: actorId,
      updatedBy: actorId,
    })
    await seed!.insert(timeline).values({
      caseId: row.id,
      // **An action, not an event.** The kind dispatch chooses the schema, and
      // no archive in this repository carried an action row -- so returning the
      // event schema for both left the whole dispatch untested.
      kind: 'action',
      actionType: 'containment action',
      description: 'Host isolated',
      time: new Date(),
      createdBy: actorId,
      updatedBy: actorId,
    })
    const built = await exporter.build({ caseId: row.id, includeFiles: false })
    // The original's reference is freed, so a refusal below is about the row
    // rather than about the install already holding the reference. -> #220
    await seed!.update(cases).set({ reference: '' }).where(eq(cases.id, row.id))
    return built.bytes
  }

  /**
   * The same archive with one collection's rows replaced, repacked through the
   * real `pack` so every digest in the manifest is correct.
   *
   * A tampered archive that fails its own digest check is refused by `unpack`
   * and proves nothing about the rows.
   */
  async function tamperedWith(
    bytes: Buffer,
    collection: string,
    rows: readonly Record<string, unknown>[],
  ): Promise<Buffer> {
    const { members } = await readArchive(bytes, LIMITS)
    const record: Record<string, unknown> = JSON.parse(
      new TextDecoder().decode(members[CASE_NAME]),
    )
    record[collection] = rows
    // **Without the manifest.** `pack` writes its own and digests every member
    // it is handed, so carrying the old one in makes an archive whose manifest
    // names a stale digest for itself.
    const { [MANIFEST_NAME]: _old, ...rest } = members
    return pack(
      {
        ...rest,
        [CASE_NAME]: new TextEncoder().encode(JSON.stringify(record)),
      },
      'omitted',
    )
  }

  it('is refused rather than reaching the database', async () => {
    // `evidence.size_bytes` is `int4`. Five thousand million overflows it, and
    // the value was copied onto the insert because its *key* named a column.
    const hostile = await tamperedWith(await exported(), 'evidence', [
      {
        id: 'ev-overflow',
        type: 'file',
        name: 'big',
        location: 'nowhere',
        sizeBytes: 5_000_000_000,
      },
    ])

    await expect(
      importer.load(hostile, '', actorId),
      'a value no column can hold reached the database, so the operator meets a driver ' +
        'error naming column names instead of a refusal',
    ).rejects.toThrow('this archive states a value in evidence that this install cannot write')
  })

  it('names the collection and the field rather than the column that overflowed', async () => {
    const hostile = await tamperedWith(await exported(), 'evidence', [
      { id: 'ev-2', type: 'file', name: 'big', location: 'nowhere', sizeBytes: 5_000_000_000 },
    ])

    await expect(importer.load(hostile, '', actorId)).rejects.toThrow(/ in evidence /)
  })

  /**
   * **A value of the wrong type is the same defect with a different landing.**
   * It reaches a typed column as a driver error, or worse, is coerced and
   * stored as a row nobody wrote.
   */
  it('refuses a value of the wrong type for its column', async () => {
    const hostile = await tamperedWith(await exported(), 'systems', [
      { id: 'sys-1', hostname: { not: 'a string' } },
    ])

    await expect(importer.load(hostile, '', actorId)).rejects.toThrow(
      'this archive states a hostname in systems that this install cannot read',
    )
  })

  /**
   * **A vocabulary value no schema defines was the worst of these**, because
   * nothing refused it: it was stored, and then drawn on every screen and in
   * every report that reads the field.
   */
  it('refuses a vocabulary value no schema defines', async () => {
    const hostile = await tamperedWith(await exported(), 'systems', [
      { id: 'sys-v', hostname: 'host-v', systemType: 'made-up' },
    ])

    await expect(importer.load(hostile, '', actorId)).rejects.toThrow(
      'this archive states a systemType in systems that this install cannot read',
    )
  })

  /**
   * **The same door, on the collection whose schema is chosen by the row.** A
   * timeline row is judged by the arm its `kind` names, so a refusal proved on
   * `systems` says nothing about the two schemas reached through that dispatch.
   * -> #675
   */
  it('refuses a vocabulary value no schema defines on a timeline action', async () => {
    const hostile = await tamperedWith(await exported(), 'timeline', [
      {
        id: 'tl-v',
        kind: 'action',
        description: 'Host isolated',
        time: new Date().toISOString(),
        actionType: 'contain',
      },
    ])

    await expect(importer.load(hostile, '', actorId)).rejects.toThrow(
      'this archive states a actionType in timeline that this install cannot read',
    )
  })

  /**
   * **An array in a text column was stored as `{"a","b"}`** -- Postgres array
   * literal syntax, written into a hostname by a JavaScript array reaching a
   * column that takes a string.
   */
  it('refuses a list where the column takes one value', async () => {
    const hostile = await tamperedWith(await exported(), 'systems', [
      { id: 'sys-l', hostname: ['a', 'b'] },
    ])

    await expect(importer.load(hostile, '', actorId)).rejects.toThrow(
      'this archive states a hostname in systems that this install cannot read',
    )
  })

  /**
   * **Refused whole, never in part.** A repaired row would leave the operator
   * a case that is quietly not the case they exported, and the refusal above
   * says nothing about whether the rows before it were already written.
   */
  it('writes no part of an archive it refuses', async () => {
    const built = await exported()
    // Counted after the fixture's own case exists, so the only case this can
    // add is the one the refused import would have written.
    const before = await seed!.select().from(cases)
    const hostile = await tamperedWith(built, 'systems', [
      { id: 'sys-p', hostname: 'good' },
      { id: 'sys-q', hostname: { not: 'a string' } },
    ])

    await expect(importer.load(hostile, '', actorId)).rejects.toThrow(/this install cannot/)

    const after = await seed!.select().from(cases)
    expect(
      after.length,
      'a case was left behind by an import that refused, so a retry meets a half-written case',
    ).toBe(before.length)
  })

  /**
   * **A field this build has no place for is dropped, never refused.** An
   * archive written by another build of this application carries what that
   * build had, and refusing it would make every upgrade a wall rather than a
   * thing the two have in common.
   */
  it('drops a field this build has no place for, and reads the rest', async () => {
    const hostile = await tamperedWith(await exported(), 'systems', [
      { id: 'sys-f', hostname: 'host-f', somethingALaterBuildAdded: 'whatever it likes' },
    ])

    const result = await importer.load(hostile, '', actorId)
    const [row] = await seed!.select().from(systems).where(eq(systems.caseId, result.id))

    expect(row?.hostname, 'the row was refused for a field this build simply does not have').toBe(
      'host-f',
    )
  })

  /**
   * **The ordinary archive still goes in**, so the refusals above are about
   * the rows rather than about the checking having closed the door.
   */
  it('still reads an archive whose rows this build can write', async () => {
    const built = await exported()
    const result = await importer.load(built, '', actorId)

    expect(result.id).toBeDefined()
    expect(result.rows, 'the control imported an archive of no rows').toBeGreaterThan(1)
  })

  /**
   * **A timeline row's shape comes from its own kind.** An action and an event
   * take different fields, and no archive in this repository carried an action
   * -- so returning the event schema for both refused every legitimate action
   * row and no test could see it.
   */
  it('reads a timeline action, not only an event', async () => {
    const built = await exported()
    const result = await importer.load(built, '', actorId)

    const [row] = await seed!.select().from(timeline).where(eq(timeline.caseId, result.id))
    expect(row?.kind).toBe('action')
    expect(row?.actionType, 'the action arm was not the schema the row was judged by').toBe(
      'containment action',
    )
  })

  /**
   * **An imported row never claims to be the analyst's own work.** The column
   * defaults to `manual`, so a door that neither carries nor stamps writes
   * that claim over every row it brings in.
   *
   * **Stamped rather than carried, which is the narrower of the two answers.**
   * The archive states the door on the install that wrote it, and carrying
   * that states `manual` for the rows an analyst *there* typed -- the same
   * false claim, for the rows most likely to be read. What is lost with it is
   * which rows that install's platform found, which is a fact about the
   * investigation that no column holds. -> #727
   */
  it('names the door the row came through here, not the one it came through there', async () => {
    const built = await exported()
    const result = await importer.load(built, '', actorId)

    const [row] = await seed!.select().from(systems).where(eq(systems.caseId, result.id))
    expect(row?.source).toBe(ARCHIVE_IMPORT)
    expect(row?.source, 'the column default claims somebody here typed it').not.toBe('manual')
  })

  /**
   * **An archive that names a row it does not carry says so.** A sound archive
   * names none: the export writes the whole case, and a reference points inside
   * it. So a count above zero is the one thing about a damaged archive an
   * operator cannot see by opening the case -- the rows are all there and the
   * links between some of them are not.
   *
   * **Counted per id, not per field**, which is why the row below loses two.
   */
  it('counts the references an archive names and does not carry', async () => {
    const built = await exported()
    const hostile = await tamperedWith(built, 'timeline', [
      {
        id: '11111111-1111-4111-8111-111111111111',
        kind: 'action',
        actionType: 'containment action',
        description: 'Host isolated',
        time: new Date().toISOString(),
        systemId: '22222222-2222-4222-8222-222222222222',
        evidenceIds: ['33333333-3333-4333-8333-333333333333'],
      },
    ])
    const result = await importer.load(hostile, '', actorId)

    expect(result.missingReferences, 'a scalar and a list member').toBe(2)
  })

  /**
   * **A column the archive does not state keeps the column's own default.**
   * `.partial()` leaves a schema `.default()` firing, so parsing a row that
   * omits a column returns the schema's answer for it -- written as an
   * explicit value over the column's. `verifiedPublisher` is the live case:
   * `unverified` is a stated negative finding and `unknown` is nothing known.
   */
  it('does not answer for a column the archive left out', async () => {
    const built = await exported()
    const hostile = await tamperedWith(built, 'cloudApps', [{ id: 'app-1', appName: 'Dropbox' }])
    const result = await importer.load(hostile, '', actorId)

    const [row] = await seed!.select().from(cloudApps).where(eq(cloudApps.caseId, result.id))
    expect(
      row?.verifiedPublisher,
      'the parse answered for a column the archive never stated, overriding the column',
    ).toBe('unverified')
  })
})
