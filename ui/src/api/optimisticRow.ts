/**
 * The row a create hook shows before the server answers.
 */

import type { QueryClient } from '@tanstack/react-query'

import type { CollectionName } from './model'
import { keys } from './queryKeys'
import type { Specs } from './specs'

const OPTIMISTIC_PREFIX = 'optimistic:'

/** Whether this row is a placeholder the server has not acknowledged yet. */
export function isOptimisticId(id: string): boolean {
  return id.startsWith(OPTIMISTIC_PREFIX)
}

/**
 * A placeholder id, unique within the session.
 */
let issued = 0
export function newOptimisticId(): string {
  issued += 1
  return `${OPTIMISTIC_PREFIX}${String(Date.now())}-${String(issued)}`
}

/**
 * Every field of `collection`'s rows, at the value the server gives an untouched
 * one.
 *
 * Returns `{}` when the specs document has not loaded, which leaves the caller
 * exactly where it was before this existed. In practice a create cannot happen
 * first: every Add dialog is *rendered from* this document.
 */
export function blankRowFor(
  specs: Specs | undefined,
  collection: CollectionName,
): Record<string, unknown> {
  if (!specs) return {}
  const out: Record<string, unknown> = {}
  for (const form of Object.values(specs.forms)) {
    if (form.collection === collection) Object.assign(out, form.blank)
  }
  return out
}

/**
 * The complete optimistic row for one create.
 */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export function optimisticRow<T>(
  client: QueryClient,
  collection: CollectionName,
  fields: object,
  extra: object = {},
): T {
  const specs = client.getQueryData<Specs>(keys.specs())
  return {
    ...blankRowFor(specs, collection),
    ...fields,
    ...extra,
    id: newOptimisticId(),
  } as T
}
