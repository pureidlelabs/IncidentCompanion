/**
 * The predicate that keeps only the cases an analyst reaches.
 *
 * **For the reads no guard stands in front of.** `CaseAccessGuard` decides one
 * case from the id in the path, and a list names none - so the lists ask this,
 * and the two cannot disagree about who reaches what.
 */
import { inArray, isNull, or, sql, type SQL } from 'drizzle-orm'
import type { PgColumn } from 'drizzle-orm/pg-core'

import type { Executor } from '../db/scope.js'
import { customersReachedBy } from './reach.service.js'

/**
 * A `where` clause over a case's `customerId` column.
 *
 * A null column is the default customer's, which every analyst reaches by the
 * floor rather than by a membership. -> `CaseAccessGuard.canActivate`
 */
export async function reachedCases(
  on: Executor,
  userId: string,
  customerId: PgColumn,
): Promise<SQL> {
  const reached = await customersReachedBy(on, userId)
  const clauses = [...(reached.length ? [inArray(customerId, reached)] : []), isNull(customerId)]
  return or(...clauses) ?? sql`false`
}
