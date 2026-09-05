/**
 * **The same act through two doors reaches the same answer.**
 *
 * A row can be patched one at a time or as part of a selection, and the two
 * paths are separate code. The defect this shape catches is one door skipping
 * a guard the other applies - which is not hypothetical here: a bulk patch
 * overwrote a concurrent single-row edit without checking the version, and no
 * per-door test could see it, because each door did exactly what its own test
 * asked of it.
 *
 * **Quantified over the registry, so a new collection is swept the day it is
 * added.** A hand-written list would be written by whoever added the
 * collection, at the moment they added it, which is the same person and the
 * same moment as the door that forgot.
 *
 * **The comparison is between two deltas on one row, not between two rows.**
 * Different rows carry different contents, so the only thing that could be
 * compared directly is what the patch *changed* - which keys moved and what
 * they moved to. One row, patched through each door in turn, keeps that
 * honest without needing the collection to hold two.
 */
import { PATH_METADATA } from '@nestjs/common/constants'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { CollectionService } from './collection.service.js'
import { ENTITY_CONTROLLERS } from './entities.controller.js'
import { DemoContentSeeder } from '../demos/content.seeder.js'
import { DemoSeederService } from '../demos/seeder.service.js'
import { cases, user } from '../db/schema/index.js'
import { BULK_TARGETS, COLLECTION_SCHEMAS } from '../domain/collections.js'
import { patchSchema } from '../domain/field-spec.js'
import { openTestPool } from '../../test/database.js'

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null

afterAll(async () => {
  if (db) await db.delete(cases)
  await pool?.end()
})

interface Session {
  user: { id: string }
}

interface Doors {
  update(caseId: string, id: string, body: unknown, session: Session): Promise<unknown>
  updateMany(
    caseId: string,
    body: unknown,
    session: Session,
  ): Promise<{ updated: string[]; missing: string[]; refused: string[] }>
  list(caseId: string): Promise<Record<string, unknown>[]>
}

function controllerFor(name: string): Doors {
  const found = ENTITY_CONTROLLERS.find(
    (c) => Reflect.getMetadata(PATH_METADATA, c) === `api/cases/:caseId/${name}`,
  )!
  return new (found as new (s: CollectionService) => Doors)(new CollectionService(db!))
}

/**
 * A field this collection will accept a string into, found by asking the
 * schema rather than by naming one.
 *
 * The application's own patch validator is the oracle: a key it accepts is
 * patchable by definition, so this cannot drift from what the doors allow.
 * `null` for a collection with no such field, which is recorded rather than
 * silently skipped.
 */
function aPatchableTextField(collection: string): string | null {
  const schema = COLLECTION_SCHEMAS[collection]
  if (!schema) return null
  const patch = patchSchema(schema)
  for (const key of Object.keys(schema.shape)) {
    if (patch.safeParse({ [key]: 'two doors' }).success) return key
  }
  return null
}

/** The keys whose values differ, with what they became. */
function delta(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(after)) {
    if (String(before[key]) !== String(after[key])) out[key] = after[key]
  }
  return out
}

const byId = (rows: Record<string, unknown>[], id: string) => rows.find((row) => row['id'] === id)!

/**
 * The collections with both doors and a schema to patch through them, and the
 * ones that fell out.
 *
 * `timeline` publishes no single schema - its patchable fields depend on which
 * kind the row is - so it is absent here by derivation rather than by opinion,
 * and its own doors are covered in `timeline.write.test.ts`.
 */
const SWEPT: { collection: string; field: string }[] = BULK_TARGETS.flatMap((name) => {
  const field = aPatchableTextField(name)
  return field === null ? [] : [{ collection: name, field }]
})

