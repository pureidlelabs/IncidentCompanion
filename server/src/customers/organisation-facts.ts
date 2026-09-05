/**
 * Which facts belong to the organisation rather than to the incident, and the
 * two operations a case performs on them: taking a copy, and noticing that the
 * copy has gone stale.
 */
import { getTableColumns } from 'drizzle-orm'

import { caseCompliance } from '../db/schema/case-compliance.js'
import { customers } from '../db/schema/customer.js'
import { rowVersioning } from '../db/schema/columns.js'

/** Neither table's subject: the row's own identity and its write record. */
const BOOKKEEPING = new Set(['id', ...Object.keys(rowVersioning)])

/**
 * The organisation's facts, as property names both tables use.
 */
export const ORGANISATION_FACTS: readonly string[] = Object.keys(
  getTableColumns(customers),
).filter((name) => !BOOKKEEPING.has(name) && name in getTableColumns(caseCompliance))

/**
 * The facts two customer records can disagree about when they are merged.
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
 */
export function factsThatMoved(
  onTheCase: Record<string, unknown>,
  customer: Record<string, unknown>,
): string[] {
  return ORGANISATION_FACTS.filter((name) => !sameAnswer(onTheCase[name], customer[name]))
}

/**
 * Whether two copies of one fact are the same answer.
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
