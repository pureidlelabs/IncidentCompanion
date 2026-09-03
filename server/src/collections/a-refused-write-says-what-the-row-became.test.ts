/**
 * **A write refused for being stale names the version the row actually
 * reached**, across every collection rather than one.
 *
 * The subject list is `ENTITY_CONTROLLERS`, so a collection added later is
 * swept without this file being edited.
 *
 * **The patch is a field's own value written back**, which is the only patch
 * valid for every collection without hand-writing twelve bodies. Strings only:
 * a timestamp arrives from the driver as a `Date` and its schema wants a
 * string, so a round trip through the parser is not the identity there.
 */
import { PATH_METADATA } from '@nestjs/common/constants'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CollectionService } from './collection.service.js'
import { ENTITY_CONTROLLERS } from './entities.controller.js'
import { DemoContentSeeder } from '../demos/content.seeder.js'
import { DemoSeederService } from '../demos/seeder.service.js'
import { cases, user } from '../db/schema/index.js'
import { openTestPool } from '../../test/database.js'

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null

interface Writable {
  list(caseId: string): Promise<Record<string, unknown>[]>
  update(
    caseId: string,
    id: string,
    body: unknown,
    session: { user: { id: string } },
  ): Promise<unknown>
}

/** What a version lives beside, and so is never a patchable field. */
const NOT_A_PATCH = new Set([
  'id',
  'caseId',
  'version',
  'createdAt',
  'updatedAt',
  'createdBy',
  'updatedBy',
])

function collections(): { name: string; make: () => Writable }[] {
  return ENTITY_CONTROLLERS.map((controller) => {
    const path = Reflect.getMetadata(PATH_METADATA, controller) as string
    return {
      name: path.replace('api/cases/:caseId/', ''),
      make: () =>
        new (controller as new (s: CollectionService) => Writable)(new CollectionService(db!)),
    }
  })
}

/** A field whose own value is a patch the collection's schema will accept. */
function aStringFieldOf(row: Record<string, unknown>): [string, string] | null {
  for (const [key, value] of Object.entries(row)) {
    if (NOT_A_PATCH.has(key)) continue
    if (typeof value === 'string' && value.length > 0) return [key, value]
  }
  return null
}

/** Which collections the sweep reached a row in, read by the vacuity guard. */
const exercised: string[] = []

describe.skipIf(!db)('a refused write says what the row became', () => {
  let caseId: string
  let session: { user: { id: string } }

  beforeAll(async () => {
    await seed!.delete(cases)
    await new DemoSeederService(seed!, seed, new DemoContentSeeder(seed)).reseed()
    const [row] = await seed!.select().from(cases).where(eq(cases.reference, 'DEMO-2026-001'))
    caseId = row!.id
    const now = new Date()
    await seed!
      .insert(user)
      .values({
        id: 'stale-writer',
        name: 'Stale Writer',
        email: 'stale-writer@example.test',
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
    session = { user: { id: 'stale-writer' } }
  }, 90_000)

  afterAll(async () => {
    await seed!.delete(cases)
    await pool!.end()
  })

  it.each(collections().map((c) => [c.name, c] as const))(
    '%s refuses a stale patch and names the current version',
    async (_name, collection) => {
      const controller = collection.make()
      const rows = await controller.list(caseId)
      const row = rows.find((r) => aStringFieldOf(r) !== null)
      if (!row) return

      const [field, value] = aStringFieldOf(row)!
      const readAt = row['version'] as number
      const id = row['id'] as string

      // The first write is what makes the second one stale.
      await controller.update(caseId, id, { version: readAt, [field]: value }, session)

      const refusal = await controller
        .update(caseId, id, { version: readAt, [field]: value }, session)
        .then(() => null)
        .catch((error: { status?: number; response?: { currentVersion?: unknown } }) => error)

      expect(
        refusal,
        `${collection.name} accepted a write against a version it had moved past`,
      ).not.toBeNull()
      expect(refusal!.status).toBe(409)
      expect(
        refusal!.response?.currentVersion,
        `${collection.name} refused the write without saying what the row became`,
      ).toBe(readAt + 1)

      exercised.push(collection.name)
    },
  )

  /**
   * The vacuity guard. Every case above returns early on a collection the demo
   * case leaves empty, so a seeder that stopped writing rows would leave the
   * whole sweep green having asserted nothing.
   */
  it('covered most of the collections, or the sweep above proved little', () => {
    expect(exercised.length).toBeGreaterThan(7)
  })
})
