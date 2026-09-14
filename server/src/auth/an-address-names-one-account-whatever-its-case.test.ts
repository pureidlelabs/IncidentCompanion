/**
 * **An address names one account, whatever case it is spelled in.**
 *
 * Every query addressing a user row folds case, through `sameAddress`. The
 * column it folds does not, so two rows whose addresses differ only in case
 * are both matched by each of those queries: `LockoutClearService.clear`
 * updates by that predicate with no limit, so clearing one account's lockout
 * clears the other's, and `hold` takes `.limit(1)` with no ordering, so it
 * holds whichever row the database returns.
 *
 * **Written directly, because no route writes such a row.** Better Auth folds
 * the address on the paths this install creates accounts through, which
 * `test/casefolded-account-writes.test.ts` holds them to. `sameAddress` folds
 * on the column for the row written any other way, and this is what keeps that
 * row from being a second account rather than merely an unaddressed one.
 * -> #632
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
import { LockoutClearService } from './lockout-clear.service.js'
import { sameAddress } from './same-address.js'

const seedUrl = process.env['SEED_DATABASE_URL'] ?? process.env['DATABASE_URL'] ?? ''
const pool = seedUrl ? openTestPool(seedUrl, 'ic_seed') : null
const db = pool ? drizzle({ client: pool }) : null

const LOWER = 'case.folded@example.invalid'
const UPPER = 'Case.Folded@Example.Invalid'
/** A different account entirely, to catch a write that reaches too far. */
const OTHER = 'somebody.else@example.invalid'

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
    await db!.delete(user).where(sameAddress(OTHER))
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
   * **The write itself, not a count of what it would match.** A lockout is a
   * brute-force control, the clear updates by the folded predicate with no
   * limit, and clearing one an administrator did not name is silent.
   */
  it('is cleared for the account named and for no other', async () => {
    const LOCKED = { failedSignIns: 9, lockedUntil: new Date(Date.now() + 3_600_000) }
    await db!.delete(user).where(sameAddress(OTHER))
    await db!.insert(user).values([
      { ...rowFor('case-folded-lower', LOWER), ...LOCKED },
      { ...rowFor('case-folded-other', OTHER), ...LOCKED },
    ])

    await new LockoutClearService(db!).clear(UPPER)

    const [named] = await db!
      .select({ failed: user.failedSignIns })
      .from(user)
      .where(sameAddress(LOWER))
    const [untouched] = await db!
      .select({ failed: user.failedSignIns, until: user.lockedUntil })
      .from(user)
      .where(sameAddress(OTHER))

    expect(named?.failed, 'the account named by the address was not cleared').toBe(0)
    expect(
      untouched?.failed,
      'an account nobody named had its lockout cleared, which is the control removed',
    ).toBe(9)
    expect(untouched?.until).not.toBeNull()

    await db!.delete(user).where(sameAddress(OTHER))
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
