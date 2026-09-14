/**
 * **An address names one account, whatever case it is spelled in.**
 *
 * Every query addressing a user row folds case, through `sameAddress`. The
 * column it folds does not, so nothing stopped two rows existing whose
 * addresses differ only in case -- and then each of those folded queries
 * matched both. `LockoutClearService.clear` updates by that predicate with no
 * limit, so clearing one account's lockout cleared the other's; `hold` takes
 * `.limit(1)` with no ordering, so it held whichever row the database happened
 * to return. -> #632
 *
 * **Asserted against a real Postgres**, because this is a claim about what the
 * database refuses. A recording double answers whatever it was told to, and
 * uniqueness is exactly the question it cannot be told about.
 *
 * Skips rather than fails with no database: a green run proving nothing is
 * worse than an obvious skip.
 */
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { openTestPool } from '../../test/database.js'
import { user } from '../db/schema/auth.js'
import { sameAddress } from './same-address.js'

const seedUrl = process.env['SEED_DATABASE_URL'] ?? process.env['DATABASE_URL'] ?? ''
const pool = seedUrl ? openTestPool(seedUrl, 'ic_seed') : null
const db = pool ? drizzle({ client: pool }) : null

const LOWER = 'case.folded@example.invalid'
const UPPER = 'Case.Folded@Example.Invalid'

/** A row in whatever spelling the caller gives, with everything else fixed. */
const rowFor = (id: string, email: string) => ({
  id,
  name: 'Case Folded',
  email,
  emailVerified: false,
  createdAt: new Date(),
  updatedAt: new Date(),
})

describe.skipIf(!db)('an address', () => {
  beforeEach(async () => {
    await db!.delete(user).where(sameAddress(LOWER))
  })

  afterAll(async () => {
    await db!.delete(user).where(sameAddress(LOWER))
    await pool?.end()
  })

  /**
   * **The refusal has to come from the database, not from a reader.** Every
   * check-then-write above this loses to two administrators pressing Create at
   * the same moment, which is why the account controller already treats the
   * constraint's complaint as its answer rather than checking harder.
   */
  it('cannot be held twice in two spellings', async () => {
    await db!.insert(user).values(rowFor('case-folded-lower', LOWER))

    await expect(
      db!.insert(user).values(rowFor('case-folded-upper', UPPER)),
      'the install took a second account differing only in case, so every query that folds ' +
        'case now matches two rows where it means one',
    ).rejects.toThrow()
  })

  /**
   * **What the duplicate costs, stated as the write it corrupts.** The lockout
   * clear is the sharpest of them: it is a brute-force control, it updates by
   * the folded predicate with no limit, and clearing the wrong account's is
   * silent.
   */
  it('is matched by exactly one row, so a folded write reaches one account', async () => {
    await db!.insert(user).values(rowFor('case-folded-lower', LOWER))
    // Offered in the other spelling and refused, which is the point. Swallowed
    // rather than asserted: the refusal is the case above, and what this one
    // measures is what the predicate matches afterwards.
    await db!.insert(user).values(rowFor('case-folded-upper', UPPER)).catch(() => undefined)

    const matched = await db!.select({ id: user.id }).from(user).where(sameAddress(UPPER))

    expect(
      matched.length,
      'a write addressed to one account reached a different number of rows than one',
    ).toBe(1)
    expect(matched[0]?.id).toBe('case-folded-lower')
  })
})
