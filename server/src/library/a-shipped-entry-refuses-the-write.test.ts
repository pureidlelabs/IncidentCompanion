/**
 * A built-in refuses a write, and the row is the same afterwards.
 */
import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { LIBRARY_KINDS } from './kinds.js'
import { LibraryService } from './library.service.js'
import { library } from '../db/schema/library.js'
import { openTestPool } from '../../test/database.js'

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null

/** A payload no built-in has, so its arrival can only be the write landing. */
const TAMPERED = { tamperedBy: 'a-shipped-entry-refuses-the-write' }

describe.skipIf(!db)('an entry that ships with the app', () => {
  let service: LibraryService

  beforeAll(async () => {
    await seed!.delete(library)
    service = new LibraryService(db!, seed)
    await service.seedBuiltIns()
  }, 90_000)

  afterAll(async () => {
    await pool!.end()
  })

  const shippedIn = async (slug: string) => {
    const [row] = await seed!
      .select()
      .from(library)
      .where(and(eq(library.kind, slug), eq(library.builtin, true)))
      .limit(1)
    return row
  }

  it.each(LIBRARY_KINDS.map((kind) => [kind.slug] as const))(
    '%s ships something, so the cases below have a subject',
    async (slug) => {
      expect(await shippedIn(slug), `${slug} seeded no built-in`).toBeDefined()
    },
  )

  it.each(LIBRARY_KINDS.map((kind) => [kind.slug] as const))(
    '%s refuses an edit to a built-in and leaves it as it was',
    async (slug) => {
      const before = await shippedIn(slug)

      const moved = await service.update(slug, before!.name, TAMPERED)
      expect(moved, `${slug}: the update reported that it changed a built-in`).toBe(false)

      const after = await shippedIn(slug)
      expect(
        after!.payload,
        `${slug}: the built-in's payload changed, so the write landed and only its report ` +
          'said otherwise',
      ).toEqual(before!.payload)
      expect(after!.builtin, `${slug}: the row stopped being a built-in`).toBe(true)
    },
  )

  /**
   * The other half of the requirement: *the copy MUST be the install's own, and
   * MUST NOT be overwritten by an upgrade.*
   */
  it('leaves an operator\'s own entry alone when the built-ins are seeded again', async () => {
    const slug = LIBRARY_KINDS[0]!.slug
    const name = 'an-entry-the-operator-wrote'

    await service.create(slug, {
      name,
      label: 'An entry the operator wrote',
      description: 'Copied from a built-in and then changed.',
      payload: TAMPERED,
    })

    const [mineBefore] = await seed!
      .select()
      .from(library)
      .where(and(eq(library.kind, slug), eq(library.name, name)))
    const shippedBefore = await shippedIn(slug)

    await service.seedBuiltIns()

    const shippedAfter = await shippedIn(slug)
    expect(
      shippedAfter!.updatedAt.getTime(),
      'no built-in was restamped, so the reseed did not reach this table and the entry ' +
        'below survived nothing',
    ).toBeGreaterThan(shippedBefore!.updatedAt.getTime())

    const [mineAfter] = await seed!
      .select()
      .from(library)
      .where(and(eq(library.kind, slug), eq(library.name, name)))

    expect(mineAfter, 'the operator\'s entry was removed by an upgrade').toBeDefined()
    expect(
      mineAfter!.payload,
      'the upgrade rewrote what the operator wrote, which is what copying a built-in is ' +
        'meant to protect them from',
    ).toEqual(mineBefore!.payload)
    expect(mineAfter!.builtin, 'the operator\'s entry became a built-in').toBe(false)
  })

  it.each(LIBRARY_KINDS.map((kind) => [kind.slug] as const))(
    '%s refuses to remove a built-in, and it is still there',
    async (slug) => {
      const before = await shippedIn(slug)

      const removed = await service.remove(slug, before!.name)
      expect(removed, `${slug}: the delete reported that it removed a built-in`).toBe(false)

      expect(
        await shippedIn(slug),
        `${slug}: the built-in is gone, so an upgrade is the only thing that would bring ` +
          'it back',
      ).toBeDefined()
    },
  )
})
