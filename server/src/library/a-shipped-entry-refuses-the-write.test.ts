/**
 * A built-in refuses a write, and the row is the same afterwards.
 *
 * *An entry the application ships MUST NOT be editable.* Three things say so
 * today and none of them was asserted: the `where` clause excludes a built-in,
 * the edit route throws before the write, and the delete route throws before
 * its own. `what-shipped-and-what-was-added.test.ts` asserts that the listing
 * *labels* a built-in correctly and says in its own message that this is what
 * "the store will refuse" -- assuming the refusal rather than checking it.
 *
 * **The row is read back, not just the answer.** `update` and `remove` report
 * whether anything moved, so a guard that ran after the write would return
 * `false` and still have changed the row. Asserting the boolean alone passes on
 * exactly the implementation this requirement exists to forbid.
 *
 * **Enumerated over `LIBRARY_KINDS`.** The rule is a property of the row, so a
 * kind added later is swept without this file being edited -- and a kind whose
 * writes went through a second path would be caught here rather than by
 * somebody remembering.
 *
 * The route's own refusals are a different door and are not driven here; this
 * is the guard they both sit in front of.
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
