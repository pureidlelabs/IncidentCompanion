/**
 * Attaching bytes to an evidence row, and getting them back.
 *
 * **Attacked at what the row would otherwise claim falsely.** A register that
 * says a file is attached and cannot produce it is worse than one that says
 * nothing - so the cases here are the ways the two halves come apart: a row
 * that never had bytes, a row whose bytes have gone, a digest the caller
 * supplied rather than the server computing, and a row in another case.
 */
import { Uint8ArrayReader, Uint8ArrayWriter, ZipReader } from '@zip.js/zip.js'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Readable } from 'node:stream'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CasesService } from '../cases/cases.service.js'
import { CollectionService } from './collection.service.js'
import { EvidenceController } from './entities.controller.js'
import { EvidenceFileController } from './evidence-file.controller.js'
import { EvidenceStore } from '../evidence/store.js'
import { cases, evidence, user } from '../db/schema/index.js'
import { withCase } from '../db/scope.js'
import { evidenceSchema } from '../domain/entities/evidence.js'
import { patchSchema } from '../domain/field-spec.js'
import { openTestPool } from '../../test/database.js'

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null

/** A request carrying `body` as its stream, which is all `attach` reads. */
function upload(body: string | Buffer, headers: Record<string, string> = {}) {
  const stream = Readable.from([Buffer.from(body)]) as unknown as {
    headers: Record<string, string>
  }
  stream.headers = { 'content-type': 'application/octet-stream', ...headers }
  return stream as never
}

/** A response that records what was written to it rather than sending it. */
function recorder() {
  const chunks: Buffer[] = []
  const headers: Record<string, string> = {}
  let finish: () => void = () => {}
  const done = new Promise<void>((resolve) => {
    finish = resolve
  })
  const response = {
    statusCode: 0,
    headers,
    chunks,
    status(code: number) {
      response.statusCode = code
      return response
    },
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = value
      return response
    },
    type(value: string) {
      headers['content-type'] = value
      return response
    },
    write(chunk: Buffer) {
      chunks.push(Buffer.from(chunk))
      return true
    },
    // **`pipe` is asynchronous, so a caller has to be able to wait for it.**
    // Without this the assertions run against an empty `chunks` and a test on
    // what the route *sent* silently becomes a test on nothing.
    end() {
      finish()
      return response
    },
    on() {
      return response
    },
    once() {
      return response
    },
    emit() {
      return true
    },
    done,
  }
  return response
}

/**
 * **The algorithm names the digest, so it is the upload's to write.** Both
 * halves are computed by `attach`; leaving this one in `evidenceSchema` made
 * it the only reachable half, and a row reading `md5` beside a SHA-256 digest
 * sends the analyst to the wrong function and reports a mismatch on intact
 * evidence.
 *
 * Outside the DB-backed block on purpose: the claim is about the schema, and
 * skipping it where no database is configured would leave the collection whose
 * point is integrity covered only when Postgres happens to be up.
 */
describe('the digest algorithm', () => {
  it('is refused in a create body and in a patch', () => {
    expect(evidenceSchema.strict().safeParse({ name: 'x', hashAlgorithm: 'md5' }).success).toBe(
      false,
    )
    // **`.strict()` refuses rather than dropping**, so this is a 422 naming the
    // key rather than a patch that quietly changes nothing.
    expect(patchSchema(evidenceSchema).safeParse({ hashAlgorithm: 'md5' }).success).toBe(false)
  })
})

