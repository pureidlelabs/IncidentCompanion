/**
 * **A batch door cannot mint an evidence record claiming an artefact.**
 *
 * `domain/collections.ts` carried a comment giving the reason `evidence` was
 * excluded from the batch doors -- *nothing about a batch door mints a record
 * claiming a file nobody uploaded* -- beside an `evidence` entry that was not
 * excluded. The question that left open is whether the flag or the comment was
 * wrong. -> #362
 *
 * **The flag is right, and these are the measurements that settle it.** A
 * record with no digest and no `storedAt` claims no file: it says evidence
 * exists and `location` says where, which the schema calls the ordinary case
 * in as many words -- *most evidence is not in this app and should not be*. So
 * a batch-created record is the same shape as a single-created one, and the
 * only way to get the claiming kind is to attach bytes, which no batch door
 * does.
 *
 * **Asserted rather than reasoned, because the guarantee is one word.** It is
 * `this.schema.strict()` in the batch handler. Drop `strict` and a caller
 * names its own digest; the schema is the only thing between a client and a
 * row that says this install holds an artefact it has never seen -- and an
 * install that counts what it holds against what is beside it then reports
 * that artefact missing for ever.
 *
 * **What this does not cover:** the CSV import, which reaches the same handler
 * with the same schema, and what a case does with a record whose artefact is
 * absent.
 */
import { PATH_METADATA } from '@nestjs/common/constants'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CollectionService } from './collection.service.js'
import { ENTITY_CONTROLLERS } from './entities.controller.js'
import { COLLECTIONS } from '../domain/collections.js'
import { cases, evidence, user } from '../db/schema/index.js'
import { openTestPool } from '../../test/database.js'

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

/** Fixtures write across cases, which the app role may not. */
const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null

const ANALYST = 'bulk-evidence-analyst'

interface Bulk {
  createMany(caseId: string, body: unknown, session: { user: { id: string } }): Promise<{
    ids: string[]
  }>
}

function batchDoorFor(name: string): Bulk {
  const found = ENTITY_CONTROLLERS.find(
    (one) => Reflect.getMetadata(PATH_METADATA, one) === `api/cases/:caseId/${name}`,
  )
  if (!found) throw new Error(`no controller is mounted at ${name}`)
  return new (found as new (s: CollectionService) => Bulk)(new CollectionService(db!))
}

describe.skipIf(!db)('creating evidence a batch at a time', () => {
  let caseId = ''
  const session = { user: { id: ANALYST } }

  beforeAll(async () => {
    const now = new Date()
    await seed!
      .insert(user)
      .values({
        id: ANALYST,
        name: 'Bulk Evidence Analyst',
        email: `${ANALYST}@example.test`,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
    const [made] = await seed!
      .insert(cases)
      .values({ title: 'A case whose evidence is recorded in bulk' })
      .returning()
    caseId = made!.id
  }, 90_000)

  afterAll(async () => {
    await seed!.delete(cases).where(eq(cases.id, caseId))
    await seed!.delete(user).where(eq(user.id, ANALYST))
    await pool?.end()
  })

  /**
   * **The decision, pinned.** Leaving it as a flag with a comment against it
   * is what made this a question twice; a case that names the answer is what
   * stops it being asked a third time.
   */
  it('is offered at all, because a record without bytes is a record of where they are', () => {
    expect(
      COLLECTIONS.evidence.bulk,
      'evidence no longer takes a batch write, and #362 decided that it should',
    ).toBe(true)
  })

  it('writes a record that claims no artefact', async () => {
    const { ids } = await batchDoorFor('evidence').createMany(
      caseId,
      { entries: [{ name: 'Mailbox export', location: 'Evidence locker, shelf 4' }] },
      session,
    )

    // Read back before it is asked about: every assertion below is on an
    // optional chain, so an absent row answers all three by saying nothing.
    expect(ids, 'the batch door reported writing no row').toHaveLength(1)
    const [row] = await seed!.select().from(evidence).where(eq(evidence.id, ids[0]!))
    expect(row, 'the row the door reported writing is not in the table').toBeDefined()

    expect(row!.hash ?? '', 'a batch-created record names a digest nobody computed').toBe('')
    expect(
      row!.storedAt,
      'a batch-created record says this install holds bytes it was never given',
    ).toBeNull()
    expect(row!.location, 'the record does not say where the artefact actually is').toBe(
      'Evidence locker, shelf 4',
    )
  })

  /**
   * **Refused rather than quietly dropped.** A caller that names a digest has
   * asked for something the door cannot honestly do, and an answer of 201 to
   * that request is a record the caller believes says something it does not.
   */
  it.each([
    ['a digest', { hash: 'a'.repeat(64) }],
    ['that this install holds it', { storedAt: new Date().toISOString() }],
    ['which function produced the digest', { hashAlgorithm: 'md5' }],
  ])('refuses a batch naming %s', async (_what, claimed) => {
    await expect(
      batchDoorFor('evidence').createMany(
        caseId,
        { entries: [{ name: 'Mailbox export', ...claimed }] },
        session,
      ),
      'the door took a field the upload is the only thing allowed to write',
    ).rejects.toMatchObject({ status: 422 })
  })
})
