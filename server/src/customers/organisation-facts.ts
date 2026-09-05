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

/**
 * The facts two customer records can disagree about when they are merged.
 *
 * **A different question from what a case copies, and therefore a different
 * set.** `ORGANISATION_FACTS` is the copy set and excludes `regimes` on
 * purpose; a merge disputes every organisation fact the record holds,
 * `regimes` among them. One set serving both purposes is what let a merge
 * settle a regimes disagreement silently while refusing a caller who tried to
 * settle it deliberately.
 *
 * Derived rather than listed, and **disputable by default**: a column added to
 * `customers` is an organisation fact by construction, because that is what
 * the table holds. What is named out of it is not a fact about the
 * organisation at all - the row's identity, its write record, the flag that
 * marks the default, and the name.
 *
 * **The name is excluded because a merge settles a disagreement and does not
 * edit.** If the losing record carried the better name, rename the survivor
 * afterwards - the first requirement guarantees a rename breaks nothing.
 */
const NOT_THE_ORGANISATION_S = new Set(['isDefault', 'name'])

export const MERGE_FACTS: readonly string[] = Object.keys(getTableColumns(customers)).filter(
  (name) => !BOOKKEEPING.has(name) && !NOT_THE_ORGANISATION_S.has(name),
)

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
  return ORGANISATION_FACTS.filter((name) => !sameAnswer(onTheCase[name], customer[name]))
}

/**
 * Whether two copies of one fact are the same answer.
 *
 * **`null` and `''` are the same answer here**, and that is not tidying: the
 * two tables default differently - a text column is `NOT NULL DEFAULT ''` and
 * a nullable one is `null` - so a customer that has never been asked and a
 * case that has never been asked would otherwise read as a disagreement, and
 * every case would open showing drift on the day it was created.
 *
 * **Exported, because three callers ask it.** Drift between a case and its
 * customer, whether a patch changed anything, and whether two records being
 * merged disagree are the same comparison; a second copy of it drifts from
 * this one silently, since nothing compares the two.
 */
export function sameAnswer(one: unknown, other: unknown): boolean {
  if (Array.isArray(one) || Array.isArray(other)) {
    const left = Array.isArray(one) ? one : []
    const right = Array.isArray(other) ? other : []
    return left.length === right.length && left.every((value, at) => value === right[at])
  }
  const blank = (value: unknown) => value === null || value === undefined || value === ''
  if (blank(one) && blank(other)) return true
  return one === other
}
