/**
 * Which facts belong to the organisation rather than to the incident, and the
 * two operations a case performs on them: taking a copy, and noticing that the
 * copy has gone stale.
 *
 * **The list is the intersection of the two tables, never written down.** A
 * fact is the organisation's if `customers` holds it and a case carries a
 * place to copy it into; anything else on either table is that table's own.
 * Written out, the list would be a third description of something two schemas
 * already agree on, and it would drift the first time a column moved.
 */
import { getTableColumns } from 'drizzle-orm'

import { caseCompliance } from '../db/schema/case-compliance.js'
import { customers } from '../db/schema/customer.js'
import { rowVersioning } from '../db/schema/columns.js'

/** Neither table's subject: the row's own identity and its write record. */
const BOOKKEEPING = new Set(['id', ...Object.keys(rowVersioning)])

/**
 * The organisation's facts, as property names both tables use.
 *
 * `regimes` is deliberately not among them, and not by omission: it lives on
 * the customer alone, because it decides which questions a case is asked
 * rather than answering one. Copying it would freeze a case's questionnaire at
 * the moment somebody first opened its compliance screen.
 */
export const ORGANISATION_FACTS: readonly string[] = Object.keys(
  getTableColumns(customers),
).filter((name) => !BOOKKEEPING.has(name) && name in getTableColumns(caseCompliance))

/** The customer's values for those facts, ready to write onto a case. */
export function factsOf(customer: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(ORGANISATION_FACTS.map((name) => [name, customer[name]]))
}

/**
 * The facts whose copy on the case no longer matches the customer.
 *
 * **Derived on read rather than stored.** A stored flag would need writing
 * every time either side moved, and would be wrong in exactly the window that
 * matters. Nothing here writes: the specification requires that a case does
 * not change on its own, and that the analyst decides.
 */
export function factsThatMoved(
  onTheCase: Record<string, unknown>,
  customer: Record<string, unknown>,
): string[] {
  return ORGANISATION_FACTS.filter((name) => !same(onTheCase[name], customer[name]))
}

/**
 * Whether two copies of one fact are the same answer.
 *
 * **`null` and `''` are the same answer here**, and that is not tidying: the
 * two tables default differently - a text column is `NOT NULL DEFAULT ''` and
 * a nullable one is `null` - so a customer that has never been asked and a
 * case that has never been asked would otherwise read as a disagreement, and
 * every case would open showing drift on the day it was created.
 */
function same(one: unknown, other: unknown): boolean {
  if (Array.isArray(one) || Array.isArray(other)) {
    const left = Array.isArray(one) ? one : []
    const right = Array.isArray(other) ? other : []
    return left.length === right.length && left.every((value, at) => value === right[at])
  }
  const blank = (value: unknown) => value === null || value === undefined || value === ''
  if (blank(one) && blank(other)) return true
  return one === other
}
