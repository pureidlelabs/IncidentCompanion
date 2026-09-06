/**
 * Removing something inside a case removes it, and says who.
 *
 * *THEN it is removed, AND the removal is attributed like any other change.*
 * The level half is held by `a-level-is-asked-before-a-write.test.ts`, which
 * enumerates the four kinds the scenario names and asserts each needs `write`
 * rather than `delete`. That is a pure function of the method and the path, so
 * it says nothing about the removal happening or being attributable.
 *
 * **`activity.controller.test.ts` reads a `delete` row it wrote itself** into
 * `change_feed` -- which exercises the reader. Nothing asserted that a real
 * removal produces one.
 *
 * **Two collections, and the path is what is on trial.**
 * `CollectionService.remove` is one method for every collection, so sweeping
 * all thirteen would be thirteen fixtures over one branch. Evidence and a
 * report section are excluded deliberately: the first needs bytes in the store
 * and the second a parent report, and neither prerequisite is what this is
 * about.
 */
import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { PgColumn } from 'drizzle-orm/pg-core'

import { CollectionService } from './collection.service.js'
import { DEFINITION as TIMELINE } from './timeline.controller.js'
import { ordered } from './entities.controller.js'
import { cases } from '../db/schema/case.js'
import { changeFeed } from '../db/schema/change-feed.js'
import { systems } from '../db/schema/entities.js'
import { user } from '../db/schema/auth.js'
import { openTestPool } from '../../test/database.js'

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null

const ANALYST = 'removing-analyst'

const KINDS = [
  {
    label: 'a timeline entry',
    def: TIMELINE,
    values: {
      kind: 'event',
      time: new Date('2026-03-01T10:00:00.000Z'),
      description: 'Something that happened',
    },
  },
  {
    label: 'an entity',
    def: ordered('systems', systems),
    values: { hostname: 'WKS-REMOVED' },
  },
] as const

describe.skipIf(!db)('an analyst removing something inside a case', () => {
  let service: CollectionService
  let caseId: string

  beforeAll(async () => {
    service = new CollectionService(db!)

    const now = new Date()
    await seed!
      .insert(user)
      .values({
        id: ANALYST,
        name: 'Removing Analyst',
        email: `${ANALYST}@example.test`,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()

    const [made] = await seed!
      .insert(cases)
      .values({ title: 'A case things are removed from', createdBy: ANALYST, updatedBy: ANALYST })
      .returning({ id: cases.id })
    caseId = made!.id
  }, 90_000)

  afterAll(async () => {
    await seed!.delete(cases).where(eq(cases.id, caseId))
    await pool!.end()
  })

  it.each(KINDS.map((kind) => [kind.label, kind] as const))(
    'removes %s and leaves a line naming who removed it',
    async (_label, kind) => {
      const made = (await service.create(
        kind.def,
        caseId,
        kind.values,
        ANALYST,
      )) as { id: string; version: number }

      expect(made.id, 'nothing was created, so nothing is being removed').toBeDefined()

      const removed = await service.remove(kind.def, caseId, made.id, made.version, ANALYST)
      expect(removed, 'the service reported that it removed nothing').toBe(true)

      const idColumn = (kind.def.table as unknown as { id: PgColumn }).id
      const left = await seed!.select().from(kind.def.table).where(eq(idColumn, made.id))
      expect(left, 'the row is still there, so the removal was only reported').toHaveLength(0)

      const feed = await seed!
        .select()
        .from(changeFeed)
        .where(
          and(
            eq(changeFeed.caseId, caseId),
            eq(changeFeed.entityId, made.id),
            eq(changeFeed.op, 'delete'),
          ),
        )

      expect(feed, 'the removal left no line, so nobody can be asked about it').toHaveLength(1)
      expect(
        feed[0]!.actorId,
        'the removal is recorded and attributed to nobody, which is the half that makes ' +
          'it answerable',
      ).toBe(ANALYST)
      expect(feed[0]!.entity).toBe(kind.def.name)
    },
  )
})
