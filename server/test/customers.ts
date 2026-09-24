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
import { eq, ne } from 'drizzle-orm'

import { customers } from '../src/db/schema/customer.js'
import { groupCustomers, groupMembers, groups } from '../src/db/schema/groups.js'
import type { Database } from '../src/db/client.js'

/**
 * Remove every customer but the one the install came with.
 *
 * The default is not a test's to delete: the specification requires an install
 * to always hold one and that it not be deletable, and every case in the
 * shared database is opened under it.
 */
export async function clearCustomers(on: Database): Promise<void> {
  await on.delete(customers).where(ne(customers.isDefault, true))
}

/**
 * Give `who` reach over `customerId`, through a group of their own.
 *
 * **A grant, because the store serves a case only to somebody reaching its
 * customer.** A fixture opening a case under a customer and then acting on it
 * as an analyst has to say that analyst works that customer.
 */
export async function reaches(
  on: Database,
  who: string,
  customerId: string,
  level: 'read' | 'write' | 'delete' = 'write',
): Promise<void> {
  const name = `works for ${who}`
  const [held] = await on.select({ id: groups.id }).from(groups).where(eq(groups.name, name))
  const groupId =
    held?.id ?? (await on.insert(groups).values({ name }).returning({ id: groups.id }))[0]!.id
  await on.insert(groupCustomers).values({ groupId, customerId }).onConflictDoNothing()
  await on
    .insert(groupMembers)
    .values({ groupId, userId: who, level })
    .onConflictDoUpdate({ target: [groupMembers.groupId, groupMembers.userId], set: { level } })
}