describe.skipIf(!db)('an evidence attachment', () => {
  let controller: EvidenceFileController
  let rows: EvidenceController
  let store: EvidenceStore
  let cases_: CasesService
  let actorId: string
  let root: string

  async function caseWithRow(over: Record<string, unknown> = {}) {
    const row = await cases_.create({ title: 'Evidence case' }, actorId)
    const [made] = await seed!
      .insert(evidence)
      .values({ caseId: row.id, name: 'Mailbox export', createdBy: actorId, ...over })
      .returning()
    return { caseId: row.id, id: made!.id }
  }

  beforeAll(async () => {
    actorId = 'evidence-file-analyst'
    const now = new Date()
    await seed!
      .insert(user)
      .values({
        id: actorId,
        name: 'Evidence Analyst',
        email: 'evidence-file@example.test',
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()

    root = await mkdtemp(join(tmpdir(), 'ic-evidence-'))
    // **The environment too, not only the hand-built store.** `EvidenceStore`
    // takes its root from `EVIDENCE_DIR`, so a delete path that builds its own
    // store from config lands in this directory rather than in `.evidence` -
    // without which the retention tests below cannot see such a change at all.
    process.env.EVIDENCE_DIR = root
    store = new EvidenceStore({ get: () => root } as never)
    cases_ = new CasesService(
      db!,
      { announce: () => {}, othersOn: () => Promise.resolve([]) } as never,
    )
    controller = new EvidenceFileController(db!, store)
    rows = new EvidenceController(new CollectionService(db!))
  })

  afterAll(async () => {
    await seed!.delete(cases)
    await rm(root, { recursive: true, force: true })
  })

  it('computes the digest itself rather than believing the row', async () => {
    // The stored hash is what a later verification checks the file against.
    // Taken on the caller's word - or left as whatever the row already said -
    // that check compares a claim with itself.
    const { caseId, id } = await caseWithRow({ hash: 'not-a-real-digest' })

    const written = await controller.attach(caseId, id, upload('mail body'), {
      user: { id: actorId },
    } as never)

    expect(written.hash).toMatch(/^[0-9a-f]{64}$/)
    expect(written.hash).not.toBe('not-a-real-digest')
    const [row] = await seed!.select().from(evidence).where(eq(evidence.id, id))
    expect(row!.hash).toBe(written.hash)
    expect(row!.hashAlgorithm).toBe('sha256')
  })

  it('leaves the algorithm alone when a PATCH renames it', async () => {
    // The pair has to agree. `hash` was already unreachable; with the name of
    // the function reachable, an analyst could leave the row saying `md5` over
    // a SHA-256 digest - and the verification that follows fails on evidence
    // that was never altered.
    const { caseId, id } = await caseWithRow()
    await controller.attach(caseId, id, upload('mail body'), { user: { id: actorId } } as never)
    const [attached] = await seed!.select().from(evidence).where(eq(evidence.id, id))

    await expect(
      rows.update(
        caseId,
        id,
        { version: attached!.version, hashAlgorithm: 'md5' },
        { user: { id: actorId } } as never,
      ),
    ).rejects.toMatchObject({ status: 422 })

    const [after] = await seed!.select().from(evidence).where(eq(evidence.id, id))
    expect(after!.hashAlgorithm).toBe('sha256')
    expect(after!.hash).toBe(attached!.hash)
    expect(after!.version).toBe(attached!.version)

    // The control: this route does accept a patch, so the refusal above is
    // about the field rather than about a PATCH nothing can get through.
    await rows.update(
      caseId,
      id,
      { version: attached!.version, name: 'Renamed' },
      { user: { id: actorId } } as never,
    )
    const [renamed] = await seed!.select().from(evidence).where(eq(evidence.id, id))
    expect(renamed!.name).toBe('Renamed')
    expect(renamed!.hashAlgorithm).toBe('sha256')
  })

  it('records the size, the type and the name the file arrived under', async () => {
    const { caseId, id } = await caseWithRow()
    await controller.attach(
      caseId,
      id,
      upload('0123456789', {
        'content-type': 'message/rfc822',
        'x-original-filename': 'phish.eml',
      }),
      { user: { id: actorId } } as never,
    )

    const [row] = await seed!.select().from(evidence).where(eq(evidence.id, id))
    expect(row!.sizeBytes).toBe(10)
    expect(row!.contentType).toBe('message/rfc822')
    expect(row!.originalFilename).toBe('phish.eml')
    expect(row!.storedAt).not.toBeNull()
  })

  it('refuses an empty file rather than recording one', async () => {
    // It hashes and stores perfectly. The row would then claim an attachment
    // nobody can read anything out of, which is worse than no attachment.
    const { caseId, id } = await caseWithRow()
    await expect(
      controller.attach(caseId, id, upload(''), { user: { id: actorId } } as never),
    ).rejects.toMatchObject({ status: 422 })

    const [row] = await seed!.select().from(evidence).where(eq(evidence.id, id))
    expect(row!.storedAt).toBeNull()
  })

  it('hands back a zip under `infected`, holding the exact bytes', async () => {
    // **The download is the stored file, byte for byte.** Evidence is sealed at
    // rest so an analyst's own AV cannot quarantine it, and what leaves is that
    // same container - the form every sample repository uses and their tooling
    // already opens. Serving the plaintext would put an unprotected artefact on
    // their disk on the way to wherever they were taking it.
    const { caseId, id } = await caseWithRow()
    await controller.attach(
      caseId,
      id,
      upload('the exact bytes', { 'x-original-filename': 'sample.eml' }),
      { user: { id: actorId } } as never,
    )

    // **Asserted on what the route sent, not on what the store holds.** This
    // read `store.open()` and ignored the response, so it passed with
    // `controller.download` deleted from it - and a `content-length` naming
    // the plaintext size shipped green underneath it.
    const response = recorder()
    await controller.download(caseId, id, response as never)

    // The headers describe the container: a zip, named for the artefact, and
    // no length - the sealed size is not the plaintext size in either
    // direction, so declaring one truncates the download or hangs it.
    expect(response.headers['content-type']).toBe('application/zip')
    expect(response.headers['content-disposition']).toContain('sample.eml.zip')
    expect(response.headers['content-length']).toBeUndefined()

    await response.done
    const served = Buffer.concat(response.chunks)
    expect(served.length).toBeGreaterThan(0)

    // A zip, not the artefact: the local file header magic, and not the text.
    expect(served.subarray(0, 2).toString()).toBe('PK')
    expect(served.toString('latin1')).not.toContain('the exact bytes')

    const reader = new ZipReader(new Uint8ArrayReader(new Uint8Array(served)), {
      password: 'infected',
    })
    const [entry] = await reader.getEntries()
    expect(entry?.directory).toBe(false)
    expect(entry!.filename).toBe('sample.eml')
    const inside = await (entry as { getData: (w: Uint8ArrayWriter) => Promise<Uint8Array> })
      .getData(new Uint8ArrayWriter())
    expect(Buffer.from(inside).toString()).toBe('the exact bytes')
    await reader.close()
  })

  it('still gives the archive the plaintext, not the container', async () => {
    // `read` unwraps and `open` does not - the .iccase carries the artefact
    // itself, sealed once by the archive rather than twice.
    const { caseId, id } = await caseWithRow()
    await controller.attach(caseId, id, upload('the exact bytes'), {
      user: { id: actorId },
    } as never)
    const [row] = await seed!.select().from(evidence).where(eq(evidence.id, id))
    expect(Buffer.from((await store.read(row!.hash))!).toString()).toBe('the exact bytes')
  })

  it('names the download after the file, not after the digest', async () => {
    const { caseId, id } = await caseWithRow()
    await controller.attach(caseId, id, upload('x', { 'x-original-filename': 'notes.txt' }), {
      user: { id: actorId },
    } as never)

    const response = recorder()
    await controller.download(caseId, id, response as never)
    expect(response.headers['content-disposition']).toContain('notes.txt')
  })

  it('never offers to render an attachment in the browser', async () => {
    // Evidence is routinely an artefact from the incident. `inline` on a
    // stored `.html` is a stored-XSS delivery mechanism aimed at the analyst.
    const { caseId, id } = await caseWithRow()
    await controller.attach(caseId, id, upload('<script>alert(1)</script>', {
      'content-type': 'text/html',
    }), { user: { id: actorId } } as never)

    const response = recorder()
    await controller.download(caseId, id, response as never)
    expect(response.headers['content-disposition']).toMatch(/^attachment;/)
  })

  it('cannot be talked into splitting the header with a quoted filename', async () => {
    const { caseId, id } = await caseWithRow()
    await controller.attach(
      caseId,
      id,
      upload('x', { 'x-original-filename': 'a".txt' }),
      { user: { id: actorId } } as never,
    )

    const response = recorder()
    await controller.download(caseId, id, response as never)
    const disposition = response.headers['content-disposition'] ?? ''
    expect(disposition.match(/"/g) ?? []).toHaveLength(2)
  })

  it('says a row with no file has none, rather than sending nothing', async () => {
    // Most evidence lives in a locker and the row records where. A zero-length
    // 200 reads as a corrupt artefact rather than as one never attached.
    const { caseId, id } = await caseWithRow()
    // **The message is the assertion, not the status.** Both this and a row
    // whose bytes have vanished answer 404, so a test on the code alone passes
    // with the "never attached" branch deleted - measured. The two are
    // different facts: one is ordinary, the other is a fault in the install.
    await expect(
      controller.download(caseId, id, recorder() as never),
    ).rejects.toThrow(/no file attached/)
  })

  it('says so when the row claims bytes this install no longer holds', async () => {
    // An app root moved, or a file removed underneath. Streaming zero bytes
    // would present a missing artefact as an empty one.
    const { caseId, id } = await caseWithRow()
    await controller.attach(caseId, id, upload('gone soon'), {
      user: { id: actorId },
    } as never)
    const [row] = await seed!.select().from(evidence).where(eq(evidence.id, id))
    await store.forget(row!.hash)

    await expect(
      controller.download(caseId, id, recorder() as never),
    ).rejects.toThrow(/missing from this install/)
  })

  it('refuses a row belonging to another case', async () => {
    const mine = await caseWithRow()
    const theirs = await caseWithRow()
    await expect(
      controller.download(mine.caseId, theirs.id, recorder() as never),
    ).rejects.toMatchObject({ status: 404 })
    await expect(
      controller.attach(mine.caseId, theirs.id, upload('x'), {
        user: { id: actorId },
      } as never),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('stores identical content once, under the one digest', async () => {
    const a = await caseWithRow()
    const b = await caseWithRow()
    const first = await controller.attach(a.caseId, a.id, upload('same bytes'), {
      user: { id: actorId },
    } as never)
    const second = await controller.attach(b.caseId, b.id, upload('same bytes'), {
      user: { id: actorId },
    } as never)

    expect(second.hash).toBe(first.hash)
    // And both rows still resolve, which is the half that would break if the
    // store had treated the second write as a collision.
    expect(await store.verify(first.hash)).toBe(true)
  })

  /**
   * What happens to the bytes when the row naming them is deleted.
   *
   * **The store is retain-on-delete, and these pin it rather than endorse it.**
   * `EvidenceStore.forget` has no caller outside this file, so a deleted
   * evidence row leaves its artefact on disk for the life of the install. The
   * second and third tests are the reason that is not simply a bug to fix in
   * `CollectionService.remove`: the digest is shared across cases, and the
   * count that would make a delete safe is not visible from where the delete
   * runs.
   */
  it('leaves the artefact on disk when the row naming it is deleted', async () => {
    const { caseId, id } = await caseWithRow()
    const written = await controller.attach(caseId, id, upload('an orphan in waiting'), {
      user: { id: actorId },
    } as never)
    const [row] = await seed!.select().from(evidence).where(eq(evidence.id, id))

    await rows.remove(caseId, id, String(row!.version), { user: { id: actorId } } as never)

    expect(await seed!.select().from(evidence).where(eq(evidence.id, id))).toHaveLength(0)
    // **Retained, deliberately.** Change this only alongside a decision about
    // how long a deleted artefact is kept - it is malware in an evidence
    // store, so both answers are a product call rather than a cleanup.
    expect(await store.verify(written.hash)).toBe(true)
  })

  it("keeps another case's attachment when one of two rows naming a digest goes", async () => {
    // The case a naive fix destroys: dedup means the first delete is deleting
    // somebody else's evidence.
    const a = await caseWithRow()
    const b = await caseWithRow()
    const first = await controller.attach(a.caseId, a.id, upload('one artefact, two cases'), {
      user: { id: actorId },
    } as never)
    const second = await controller.attach(b.caseId, b.id, upload('one artefact, two cases'), {
      user: { id: actorId },
    } as never)
    expect(second.hash).toBe(first.hash)

    const [mine] = await seed!.select().from(evidence).where(eq(evidence.id, a.id))
    await rows.remove(a.caseId, a.id, String(mine!.version), { user: { id: actorId } } as never)

    const response = recorder()
    await controller.download(b.caseId, b.id, response as never)
    await response.done
    expect(Buffer.concat(response.chunks).length).toBeGreaterThan(0)
  })

  it('cannot see the other case that names a digest from inside the scoped write', async () => {
    // Why the count belongs in a sweep rather than in the delete. Row-level
    // security is what a case-scoped transaction is for, so a reference count
    // taken there answers "one" over an artefact two cases hold - and a delete
    // conditioned on it destroys the other one.
    const a = await caseWithRow()
    const b = await caseWithRow()
    const first = await controller.attach(a.caseId, a.id, upload('counted from inside'), {
      user: { id: actorId },
    } as never)
    await controller.attach(b.caseId, b.id, upload('counted from inside'), {
      user: { id: actorId },
    } as never)

    const scoped = await withCase(db!, a.caseId, (tx) =>
      tx.select({ id: evidence.id }).from(evidence).where(eq(evidence.hash, first.hash)),
    )
    const everywhere = await seed!
      .select({ id: evidence.id })
      .from(evidence)
      .where(eq(evidence.hash, first.hash))

    expect(everywhere).toHaveLength(2)
    expect(scoped).toHaveLength(1)
  })
})

afterAll(async () => {
  if (pool) await pool.end()
})
