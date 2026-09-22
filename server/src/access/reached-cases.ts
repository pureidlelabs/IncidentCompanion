/** The predicate that keeps only the cases an analyst reaches, for a list no guard fronts. */
import { inArray, isNull, or, sql, type SQL } from 'drizzle-orm'
import type { PgColumn } from 'drizzle-orm/pg-core'

import type { Executor } from '../db/scope.js'
import { customersReachedBy } from './reach.service.js'

/**
 * A `where` clause over a case's `customerId` column. A null column is the
 * default customer's, which every analyst reaches. -> `CaseAccessGuard.canActivate`
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
