/**
 * Clearing customers between cases, without taking the install's own.
 *
 * **The suite shares one database across every file**, so a teardown emptying
 * `customers` removes a row the whole install depends on: `cases.service.ts`
 * opens every case under the default, and `defaultCustomer` mints it again on
 * the next call -- which is why the damage stays invisible until something
 * references it. `cases.customerId` does, with `onDelete: 'restrict'`, so the
 * sweep then fails outright wherever a case happens to exist.
 *
 * **Stated once rather than at each call site.** `db/schema/customer.ts` makes
 * the same argument about the one-default rule: a check spelled out at every
 * caller is one forgotten caller away from being false.
 */
import { inArray, ne } from 'drizzle-orm'

import { cases } from '../src/db/schema/case.js'
import { customers } from '../src/db/schema/customer.js'
import type { Database } from '../src/db/client.js'

/**
 * Remove every customer but the one the install came with, and any case still on one.
 *
 * The default is not a test's to delete: the specification requires an install
 * to always hold one and that it not be deletable, and every case in the
 * shared database is opened under it.
 */
export async function clearCustomers(on: Database): Promise<void> {
  // Files run one at a time, so a case still on one of them was left by an earlier file.
  const theirs = on.select({ id: customers.id }).from(customers).where(ne(customers.isDefault, true))
  await on.delete(cases).where(inArray(cases.customerId, theirs))
  await on.delete(customers).where(ne(customers.isDefault, true))
}
