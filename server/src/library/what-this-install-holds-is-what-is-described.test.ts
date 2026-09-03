/**
 * The library an install describes is the one it is carrying, not the one that
 * shipped in the release.
 *
 * *The answer MUST be for the install being asked, not for the version that
 * shipped. Where an install carries vocabularies, layouts or content somebody
 * dropped into it, those are part of what it holds and MUST appear.*
 *
 * > #### Scenario: An install has been extended
 * > - GIVEN an install carrying content its operator added
 * > - WHEN the description is retrieved
 * > - THEN what that install holds is described
 * > - AND not what the version that shipped held
 *
 * **The second clause is what makes this more than a read-after-write.** A
 * description assembled from the shipped source could not name an entry that
 * exists in no shipped file, so the added name is asserted absent from
 * `builtins/` before it is asserted present in the answer. Without that, a
 * listing hard-coded from the release would satisfy the first clause for every
 * entry an operator had not yet added and fail nothing.
 *
 * **And the shipped entries stay**, because a description that answered only
 * what the operator added would satisfy both clauses above and describe an
 * install that does not exist.
 *
 * **Quantified over the kinds that can be authored**, which is the registry's
 * own test for one -- a kind with no payload schema has nothing to validate a
 * write against and no New button to press.
 *
 * **What this does not cover:** vocabularies. No install can carry one -- every
 * list `/api/specs` serves is a module constant -- so that clause of the
 * requirement has no subject here, and this scenario asks about content.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

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

/** The kinds an operator can add to: the rest have nothing to validate a write against. */
const AUTHORABLE = LIBRARY_KINDS.filter((kind) => kind.payload !== null)

/** A name no release contains, and the cases below assert that rather than assume it. */
const ADDED = 'dropped-in-by-the-operator'

const SHIPPED = dirname(fileURLToPath(import.meta.url)) + '/builtins'
const shippedSource = readdirSync(SHIPPED)
  .filter((name) => name.endsWith('.ts') && !name.includes('.test.'))
  .map((name) => readFileSync(join(SHIPPED, name), 'utf8'))
  .join('\n')

describe.skipIf(!db)('an install carrying content its operator added', () => {
  let service: LibraryService

  beforeAll(async () => {
    await seed!.delete(library)
    service = new LibraryService(db!, seed)
    await service.seedBuiltIns()
  }, 90_000)

  afterAll(async () => {
    await seed!.delete(library).where(eq(library.name, ADDED))
    await pool!.end()
  })

  it('reads the shipped source at all', () => {
    expect(shippedSource.length, 'no shipped library source was read').toBeGreaterThan(0)
  })

  it('offers a kind that can be authored, so the cases below have a subject', () => {
    expect(AUTHORABLE.length, 'no library kind takes an operator entry').toBeGreaterThan(0)
  })

  it.each(AUTHORABLE.map((kind) => [kind.slug] as const))(
    '%s describes what the operator added, and still what shipped',
    async (slug) => {
      const before = await service.list(slug)
      const shipped = before.filter((row) => row.origin === 'built-in').map((row) => row.name)

      expect(
        shipped.length,
        `${slug} seeded nothing, so nothing can be lost by the write`,
      ).toBeGreaterThan(0)
      expect(
        shippedSource,
        `the shipped source does not name ${String(shipped[0])}, which this install seeded from ` +
          'it, so reading that source says nothing about what a release contains',
      ).toContain(shipped[0])
      expect(
        shippedSource,
        `${ADDED} is in the shipped source, so finding it in the answer would not say the ` +
          'answer came from this install',
      ).not.toContain(ADDED)

      await service.create(slug, {
        name: ADDED,
        label: 'Dropped in by the operator',
        payload: {},
      })

      const after = await service.list(slug)
      const added = after.find((row) => row.name === ADDED)

      expect(
        added,
        `${slug} was retrieved after an entry was added to it and does not mention the entry, ` +
          'so the answer describes the release rather than this install',
      ).toBeDefined()
      expect(
        added?.origin,
        'the added entry is described as having shipped, so an operator cannot tell which ' +
          'entries are theirs to change',
      ).toBe('yours')
      expect(
        after.filter((row) => row.origin === 'built-in').map((row) => row.name),
        'the shipped entries left the answer when one was added, so the description is of ' +
          'neither the release nor this install',
      ).toEqual(shipped)

      await service.remove(slug, ADDED)
    },
  )
})
