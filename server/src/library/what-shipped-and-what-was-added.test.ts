/**
 * **Every entry the library lists says whether it shipped or was added**, and
 * the answer is the stored flag rather than a guess.
 */
import { eq } from 'drizzle-orm'
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

describe.skipIf(!db)('what shipped and what was added', () => {
  let service: LibraryService

  beforeAll(async () => {
    await seed!.delete(library)
    service = new LibraryService(db!, seed)
    await service.seedBuiltIns()
  }, 90_000)

  afterAll(async () => {
    await pool!.end()
  })

  /**
   * **The stored flag, read separately.**
   */
  async function storedBuiltins(slug: string): Promise<Map<string, boolean>> {
    const rows = await seed!
      .select({ name: library.name, builtin: library.builtin })
      .from(library)
      .where(eq(library.kind, slug))
    return new Map(rows.map((row) => [row.name, row.builtin]))
  }

  it.each(LIBRARY_KINDS.map((kind) => [kind.slug] as const))(
    '%s says of every entry whether it shipped',
    async (slug) => {
      const listed = await service.list(slug)
      const stored = await storedBuiltins(slug)

      expect(listed.length, `${slug} lists nothing, so this asserts nothing`).toBeGreaterThan(0)

      const wrong = listed
        .filter((row) => row.origin !== (stored.get(row.name) === true ? 'built-in' : 'yours'))
        .map((row) => `${row.name}: listed as ${row.origin}`)

      expect(
        wrong,
        `${slug} tells an analyst the wrong thing about where these came from -- a ` +
          'built-in is duplicated rather than edited, so getting this backwards offers ' +
          'an edit the store will refuse',
      ).toEqual([])
    },
  )

  /**
   * **Both answers have to be reachable, or the field is decoration.**
   */
  it('says `yours` of an entry the operator added, not just `built-in` of the rest', async () => {
    const slug = LIBRARY_KINDS[0]!.slug
    const before = await service.list(slug)
    expect(
      before.every((row) => row.origin === 'built-in'),
      'the seeded install already holds an added entry, so this case is not the control ' +
        'it is written to be',
    ).toBe(true)

    await seed!.insert(library).values({
      kind: slug,
      name: `added-by-the-operator-${String(Date.now())}`,
      label: 'Added by the operator',
      payload: {},
    })

    const after = await service.list(slug)
    const added = after.filter((row) => row.origin === 'yours')

    expect(added, 'an entry nobody shipped is still reported as having shipped').toHaveLength(1)
    expect(after.length, 'the added entry did not reach the listing at all').toBe(before.length + 1)
  })
})
