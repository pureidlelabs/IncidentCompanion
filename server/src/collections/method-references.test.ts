/**
 * That a method reference cannot leave its own case, and what a deleted method
 * leaves behind.
 *
 * **A method is referenced more often than anything else in the app**, which is
 * the whole argument for it being a row rather than a string on six rows. That
 * makes it the reference most worth attacking: one hole here reaches the
 * timeline, five entity collections, evidence and impact at once.
 *
 * **Both registries have to be read for any of this to work.** A picked
 * reference carries `refTarget` on the control's metadata and an identity one
 * has no control to carry it; `referenceFieldsOf` reads both, and missing
 * either is what left `report_blocks.reportId` unchecked.
 * -> `domain/references.ts`
 */
import { drizzle } from 'drizzle-orm/node-postgres'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { withCase } from '../db/scope.js'
import { cases, methods, systems, timeline } from '../db/schema/index.js'
import { danglingReferences } from './reference-check.js'
import { referenceFieldsOf } from '../domain/references.js'
import { methodSchema } from '../domain/entities/method.js'
import { evidenceSchema } from '../domain/entities/evidence.js'
import { systemSchema } from '../domain/entities/system.js'
import { impactSchema } from '../domain/entities/impact.js'
import { eventWriteSchema, actionWriteSchema } from '../domain/entities/timeline.js'
import { openTestPool } from '../../test/database.js'

/**
 * **Pure, so it runs with no database.** Which schemas declare a method
 * reference is a fact about the declarations, and the commonest way to ship
 * half this feature is to declare it on one timeline arm and not the other.
 */
describe('every collection that cites a method declares it', () => {
  const targetsOf = (schema: Parameters<typeof referenceFieldsOf>[0]) =>
    referenceFieldsOf(schema).filter((one) => one.target === 'methods')

  it('declares it on BOTH timeline arms, not just the event', () => {
    expect(targetsOf(eventWriteSchema)).toEqual([{ field: 'methodIds', target: 'methods' }])
    expect(targetsOf(actionWriteSchema)).toEqual([{ field: 'methodIds', target: 'methods' }])
  })

  it('declares it on evidence, systems and impact', () => {
    expect(targetsOf(evidenceSchema)).toEqual([{ field: 'methodId', target: 'methods' }])
    expect(targetsOf(systemSchema)).toEqual([{ field: 'methodId', target: 'methods' }])
    expect(targetsOf(impactSchema)).toEqual([{ field: 'methodIds', target: 'methods' }])
  })

  /**
   * **A method points at nothing, and that is the shape that makes the rest
   * work.** A saved console export is an evidence row whose own `methodId`
   * names the method, so the reference runs one way. `import-order.test.ts`
   * refuses the other: the archive importer builds its remap as it inserts, so
   * a cycle means one direction silently writes null on every round trip.
   */
  it('holds no outward reference of its own', () => {
    expect(referenceFieldsOf(methodSchema)).toEqual([])
  })
})

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null

/**
 * **Closed once, at the file level.** Two describes share the pool, and a
 * teardown inside the first one closes it under the second - which fails as
 * *cannot use a pool after calling end*, three describes away from the cause.
 */
afterAll(async () => {
  if (pool) await pool.end()
  if (seedPool && seedPool !== pool) await seedPool.end()
})

