/**
 * A case out and back, against a real database.
 *
 * **The round trip is the only thing that shows the two halves agree**, and the
 * cases below are the ways they could disagree while both look right: a
 * reference remapped to the wrong row, a version carried over, attribution
 * naming somebody on another install, prose filed under a report id that no
 * longer exists, and an archive exported without its files importing as though
 * it were damaged.
 */
import { defaultPolicy } from '../policy/read.js'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as Y from 'yjs'

import { CasesService } from '../cases/cases.service.js'
import { EvidenceStore } from '../evidence/store.js'
import { ArchiveExportService } from './export.service.js'
import { ARCHIVE_IMPORT, ArchiveImportService } from './import.service.js'
import { isSealed } from '../archive/envelope.js'
import { readArchive } from '../archive/format.js'
import {
  cases,
  customers,
  evidence,
  reportBlocks,
  reports,
  systems,
  timeline,
  user,
} from '../db/schema/index.js'
import { hasConcurrentConnections, openTestPool } from '../../test/database.js'

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null

const PASS = 'a-long-enough-passphrase'

/** A report document holding `text` under each block id, one paragraph apiece. */
function written(text: Record<string, string>): Buffer {
  const doc = new Y.Doc()
  for (const [blockId, words] of Object.entries(text)) {
    const paragraph = new Y.XmlElement('paragraph')
    paragraph.insert(0, [new Y.XmlText(words)])
    doc.getXmlFragment(blockId).insert(0, [paragraph])
  }
  return Buffer.from(Y.encodeStateAsUpdate(doc))
}

/** Each fragment of a stored report document, as its name and its text. */
function sections(document: Uint8Array): Record<string, string> {
  const doc = new Y.Doc()
  Y.applyUpdate(doc, document)
  return Object.fromEntries(
    [...doc.share.keys()].map((name) => [name, doc.getXmlFragment(name).toJSON()]),
  )
}