describe.skipIf(!db)('the two write doors agree', () => {
  let caseId: string
  /** Who makes the patch under measurement. */
  let session: Session
  /**
   * Who arranges the row before each measurement, and never the same person.
   *
   * **Two actors, because one hides a whole class of difference.** With a
   * single actor the row already carries their name before either door is
   * asked, so a door that never writes `updatedBy` produces the same delta as
   * one that does - measured: removing `updatedBy` from the bulk statement
   * left this file green.
   */
  let setup: Session

  beforeAll(async () => {
    const now = new Date()
    for (const [id, name, email] of [
      ['parity-analyst', 'Parity Analyst', 'parity@example.test'],
      ['parity-arranger', 'Parity Arranger', 'arranger@example.test'],
    ] as const) {
      await seed!
        .insert(user)
        .values({ id, name, email, emailVerified: true, createdAt: now, updatedAt: now })
        .onConflictDoNothing()
    }
    session = { user: { id: 'parity-analyst' } }
    setup = { user: { id: 'parity-arranger' } }
  })

  beforeEach(async () => {
    await seed!.delete(cases)
    await new DemoSeederService(seed!, seed, new DemoContentSeeder(seed)).reseed()
    const [one] = await seed!.select().from(cases).where(eq(cases.reference, 'DEMO-2026-001'))
    caseId = one!.id
  })

  /**
   * Without this the sweep is vacuous the moment the registry import breaks or
   * `patchSchema` stops accepting anything: an empty `SWEPT` runs no case and
   * reports success.
   */
  it('has collections to sweep', () => {
    expect(SWEPT.length).toBeGreaterThan(4)
  })

  describe.each(SWEPT)('$collection', ({ collection, field }) => {
    /**
     * Both doors are given the same patch, against the same row from the same
     * arranged state, and what they changed has to match.
     *
     * Skipped where the demo case holds no rows of this collection at all:
     * inventing one would test the creator rather than the two doors.
     */
    it(`changes the same things through either door, patching ${field}`, async (ctx) => {
      const doors = controllerFor(collection)
      const start = await doors.list(caseId)
      // Reported as skipped rather than returning green: a case that quietly
      // asserts nothing is indistinguishable from one that passed, which is
      // the failure this whole file is against.
      if (start.length === 0) return ctx.skip()

      const id = start[0]!['id'] as string
      const value = 'two doors, one answer'
      const resting = 'a value neither door is being asked for'

      /**
       * **Both measurements start from the same arranged state**, written by
       * somebody else: the seeded row has no `updatedBy` at all, so whichever
       * door went first would have changed it and the other would not - a
       * difference in the sequencing rather than in the doors.
       */
      const patchSingle = async (to: unknown, who: Session) => {
        const before = byId(await doors.list(caseId), id)
        await doors.update(caseId, id, { version: before['version'], [field]: to }, who)
        return [before, byId(await doors.list(caseId), id)] as const
      }

      await patchSingle(resting, setup)

      const [beforeSingle, afterSingle] = await patchSingle(value, session)
      await patchSingle(resting, setup)

      const beforeBulk = byId(await doors.list(caseId), id)
      await doors.updateMany(
        caseId,
        { ids: [{ id, version: beforeBulk['version'] as number }], fields: { [field]: value } },
        session,
      )
      const afterBulk = byId(await doors.list(caseId), id)

      const single = delta(beforeSingle, afterSingle)
      const bulk = delta(beforeBulk, afterBulk)

      /**
       * **`updatedAt` is out of the comparison, and asserted per door
       * instead.** Two patches inside one millisecond leave it unchanged, so
       * whether it appears in a delta is a fact about how fast the suite ran.
       * That it never goes backwards is the property that is actually owed.
       */
      for (const changed of [single, bulk]) delete changed['updatedAt']
      expect(Date.parse(String(afterSingle['updatedAt']))).toBeGreaterThanOrEqual(
        Date.parse(String(beforeSingle['updatedAt'])),
      )
      expect(Date.parse(String(afterBulk['updatedAt']))).toBeGreaterThanOrEqual(
        Date.parse(String(beforeBulk['updatedAt'])),
      )

      expect(Object.keys(single).sort()).toEqual(Object.keys(bulk).sort())
      expect(single[field]).toBe(value)
      expect(bulk[field]).toBe(value)

      // **Each door advances the version by exactly one.** Compared per door
      // rather than against each other: the row has been written four times by
      // now, so the two absolute numbers legitimately differ while the step
      // must not.
      expect(Number(afterSingle['version']) - Number(beforeSingle['version'])).toBe(1)
      expect(Number(afterBulk['version']) - Number(beforeBulk['version'])).toBe(1)

      for (const changed of [single, bulk]) delete changed['version']
      expect(single).toEqual(bulk)
    })

    /**
     * **The guard, which is the half a per-door test cannot see.** The two
     * doors report a stale version differently by design - one throws, the
     * other names the row in `refused` - so what has to agree is the outcome:
     * neither writes.
     */
    it(`refuses a stale version through either door, patching ${field}`, async (ctx) => {
      const doors = controllerFor(collection)
      const rows = await doors.list(caseId)
      if (rows.length === 0) return ctx.skip()

      const row = rows[0]!
      const id = row['id'] as string
      const stale = (row['version'] as number) - 1
      const value = 'this must not land'

      await expect(
        doors.update(caseId, id, { version: stale, [field]: value }, session),
      ).rejects.toBeInstanceOf(Error)
      expect(byId(await doors.list(caseId), id)[field]).not.toBe(value)

      const result = await doors.updateMany(
        caseId,
        { ids: [{ id, version: stale }], fields: { [field]: value } },
        session,
      )
      expect(result.updated).toEqual([])
      expect(byId(await doors.list(caseId), id)[field]).not.toBe(value)
    })
  })
})
