/**
 * The row a create hook shows before the server answers.
 *
 * **The row is completed here, so no reader has to defend.** A create dialog
 * posts only what the analyst filled in (`filledFields` drops every blank), so
 * a cache row spread from the submitted fields alone is *missing* whatever was
 * left empty, and one `entry.someField.trim()` takes the whole section to zero
 * rows. Do not add a guard at a reader instead.
 *
 * **The blank comes from the server, off the same Zod schema the write path
 * validates with.** Nothing here enumerates a field: a column added to an
 * entity appears in the blank without this file changing, which is the only
 * version of this that cannot drift. -> `server/src/specs/specs.controller.ts`
 *
 * **Only the cache row is completed; the request body is untouched.** An
 * *absent* field is a real instruction to the server: an omitted `time` is
 * what makes capture place the entry at now and mark it `timeAssumed`, so
 * posting the blanks would stamp every timeless entry at the moment Save was
 * pressed and take it out of the gap queue.
 * -> `server/src/domain/entities/timeline.ts`
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
 *
 * **A counter beside the clock, because `Date.now()` alone is not unique.** Two
 * rows added inside one millisecond - a paste, a double-press - collided, and a
 * duplicate React key renders as one row silently rather than as an error.
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
 * **Merged across forms, because a collection may have more than one.** The
 * Timeline is written through two schemas - an event and an action - and a
 * create hook is told the collection, not which dialog was open. The union is
 * what makes the row complete whichever one it was.
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
 *
 * `fields` wins over the blank, and `id` over both - the caller's values are
 * the ones the analyst chose.
 *
 * `T` appears once by design, exactly as `fromWire`'s does: it is the caller's
 * assertion about a row this function assembles from the served blank and the
 * fields given, and there is no argument to infer it from.
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
