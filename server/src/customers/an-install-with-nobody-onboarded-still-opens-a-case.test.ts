/**
 * An install that has onboarded nobody still has a customer to open a case
 * against, and it is the default.
 *
 * *The install always holds a default customer, standing for an incident whose
 * origin is not yet known.*
 *
 * > #### Scenario: An install has no customers
 * > - GIVEN a newly installed system with no customers onboarded
 * > - WHEN an analyst opens a case
 * > - THEN it is created against the default customer
 * > - AND the install is usable before anybody is onboarded
 *
 * **The empty install is built inside a transaction that always throws.** The
 * service is constructed on the transaction handle, so what it reads and
 * writes is the empty install, and nothing the case does survives it -- which
 * is what lets the case empty the store without deciding what the store held
 * when it ran.
 *
 * **The emptiness is asserted rather than assumed.** `ensureDefault` returning
 * a row that was already there is the same answer for the wrong reason, and it
 * is the whole scenario.
 *
 * **Idempotence is the second half.** `ensureDefault` runs on every boot, so an
 * install that made a second default on its second start would end up with two
 * rows standing for one thing and no way to say which a case belongs to.
 *
 * **What this does not cover:** that a case opened with no customer is
 * *reachable* as the default -- an unattributed case leaves `customerId` null
 * rather than pointing at the default row, and
 * `server/test/a-case-with-no-customer-is-everybodys.test.ts` is where that
 * reach is asserted.
 */
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, describe, expect, it } from 'vitest'

import { CustomersService, DEFAULT_CUSTOMER_NAME } from './customers.service.js'
import { cases } from '../db/schema/case.js'
import { customers } from '../db/schema/customer.js'
import { openTestPool } from '../../test/database.js'

const URL_ = process.env.SEED_DATABASE_URL ?? process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_seed') : null
const db = pool ? drizzle({ client: pool }) : null

class Undo extends Error {}

/** Runs the body against an install holding no customers, then undoes it. */
const onAnEmptyInstall = async <T>(body: (tx: never) => Promise<T>): Promise<T> => {
  let answer: T | undefined
  try {
    await db!.transaction(async (tx) => {
      await tx.delete(cases)
      await tx.delete(customers)
      answer = await body(tx as never)
      throw new Undo()
    })
  } catch (error) {
    if (!(error instanceof Undo)) throw error
  }
  return answer as T
}

describe.skipIf(!db)('an install nobody has been onboarded to', () => {
  afterAll(async () => {
    await pool!.end()
  })

  it('has a default customer made for it, and one only', async () => {
    const seen = await onAnEmptyInstall(async (tx) => {
      const held = await (tx as unknown as typeof db)!.select().from(customers)
      const service = new CustomersService(tx)

      const first = await service.ensureDefault()
      const second = await service.ensureDefault()
      const after = await (tx as unknown as typeof db)!
        .select({ id: customers.id, name: customers.name })
        .from(customers)
        .where(eq(customers.isDefault, true))

      return { emptied: held.length, first, second, after }
    })

    expect(
      seen.emptied,
      'the install still held a customer, so what came back may have been there all along',
    ).toBe(0)
    expect(seen.first.name, 'the customer made for an empty install is not the default one').toBe(
      DEFAULT_CUSTOMER_NAME,
    )
    expect(
      seen.second.id,
      'a second start made a second default, so two rows stand for one thing',
    ).toBe(seen.first.id)
    expect(seen.after.length, 'the install holds more than one default customer').toBe(1)
  })

  it('takes a case before anybody is onboarded', async () => {
    const opened = await onAnEmptyInstall(async (tx) => {
      await new CustomersService(tx).ensureDefault()
      const [made] = await (tx as unknown as typeof db)!
        .insert(cases)
        .values({ title: 'A case opened before anybody was onboarded' })
        .returning({ id: cases.id, customerId: cases.customerId })
      return made
    })

    expect(
      opened?.id,
      'a case could not be opened on an install with nobody onboarded, so the install is ' +
        'unusable until somebody is',
    ).toBeTruthy()
  })
})
