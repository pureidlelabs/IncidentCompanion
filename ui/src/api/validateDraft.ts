import { COLLECTION_SCHEMAS } from '@contract/collections'

import type { CollectionName } from './model'

/**
 * What the server would refuse, answered before the draft is sent.
 */

/** A problem per field name. Empty when the draft would be accepted. */
export type Problems = Readonly<Record<string, string>>

/** One collection's write schema - what `problemsAgainst` parses a draft with. */
export type EntitySchema = (typeof COLLECTION_SCHEMAS)[string]

const NONE: Problems = {}

/**
 * The fields this draft would be refused on.
 */
export function problemsIn(
  collection: CollectionName | null | undefined,
  draft: Record<string, unknown>,
  existing: boolean,
): Problems {
  const schema = collection ? COLLECTION_SCHEMAS[collection] : undefined
  if (!schema) {
    /**
     * Loud in development, silent in production, never a fallback: a
     * `required`-flags-only schema here would validate less while looking
     * like it validates, and the server refuses the write either way.
     */
    if (collection !== null && collection !== undefined && import.meta.env.DEV) {
      console.error(
        `[validateDraft] "${collection}" publishes no schema, so nothing is ` +
          `checked before the write. The route still refuses a bad body.`,
      )
    }
    return NONE
  }

  return problemsAgainst(schema, draft, existing)
}

/**
 * The same check against a schema handed in rather than looked up by name.
 */
export function problemsAgainst(
  schema: (typeof COLLECTION_SCHEMAS)[string],
  draft: Record<string, unknown>,
  existing: boolean,
): Problems {
  const subject = onlyDeclared(schema, existing ? draft : withoutBlanks(draft))
  const result = schema.safeParse(subject)
  if (result.success) return NONE

  const problems: Record<string, string> = {}
  for (const issue of result.error.issues) {
    // **The first issue per field wins.** Two messages in one slot read as one
    // run-on sentence, and the second is usually a consequence of the first.
    const name = issue.path[0]
    if (typeof name === 'string' && !(name in problems)) problems[name] = wording(issue)
  }
  return problems
}


/**
 * The draft minus every key the schema does not declare.
 */
function onlyDeclared(
  schema: (typeof COLLECTION_SCHEMAS)[string],
  draft: Record<string, unknown>,
): Record<string, unknown> {
  const declared = new Set(Object.keys(schema.shape))
  return Object.fromEntries(Object.entries(draft).filter(([name]) => declared.has(name)))
}

/**
 * Whether a field was left empty.
 */
export function isEmpty(value: unknown): boolean {
  if (Array.isArray(value)) return value.length === 0
  return value === undefined || value === null || value === ''
}

/** The draft minus everything left empty, so the schema's defaults apply. */
function withoutBlanks(draft: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(draft).filter(([, value]) => !isEmpty(value)))
}

/**
 * Zod's own issue union, derived rather than imported.
 */
type Issue = NonNullable<
  ReturnType<(typeof COLLECTION_SCHEMAS)[string]['safeParse']>['error']
>['issues'][number]

/**
 * A zod issue as a sentence an analyst should read.
 */
function wording(issue: Issue): string {
  switch (issue.code) {
    case 'custom':
      return issue.message

    // An absent key and an empty string are the same answer to the analyst:
    // they have not filled it in.
    case 'invalid_type':
      return 'Required.'

    case 'too_small':
      return Number(issue.minimum) <= 1
        ? 'Required.'
        : `At least ${String(issue.minimum)} characters.`

    case 'too_big':
      return `At most ${String(issue.maximum)} characters.`

    // A reference is chosen from a list, so the only way to hold a malformed
    // one is a stale option or a paste. Naming the control beats naming UUID.
    case 'invalid_format':
      return issue.format === 'uuid' ? 'Choose one from the list.' : 'Not in the expected format.'

    case 'invalid_value':
      // **`Select`, not `Choose`.** `Interface.InterfaceWords` scopes `choose`
      // to the creating sense - *Choose a password* - and this is a picking
      // one. `tests/docs/test_ui_copy.py` lints this surface.
      return 'Select one of the options.'

    /** A code with no wording here reads as a flat refusal -- still better
     *  than zod's own sentence, but a new one showing up in
     *  `validateDraft.test.ts` is the signal to add one. */
    default:
      return 'Not accepted.'
  }
}