describe.skipIf(!db)('a method reference that leaves the case', () => {
  let mine = ''
  let theirs = ''
  let myMethod = ''
  let theirMethod = ''

  beforeAll(async () => {
    const [a] = await seed!.insert(cases).values({ title: 'Methods mine' }).returning()
    const [b] = await seed!.insert(cases).values({ title: 'Methods theirs' }).returning()
    mine = a!.id
    theirs = b!.id
    const [m1] = await seed!
      .insert(methods)
      .values({ caseId: mine, name: 'My sweep', query: 'CommonSecurityLog' })
      .returning()
    const [m2] = await seed!
      .insert(methods)
      .values({ caseId: theirs, name: 'Their sweep', query: 'SecurityEvent' })
      .returning()
    myMethod = m1!.id
    theirMethod = m2!.id
  })

  afterAll(async () => {
    await seed!.delete(cases)
  })

  it('accepts a method in the same case', async () => {
    const dangling = await withCase(db!, mine, (tx) =>
      danglingReferences(tx, eventWriteSchema, { methodIds: [myMethod] }),
    )

    expect(dangling).toEqual([])
  })

  /**
   * The one nothing else catches. `method_ids` is jsonb with no foreign key at
   * all, so without this check any string at all could sit in it.
   */
  it('refuses a timeline entry citing another case\u2019s method', async () => {
    const dangling = await withCase(db!, mine, (tx) =>
      danglingReferences(tx, eventWriteSchema, { methodIds: [theirMethod] }),
    )

    expect(dangling).toEqual([{ field: 'methodIds', target: 'methods', ids: [theirMethod] }])
  })

  it('refuses one bad id hidden in a list of good ones', async () => {
    const dangling = await withCase(db!, mine, (tx) =>
      danglingReferences(tx, eventWriteSchema, { methodIds: [myMethod, theirMethod] }),
    )

    expect(dangling).toEqual([{ field: 'methodIds', target: 'methods', ids: [theirMethod] }])
  })

  it('refuses an activity citing another case\u2019s method, not only an event', async () => {
    const dangling = await withCase(db!, mine, (tx) =>
      danglingReferences(tx, actionWriteSchema, { methodIds: [theirMethod] }),
    )

    expect(dangling).toEqual([{ field: 'methodIds', target: 'methods', ids: [theirMethod] }])
  })

  it('refuses an evidence row citing another case\u2019s method', async () => {
    const dangling = await withCase(db!, mine, (tx) =>
      danglingReferences(tx, evidenceSchema, { methodId: theirMethod }),
    )

    expect(dangling).toEqual([{ field: 'methodId', target: 'methods', ids: [theirMethod] }])
  })

  it('refuses an entity citing another case\u2019s method', async () => {
    const dangling = await withCase(db!, mine, (tx) =>
      danglingReferences(tx, systemSchema, { methodId: theirMethod }),
    )

    expect(dangling).toEqual([{ field: 'methodId', target: 'methods', ids: [theirMethod] }])
  })

})

/**
 * **What a delete leaves behind, which is two different answers.** A method
 * deleted while other rows still cite it.
 */
describe.skipIf(!db)('deleting a method that things reference', () => {
  let kase = ''

  beforeAll(async () => {
    const [c] = await seed!.insert(cases).values({ title: 'Methods delete' }).returning()
    kase = c!.id
  })

  afterAll(async () => {
    await seed!.delete(cases)
  })

  /**
   * A scalar reference has a foreign key with `ON DELETE SET NULL`, so the
   * citing row survives with its attribution unknown - the same answer
   * `createdBy` gives when an analyst is deleted, and the honest one.
   */
  it('nulls a scalar reference rather than deleting the row that cited it', async () => {
    const [m] = await seed!.insert(methods).values({ caseId: kase, name: 'Doomed' }).returning()
    const [row] = await seed!
      .insert(systems)
      .values({ caseId: kase, hostname: 'FS-01', methodId: m!.id })
      .returning()

    await seed!.delete(methods).where(eq(methods.id, m!.id))

    const [after] = await seed!.select().from(systems).where(eq(systems.id, row!.id))
    expect(after).toBeDefined()
    expect(after!.methodId).toBeNull()
  })

  /**
   * **A list reference has no foreign key, so nothing nulls it**, and the id
   * is left pointing at a row that is gone. This asserts the state as it is
   * rather than as anyone would want it: the client draws an unresolved id as
   * *(missing reference)*, which is visible, and nothing silently drops the
   * citation. A cascade here is what would be dangerous - it would edit
   * another analyst's timeline entry as a side effect of a delete.
   */
  it('leaves a list reference dangling, visibly, rather than editing the citing row', async () => {
    const [m] = await seed!.insert(methods).values({ caseId: kase, name: 'Doomed too' }).returning()
    const [entry] = await seed!
      .insert(timeline)
      .values({
        caseId: kase,
        kind: 'event',
        time: new Date('2026-08-13T16:46:41Z'),
        description: 'Bulk upload',
        methodIds: [m!.id],
      })
      .returning()

    await seed!.delete(methods).where(eq(methods.id, m!.id))

    const [after] = await seed!.select().from(timeline).where(eq(timeline.id, entry!.id))
    expect(after!.methodIds).toEqual([m!.id])
  })
})
