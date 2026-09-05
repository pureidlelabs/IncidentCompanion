/**
 * A document with one invalid entry is refused, and nothing in it is written.
 */
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { LIBRARY_KINDS } from './kinds.js'
import { LibraryController } from './library.controller.js'
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

/** Nothing is recorded here; the write is what is on trial. */
const noActivity = { libraryKindReplaced: () => Promise.resolve(undefined) } as never
const asAdmin = { user: { id: 'library-operator' } } as never
const noHeaders = { headers: {} }

/**
 * A payload no kind can accept, whatever its fields are.
 */
const NONSENSE = 'not a payload at all'

/** The kinds that take a document at all -- one without a payload schema refuses every write. */
const WRITABLE = LIBRARY_KINDS.filter((kind) => kind.payload !== null)

describe.skipIf(!db)('a library document with one bad entry', () => {
  let service: LibraryService
  let controller: LibraryController

  beforeAll(async () => {
    await seed!.delete(library)
    service = new LibraryService(db!, seed)
    await service.seedBuiltIns()
    controller = new LibraryController(service, noActivity)
  }, 90_000)

  afterAll(async () => {
    await pool!.end()
  })

  /** Every row of the kind, as the store holds it. */
  const stored = (slug: string) =>
    seed!.select().from(library).where(eq(library.kind, slug))

  it('has a writable kind to try, so the cases below are not vacuous', () => {
    expect(WRITABLE.length, 'no library kind accepts a document').toBeGreaterThan(0)
  })

  it.each(WRITABLE.map((kind) => [kind.slug] as const))(
    '%s refuses the document and leaves every row as it was',
    async (slug) => {
      const before = await stored(slug)
      expect(before.length, `${slug} holds nothing, so nothing could be half-replaced`).toBeGreaterThan(0)

      const exported = await service.exportKind(slug)
      const document_ = {
        ...exported,
        entries: [
          ...exported.entries,
          { name: 'a-bad-entry', label: 'A bad entry', description: '', payload: NONSENSE },
        ],
      }

      await expect(
        controller.apply(slug, document_ as never, asAdmin, noHeaders),
        `${slug}: a document carrying an invalid entry was accepted`,
      ).rejects.toThrow(/a-bad-entry/)

      expect(
        await stored(slug),
        `${slug}: the library moved, so entries were written before the bad one was ` +
          'reached and the refusal left it half-replaced',
      ).toEqual(before)
    },
  )
})