describe.skipIf(!db || !hasConcurrentConnections())('a case, out and back', () => {
  let exporter: ArchiveExportService
  let importer: ArchiveImportService
  let cases_: CasesService
  let store: EvidenceStore
  let actorId: string
  let other: string
  let root: string
  let minted = 0

  /**
   * Frees the original's reference so the copy may carry it.
   *
   * **A reference is unique within its customer, and a re-import onto the same
   * install is a second case for one ticket.** So the import is refused,
   * naming the case that holds it, exactly as a create is -- which is what an
   * operator re-importing a case they still have has to act on. The archive
   * is built first, so the file under test still carries the reference and the
   * import is still exercised taking one.
   *
   * Freed rather than deleted, because the case next door is what several of
   * these assert survived. -> `cases/a-reference-is-unique-within-its-customer.test.ts`
   */
  async function freeTheReference(caseId: string): Promise<void> {
    await seed!.update(cases).set({ reference: '' }).where(eq(cases.id, caseId))
  }

  /** A case with a system, a timeline entry pointing at it, and an attachment. */
  async function furnished() {
    // **A reference per case, because this file makes one per test and never
    // clears the table.** A reference is unique within its customer, so a
    // fixture reusing one collides with the previous test's case rather than
    // with anything the test is about.
    const row = await cases_.create(
      { title: 'Archived incident', reference: `INC-9-${String(minted++)}`, customer: 'Acme' },
      actorId,
    )
    const [box] = await seed!
      .insert(systems)
      .values({ caseId: row.id, hostname: 'WKS-01', createdBy: actorId })
      .returning()
    const artefact = Buffer.from('the artefact bytes')
    const stored = await store.put(
      row.id,
      (async function* () {
        yield artefact
      })(),
    )
    const [artefactRow] = await seed!
      .insert(evidence)
      .values({
        caseId: row.id,
        name: 'Mailbox export',
        hash: stored.hash,
        hashAlgorithm: 'sha256',
        sizeBytes: artefact.length,
        storedAt: new Date(),
        createdBy: actorId,
      })
      .returning()
    await seed!.insert(timeline).values({
      caseId: row.id,
      kind: 'event',
      time: new Date('2026-03-03T10:00:00Z'),
      description: 'the event',
      systemId: box!.id,
      // **A list reference, remapped by a different branch from the scalar
      // beside it.** A fixture carrying only `systemId` exercises the branch
      // that is hard to get wrong and sees nothing of the list.
      evidenceIds: [artefactRow!.id],
      createdBy: actorId,
    })
    const [report] = await seed!
      .insert(reports)
      .values({
        caseId: row.id,
        label: 'The report',
        createdBy: actorId,
      })
      .returning()
    const blocks = await seed!
      .insert(reportBlocks)
      .values(
        [0, 1].map((position) => ({
          caseId: row.id,
          reportId: report!.id,
          position,
          createdBy: actorId,
        })),
      )
      .returning()
    await seed!
      .update(reports)
      .set({
        document: written({
          [blocks[0]!.id]: 'What happened first.',
          [blocks[1]!.id]: 'What was done about it.',
        }),
      })
      .where(eq(reports.id, report!.id))
    return {
      caseId: row.id,
      systemId: box!.id,
      evidenceId: artefactRow!.id,
      reportId: report!.id,
      hash: stored.hash,
    }
  }

  beforeAll(async () => {
    actorId = 'archive-analyst'
    other = 'archive-other-analyst'
    const now = new Date()
    for (const [id, name, email] of [
      [actorId, 'Archive Analyst', 'archive@example.test'],
      [other, 'Someone Else', 'archive-other@example.test'],
    ] as const) {
      await seed!
        .insert(user)
        .values({ id, name, email, emailVerified: true, createdAt: now, updatedAt: now })
        .onConflictDoNothing()
    }

    root = await mkdtemp(join(tmpdir(), 'ic-archive-'))
    store = new EvidenceStore({ get: () => root } as never, policy)
    cases_ = new CasesService(
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
   * That the ceiling an archive is read against is the install's, not a constant.
   *
   * **Every read site of `evidence.archiveMegabytes` reverted to a constant in
   * one run with the whole suite still green** -- the setting was registered,
   * bounded, offered and audited, and asserted by nothing anywhere. -> #588
   *
   * **At the service rather than the route.** The route's own cap fires while
   * the body is still being read, so it aborts the connection instead of
   * answering and there is no status to assert on.
   */
  it('reads an archive against the ceiling the install states', async () => {
    const made = await furnished()
    const built = await exporter.build({ caseId: made.caseId, includeFiles: true })

    /** The same importer, on an install that allows almost nothing. */
    // **Below the floor a route would accept, deliberately.** What this asks
    // is whether the stored value is read and used, and the archive a case
    // fixture builds is smaller than the smallest an operator may set.
    const mean = new ArchiveImportService(db!, store, {
      read: () =>
        Promise.resolve({
          ...POLICY_DEFAULTS,
          'evidence.archiveMegabytes': 0,
          'evidence.attachmentMegabytes': 0,
        }),
    } as never)

    await expect(
      mean.load(built.bytes, '', other),
      'an archive over the install ceiling was read',
    ).rejects.toThrow()

    // And the same bytes go in where the install allows them, so the refusal
    // above is the ceiling rather than the archive being unreadable.
    //
    // **The original's reference is freed first.** A reference is unique within
    // its customer, so an archive of a case the install still holds is refused
    // on that ground -- which would answer this control with a rejection that
    // says nothing about the ceiling. -> #220
    await db!.update(cases).set({ reference: '' }).where(eq(cases.id, made.caseId))
    const result = await importer.load(built.bytes, '', other)
    expect(result.id).toBeDefined()
  })

  it('brings the case back as a new case, not over the old one', async () => {
    // The decision the whole service turns on. Writing an archive back over a
    // live case discards whatever the analysts here did since, and the version
    // check has nothing to check against.
    const made = await furnished()
    const built = await exporter.build({ caseId: made.caseId, includeFiles: true })
    await freeTheReference(made.caseId)
    const result = await importer.load(built.bytes, '', other)

    expect(result.id).not.toBe(made.caseId)
    const [original] = await seed!.select().from(cases).where(eq(cases.id, made.caseId))
    expect(original).toBeDefined()
    expect(result.title).toBe('Archived incident')
  })

  it('remaps a reference onto the row it now points at', async () => {
    // A timeline entry naming a system by id. Carried over, the id either
    // collides with a live row or dangles; remapped to the wrong one, the
    // entry silently describes a different machine.
    const made = await furnished()
    const built = await exporter.build({ caseId: made.caseId, includeFiles: true })
    await freeTheReference(made.caseId)
    const result = await importer.load(built.bytes, '', other)

    const [entry] = await seed!
      .select()
      .from(timeline)
      .where(eq(timeline.caseId, result.id))
    const [box] = await seed!.select().from(systems).where(eq(systems.caseId, result.id))
    expect(entry!.systemId).toBe(box!.id)
    expect(entry!.systemId).not.toBe(made.systemId)
    expect(box!.hostname).toBe('WKS-01')
  })


  /**
   * **How connected the case is, which the receiving analyst cannot see.** The
   * rows are all there and some of the links between them are not, and nothing
   * on the screen says so. -> `openspec/specs/case-archive/design.md`, #731
   *
   * The scalar beside the list is a foreign key with `on delete set null`, so
   * only the list can dangle.
   */
  it('says how many rows the case names that it does not contain', async () => {
    const made = await furnished()
    await seed!.delete(evidence).where(eq(evidence.id, made.evidenceId))

    const built = await exporter.build({ caseId: made.caseId, includeFiles: false })
    await freeTheReference(made.caseId)
    const result = await importer.load(built.bytes, '', other)

    expect(
      result.unresolvedReferences,
      'the import said nothing about a link the case lost',
    ).toBe(1)

    const [entry] = await seed!.select().from(timeline).where(eq(timeline.caseId, result.id))
    expect(entry!.evidenceIds, 'the dangling id was kept rather than dropped').toHaveLength(0)
  })


  /**
   * **One row named twice is one row missing, not two.** The count answers how
   * much of the case is absent; counting the occurrences would answer how many
   * links broke, and the sentence the operator reads says rows.
   */
  it('counts a row the case names twice once', async () => {
    const made = await furnished()
    await seed!.insert(timeline).values({
      caseId: made.caseId,
      kind: 'event',
      time: new Date('2026-03-03T11:00:00Z'),
      description: 'the same artefact again',
      evidenceIds: [made.evidenceId],
      createdBy: actorId,
    })
    await seed!.delete(evidence).where(eq(evidence.id, made.evidenceId))

    const built = await exporter.build({ caseId: made.caseId, includeFiles: false })
    await freeTheReference(made.caseId)
    const result = await importer.load(built.bytes, '', other)

    expect(result.unresolvedReferences, 'the occurrences were counted, not the rows').toBe(1)
  })

  /** The control: a case whose links all resolve reports none. */
  it('says none for a case that names nothing it does not contain', async () => {
    const made = await furnished()
    const built = await exporter.build({ caseId: made.caseId, includeFiles: false })
    await freeTheReference(made.caseId)

    const result = await importer.load(built.bytes, '', other)

    expect(result.unresolvedReferences).toBe(0)
  })

  /**
   * **A list of references is remapped like a single one.**
   *
   * This drives one field of seventeen. The guard against the rest is that
   * the set is derived rather than listed, which `import-order.test.ts` and
   * `registry.test.ts` hold -- this test cannot see the other sixteen.
   */
  it('remaps every id in a list, not only the ones a map happened to name', async () => {
    const made = await furnished()
    const built = await exporter.build({ caseId: made.caseId, includeFiles: true })
    await freeTheReference(made.caseId)
    const result = await importer.load(built.bytes, '', other)

    const [entry] = await seed!.select().from(timeline).where(eq(timeline.caseId, result.id))
    const [artefact] = await seed!.select().from(evidence).where(eq(evidence.caseId, result.id))

    expect(entry!.evidenceIds, 'the list survived the round trip').toHaveLength(1)
    expect(entry!.evidenceIds[0], 'and points inside the imported case').toBe(artefact!.id)
    expect(entry!.evidenceIds[0], 'rather than back into the exported one').not.toBe(
      made.evidenceId,
    )
  })

  it('restarts versions rather than importing another install\u2019s history', async () => {
    // **The row is written twice first, or this test cannot fail.** A freshly
    // created row is already at version 1, so an import carrying the archive's
    // version through looks identical -- break-verified: without the second
    // write, the mutation that carries every column leaves this green.
    const made = await furnished()
    await seed!
      .update(systems)
      .set({ hostname: 'WKS-01-renamed', version: 7 })
      .where(eq(systems.id, made.systemId))

    const built = await exporter.build({ caseId: made.caseId, includeFiles: true })
    await freeTheReference(made.caseId)
    const result = await importer.load(built.bytes, '', other)

    const [box] = await seed!.select().from(systems).where(eq(systems.caseId, result.id))
    expect(box!.version).toBe(1)
  })

  it('attributes the rows to whoever imported them', async () => {
    // The archive's names are people on another install: a change feed naming
    // one is unresolvable here and draws a blank avatar.
    const made = await furnished()
    const built = await exporter.build({ caseId: made.caseId, includeFiles: true })
    await freeTheReference(made.caseId)
    const result = await importer.load(built.bytes, '', other)

    const [box] = await seed!.select().from(systems).where(eq(systems.caseId, result.id))
    expect(box!.createdBy).toBe(other)
  })

  /**
   * That a row says which door it came through *here*, not which door it came
   * through on the install that wrote the archive.
   *
   * **`unreviewed` is the half with a cost.** Carried over as `false`, a case
   * imported from elsewhere arrives with every entry claiming somebody on this
   * install has read it, which is the one thing that flag is for.
   */
  it('stamps where a row came through, over whatever the archive claims', async () => {
    const made = await furnished()
    await seed!
      .update(systems)
      .set({ source: 'Microsoft Sentinel' })
      .where(eq(systems.id, made.systemId))
    await seed!
      .update(timeline)
      .set({ provenance: 'typed', unreviewed: false })
      .where(eq(timeline.caseId, made.caseId))

    const built = await exporter.build({ caseId: made.caseId, includeFiles: true })
    await freeTheReference(made.caseId)
    const result = await importer.load(built.bytes, '', other)

    const [box] = await seed!.select().from(systems).where(eq(systems.caseId, result.id))
    const [entry] = await seed!.select().from(timeline).where(eq(timeline.caseId, result.id))

    expect(box!.source, 'the archive door names itself').toBe(ARCHIVE_IMPORT)
    expect(entry!.provenance).toBe('imported')
    expect(entry!.unreviewed, 'nobody on this install has read it yet').toBe(true)
  })

  it('carries the artefact bytes, and they still resolve', async () => {
    const made = await furnished()
    const built = await exporter.build({ caseId: made.caseId, includeFiles: true })
    await freeTheReference(made.caseId)
    const result = await importer.load(built.bytes, '', other)

    const [row] = await seed!.select().from(evidence).where(eq(evidence.caseId, result.id))
    expect(row!.hash).toBe(made.hash)
    expect(row!.storedAt).not.toBeNull()
    expect(Buffer.from((await store.read(result.id, row!.hash))!).toString()).toBe('the artefact bytes')
    expect(result.missingFiles).toBe(0)
  })

  /** A fragment left under an old block id is text no block reads. -> #1142 */
  it('carries each section of prose onto the block it now belongs to', async () => {
    const made = await furnished()
    const built = await exporter.build({ caseId: made.caseId, includeFiles: true })
    await freeTheReference(made.caseId)
    const result = await importer.load(built.bytes, '', other)

    const [report] = await seed!.select().from(reports).where(eq(reports.caseId, result.id))
    const blocks = await seed!
      .select()
      .from(reportBlocks)
      .where(eq(reportBlocks.reportId, report!.id))
      .orderBy(reportBlocks.position)
    expect(report!.document).not.toBeNull()
    const text = sections(report!.document!)
    expect(
      Object.keys(text).filter((name) => blocks.some((block) => block.id === name)),
      'sections of prose naming a block of the imported report',
    ).toHaveLength(2)
    expect(text[blocks[0]!.id]).toContain('What happened first.')
    expect(text[blocks[1]!.id]).toContain('What was done about it.')
  })

  it('keeps the prose document out of the JSON a human reads', async () => {
    // **Read out of the archive, not searched for in its bytes.** The zip is
    // deflated, so a raw search of `built.bytes` never finds the plaintext
    // whether it is in there or not -- break-verified: the mutation that inlines
    // the document leaves a byte-search version of this green.
    const made = await furnished()
    const built = await exporter.build({ caseId: made.caseId, includeFiles: true })
    const { members } = await readArchive(built.bytes, ARCHIVE_LIMITS)
    const record = JSON.parse(Buffer.from(members['case.json']!).toString('utf8')) as {
      reports: Record<string, unknown>[]
    }
    // **The key, not the text.** `JSON.stringify` renders a Buffer as
    // `{"type":"Buffer","data":[...]}`, so searching the JSON for the document's
    // words or its base64 finds neither whether it is inlined or not --
    // break-verified: the mutation that inlines it leaves a text-search version
    // green. What is asserted is that no report carries a `document` at all.
    expect(record.reports).toHaveLength(1)
    expect(record.reports[0]).not.toHaveProperty('document')
    expect(Object.keys(members)).toContain(`prose/${made.reportId}.ydoc`)
  })


  /**
   * **An export whose evidence could not all be found says so in the file.**
   *
   * *GIVEN a case whose stored evidence cannot all be found, WHEN it is
   * archived, THEN the archive says how much was not found.* The names left in
   * a response header, which lasts for one download -- an analyst who saved the
   * file, or was handed it, opened one that looked complete. -> #243
   *
   * **Driven by taking the bytes out from under a recorded row**, which is the
   * state the export is written for: the row says this install holds the file
   * and it does not.
   */
  it('states in the archive what it recorded and could not find', async () => {
    const made = await furnished()
    // **A row that says this install holds a file, and it does not** -- the
    // state the export is written for. An export names it rather than
    // refusing, which leaves the analyst with the case.
    await seed!.insert(evidence).values({
      caseId: made.caseId,
      name: 'Memory capture',
      hash: 'f'.repeat(64),
      hashAlgorithm: 'sha256',
      sizeBytes: 1024,
      storedAt: new Date(),
      createdBy: other,
      updatedBy: other,
    })

    const built = await exporter.build({ caseId: made.caseId, includeFiles: true })

    expect(built.omitted.length, 'nothing was reported missing, so this asserts nothing').
      toBeGreaterThan(0)

    const { missing } = await readArchive(built.bytes, ARCHIVE_LIMITS)
    expect(
      missing,
      'the archive carries no statement of what it could not find, so a reader cannot tell it '
        + 'from a complete one',
    ).toEqual([...built.omitted].sort((a, b) => a.localeCompare(b)))
  })

  /**
   * **Reading an archive of a case this install still holds is refused, and
   * the refusal names the case.** A reference is unique within its customer
   * and an import is a second case for one ticket, so the rule applies here
   * with no exemption -- the archive import writes the row itself rather than
   * going through `CasesService.create`, which is why the refusal is stated in
   * both places and asserted in both.
   *
   * The operator's way out is to free the reference on one of the two, and
   * they cannot do that without being told which holds it.
   */
  it('refuses an archive whose reference this install already holds', async () => {
    const made = await furnished()
    const built = await exporter.build({ caseId: made.caseId, includeFiles: true })

    await expect(
      importer.load(built.bytes, '', other),
      'a second case took a reference the first still holds',
    ).rejects.toThrow(/already carries INC-9/)
  })


  /**
   * **An imported case is opened under a customer like any other.** The
   * importer writes the case row itself rather than going through
   * `CasesService.create`, so without this an archive lands in a group the
   * application reads as the default's and the index keys separately -- and
   * the reference rule then holds for cases raised one way and not the other.
   */
  it('opens the case it reads under the install default', async () => {
    const made = await furnished()
    const built = await exporter.build({ caseId: made.caseId, includeFiles: false })
    await db!.update(cases).set({ reference: '' }).where(eq(cases.id, made.caseId))

    const result = await importer.load(built.bytes, '', other)

    const [row] = await db!.select().from(cases).where(eq(cases.id, result.id))
    const [fallback] = await db!
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.isDefault, true))
    expect(fallback, 'the install holds no default customer').toBeDefined()
    expect(row!.customerId, 'the imported case carries no customer').toBe(fallback!.id)
  })

  /**
   * **The reference an archive carries is trimmed, as every other door trims
   * it.** `createCaseSchema` and the patch schema both do, so an archive
   * carrying a padded number would otherwise store one that collides with
   * nothing -- one ticket in two cases, refused by neither.
   */
  it('refuses an archive whose reference the install holds with different spacing', async () => {
    const made = await furnished()
    // **The archive carries the padded spelling**, which is reachable: a
    // hand-built `.iccase` states whatever it likes, and no door trims what an
    // archive already holds.
    await db!.update(cases).set({ reference: '  INC-PAD  ' }).where(eq(cases.id, made.caseId))
    const built = await exporter.build({ caseId: made.caseId, includeFiles: false })

    // The install holds the trimmed one, which is what every other door writes.
    await db!.update(cases).set({ reference: 'INC-PAD' }).where(eq(cases.id, made.caseId))
    await expect(
      importer.load(built.bytes, '', other),
      'an archive took a reference the install already holds',
    ).rejects.toThrow(/already carries INC-PAD/)
  })

  /** What an archive may hold; `archive/` states none of its own. -> #588 */
const ARCHIVE_LIMITS = { memberBytes: 256 * 1024 * 1024, totalBytes: 512 * 1024 * 1024 }

/**
 * The install's bounds, as the doors read them.
 *
 * **A stub, because these cases are not about the bounds.** Every door reads
 * them per act now, so a fixture that cannot answer fails to compile rather
 * than falling back to a constant -- which is the state #588 was about.
 */
const POLICY_DEFAULTS = defaultPolicy()
const policy = { read: () => Promise.resolve(POLICY_DEFAULTS) } as never

describe('a handover, exported without its files', () => {
    it('says so rather than looking damaged', async () => {
      const made = await furnished()
      const built = await exporter.build({ caseId: made.caseId, includeFiles: false })
      expect(built.attachments).toBe('omitted')

      await freeTheReference(made.caseId)
      const result = await importer.load(built.bytes, '', other)
      expect(result.attachments).toBe('omitted')
      expect(result.missingFiles).toBe(1)
    })

    it('keeps the digest on the row and does not claim to hold the file', async () => {
      const made = await furnished()
      const built = await exporter.build({ caseId: made.caseId, includeFiles: false })
      await freeTheReference(made.caseId)
      const result = await importer.load(built.bytes, '', other)

      const [row] = await seed!.select().from(evidence).where(eq(evidence.caseId, result.id))
      expect(row!.hash).toBe(made.hash)
      expect(row!.storedAt).toBeNull()
    })

    it('does not carry the artefact bytes at all', async () => {
      // The member list, not the raw bytes: the zip is deflated, so searching
      // it finds nothing either way and the assertion would be inert.
      const made = await furnished()
      const built = await exporter.build({ caseId: made.caseId, includeFiles: false })
      const { members } = await readArchive(built.bytes, ARCHIVE_LIMITS)
      expect(Object.keys(members).filter((one) => one.startsWith('evidence/'))).toEqual([])
    })

    /** The exporting install held every artefact; the analyst asked for the record alone. */
    it('reports the exporting install as having lost nothing', async () => {
      const made = await furnished()
      const built = await exporter.build({ caseId: made.caseId, includeFiles: false })
      await freeTheReference(made.caseId)
      const result = await importer.load(built.bytes, '', other)

      expect(result.missingFiles).toBe(1)
      expect(
        result.lostAtExport,
        'a handover was reported as an archive whose install had lost the file',
      ).toBe(0)
    })
  })

  describe('an archive whose install had lost an artefact', () => {
    /**
     * **The fixture is the only thing separating this from a handover**: both
     * import an evidence row with no bytes behind it, and the sibling case
     * next door asserts the same import says nothing was lost. -> #652
     */
    it('says the install that wrote it had already lost it', async () => {
      const made = await furnished()
      await rm(join(root, made.caseId, made.hash))

      const built = await exporter.build({ caseId: made.caseId, includeFiles: true })
      expect(built.attachments, 'the artefacts were not asked for').toBe('included')
      await freeTheReference(made.caseId)
      const result = await importer.load(built.bytes, '', other)

      expect(result.missingFiles).toBe(1)
      expect(
        result.lostAtExport,
        'the import dropped what the archive said it could not find',
      ).toBe(1)
    })

    /**
     * **The two counts are in different units, and the sentence the operator
     * reads names each unit rather than reconciling them.** The archive states
     * one entry per artefact -- the export walks the evidence rows by digest --
     * and the import counts one per row that arrives without its bytes.
     */
    it('states one lost file the case names twice once', async () => {
      const made = await furnished()
      await seed!.insert(evidence).values({
        caseId: made.caseId,
        name: 'Mailbox export, attached again',
        hash: made.hash,
        hashAlgorithm: 'sha256',
        sizeBytes: 18,
        storedAt: new Date(),
        createdBy: actorId,
      })
      await rm(join(root, made.caseId, made.hash))

      const built = await exporter.build({ caseId: made.caseId, includeFiles: true })
      await freeTheReference(made.caseId)
      const result = await importer.load(built.bytes, '', other)

      expect(result.missingFiles, 'the rows without their bytes are what this counts').toBe(2)
      expect(result.lostAtExport, 'the archive names the artefact once').toBe(1)
    })
  })

  describe('an encrypted archive', () => {
    it('is sealed, and comes back with the passphrase', async () => {
      const made = await furnished()
      const built = await exporter.build({
        caseId: made.caseId,
        includeFiles: true,
        passphrase: PASS,
      })
      expect(isSealed(built.bytes)).toBe(true)
      expect(built.bytes.includes(Buffer.from('Archived incident'))).toBe(false)

      await freeTheReference(made.caseId)
      const result = await importer.load(built.bytes, PASS, other)
      expect(result.title).toBe('Archived incident')
    })

    it('refuses the wrong passphrase', async () => {
      const made = await furnished()
      const built = await exporter.build({
        caseId: made.caseId,
        includeFiles: true,
        passphrase: PASS,
      })
      await expect(importer.load(built.bytes, 'not-the-passphrase', other)).rejects.toMatchObject({
        status: 422,
      })
    })

    it('asks for the passphrase rather than failing obscurely', async () => {
      const made = await furnished()
      const built = await exporter.build({
        caseId: made.caseId,
        includeFiles: true,
        passphrase: PASS,
      })
      await expect(importer.load(built.bytes, '', other)).rejects.toThrow(/encrypted/)
    })

    it('says a plain archive needs no passphrase rather than ignoring one', async () => {
      // An analyst who typed one believes the archive is encrypted. Importing
      // it silently leaves that belief in place about every copy of it.
      const made = await furnished()
      const built = await exporter.build({ caseId: made.caseId, includeFiles: true })
      await expect(importer.load(built.bytes, PASS, other)).rejects.toThrow(/not encrypted/)
    })
  })
})

afterAll(async () => {
  if (pool) await pool.end()
})
