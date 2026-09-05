/**
 * A case out and back, against a real database.
 */
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CasesService } from '../cases/cases.service.js'
import { EvidenceStore } from '../evidence/store.js'
import { ArchiveExportService } from './export.service.js'
import { ArchiveImportService } from './import.service.js'
import { isSealed } from '../archive/envelope.js'
import { readArchive } from '../archive/format.js'
import { cases, evidence, reports, systems, timeline, user } from '../db/schema/index.js'
import { openTestPool } from '../../test/database.js'

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null

const PASS = 'a-long-enough-passphrase'

describe.skipIf(!db)('a case, out and back', () => {
  let exporter: ArchiveExportService
  let importer: ArchiveImportService
  let cases_: CasesService
  let store: EvidenceStore
  let actorId: string
  let other: string
  let root: string

  /** A case with a system, a timeline entry pointing at it, and an attachment. */
  async function furnished() {
    const row = await cases_.create(
      { title: 'Archived incident', reference: 'INC-9', customer: 'Acme' },
      actorId,
    )
    const [box] = await seed!
      .insert(systems)
      .values({ caseId: row.id, hostname: 'WKS-01', createdBy: actorId })
      .returning()
    const artefact = Buffer.from('the artefact bytes')
    const stored = await store.put(
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
      // **A list reference, which the importer's hand-written map never
      // held.** The scalar `systemId` beside it is the half that worked, so a
      // fixture carrying only that one cannot see the defect.
      evidenceIds: [artefactRow!.id],
      createdBy: actorId,
    })
    const [report] = await seed!
      .insert(reports)
      .values({
        caseId: row.id,
        label: 'The report',
        document: Buffer.from('pretend-yjs-bytes'),
        createdBy: actorId,
      })
      .returning()
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
    store = new EvidenceStore({ get: () => root } as never)
    cases_ = new CasesService(
      db!,
      { announce: () => {}, othersOn: () => Promise.resolve([]) } as never,
    )
    exporter = new ArchiveExportService(cases_, store)
    importer = new ArchiveImportService(db!, store)
  })

  afterAll(async () => {
    await seed!.delete(cases)
    await rm(root, { recursive: true, force: true })
  })

  it('brings the case back as a new case, not over the old one', async () => {
    // The decision the whole service turns on. Writing an archive back over a
    // live case discards whatever the analysts here did since, and the version
    // check has nothing to check against.
    const made = await furnished()
    const built = await exporter.build({ caseId: made.caseId, includeFiles: true })
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
   * **A list of references is remapped like a single one.**
   *
   * This drives one field of seventeen. The guard against the rest is that
   * the set is derived rather than listed, which `import-order.test.ts` and
   * `registry.test.ts` hold -- this test cannot see the other sixteen.
   */
  it('remaps every id in a list, not only the ones a map happened to name', async () => {
    const made = await furnished()
    const built = await exporter.build({ caseId: made.caseId, includeFiles: true })
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
    // created row is already at version 1, so an import that carried the
    // archive's version through would look identical - measured: the mutation
    // that carries every column left this green until the fixture moved.
    const made = await furnished()
    await seed!
      .update(systems)
      .set({ hostname: 'WKS-01-renamed', version: 7 })
      .where(eq(systems.id, made.systemId))

    const built = await exporter.build({ caseId: made.caseId, includeFiles: true })
    const result = await importer.load(built.bytes, '', other)

    const [box] = await seed!.select().from(systems).where(eq(systems.caseId, result.id))
    expect(box!.version).toBe(1)
  })

  it('attributes the rows to whoever imported them', async () => {
    // The archive's names are people on another install: a change feed naming
    // one is unresolvable here and draws a blank avatar.
    const made = await furnished()
    const built = await exporter.build({ caseId: made.caseId, includeFiles: true })
    const result = await importer.load(built.bytes, '', other)

    const [box] = await seed!.select().from(systems).where(eq(systems.caseId, result.id))
    expect(box!.createdBy).toBe(other)
  })

  it('carries the artefact bytes, and they still resolve', async () => {
    const made = await furnished()
    const built = await exporter.build({ caseId: made.caseId, includeFiles: true })
    const result = await importer.load(built.bytes, '', other)

    const [row] = await seed!.select().from(evidence).where(eq(evidence.caseId, result.id))
    expect(row!.hash).toBe(made.hash)
    expect(row!.storedAt).not.toBeNull()
    expect(Buffer.from((await store.read(row!.hash))!).toString()).toBe('the artefact bytes')
    expect(result.missingFiles).toBe(0)
  })

  it('carries the prose document onto the report it now belongs to', async () => {
    // Filed under the old report id it would be in the archive and reachable
    // from nothing - the same class as the supersede re-keying.
    const made = await furnished()
    const built = await exporter.build({ caseId: made.caseId, includeFiles: true })
    const result = await importer.load(built.bytes, '', other)

    const [report] = await seed!.select().from(reports).where(eq(reports.caseId, result.id))
    expect(report!.document).not.toBeNull()
    expect(Buffer.from(report!.document!).toString()).toBe('pretend-yjs-bytes')
  })

  it('keeps the prose document out of the JSON a human reads', async () => {
    // **Read out of the archive, not searched for in its bytes.** The zip is
    // deflated, so a raw search of `built.bytes` never finds the plaintext
    // whether it is in there or not - measured: the mutation that inlines the
    // document left the byte-search version of this green.
    const made = await furnished()
    const built = await exporter.build({ caseId: made.caseId, includeFiles: true })
    const { members } = await readArchive(built.bytes)
    const record = JSON.parse(Buffer.from(members['case.json']!).toString('utf8')) as {
      reports: Record<string, unknown>[]
    }
    // **The key, not the text.** `JSON.stringify` renders a Buffer as
    // `{"type":"Buffer","data":[...]}`, so searching the JSON for the document's
    // words or its base64 finds neither whether it is inlined or not -
    // measured: the mutation that inlines it left the text-search version
    // green. What is asserted is that no report carries a `document` at all.
    expect(record.reports).toHaveLength(1)
    expect(record.reports[0]).not.toHaveProperty('document')
    expect(Object.keys(members)).toContain(`prose/${made.reportId}.ydoc`)
  })

  describe('a handover, exported without its files', () => {
    it('says so rather than looking damaged', async () => {
      const made = await furnished()
      const built = await exporter.build({ caseId: made.caseId, includeFiles: false })
      expect(built.attachments).toBe('omitted')

      const result = await importer.load(built.bytes, '', other)
      expect(result.attachments).toBe('omitted')
      expect(result.missingFiles).toBe(1)
    })

    it('keeps the digest on the row and does not claim to hold the file', async () => {
      const made = await furnished()
      const built = await exporter.build({ caseId: made.caseId, includeFiles: false })
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
      const { members } = await readArchive(built.bytes)
      expect(Object.keys(members).filter((one) => one.startsWith('evidence/'))).toEqual([])
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
