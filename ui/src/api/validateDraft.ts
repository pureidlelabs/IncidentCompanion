import { COLLECTION_SCHEMAS } from '@contract/collections'

import type { CollectionName } from './model'

/**
 * What the server would refuse, answered before the draft is sent.
 *
 * Imports `COLLECTION_SCHEMAS` rather than mirroring it, so a length, a
 * format or a cross-field rule cannot drift between the screen and the
 * route that enforces it.
 *
 * A courtesy, never a boundary: the server parses every body regardless of
 * what ran here.
 */

/** A problem per field name. Empty when the draft would be accepted. */
export type Problems = Readonly<Record<string, string>>

/** One collection's write schema - what `problemsAgainst` parses a draft with. */
export type EntitySchema = (typeof COLLECTION_SCHEMAS)[string]

const NONE: Problems = {}

/**
 * The fields this draft would be refused on.
 *
 * `existing` distinguishes the two shapes a write takes, and they parse
 * differently:
 *
 * - **A create** sends only what was filled in, and the schema supplies the
 *   rest from its own defaults - so the blanks are dropped first and zod is
 *   left to fill them, exactly as the route sees it. Keeping them would refuse
 *   `''` for every optional field the analyst did not reach.
 * - **An edit** opens holding the whole row, so the draft already *is* the
 *   merged row and is parsed as one. Parsing only the changed fields would
 *   refuse every required field the analyst did not touch.
 *
 * A collection with no schema - or a form that owns no collection - answers
 * empty rather than throwing: `case_facts` and the compliance forms are drawn
 * by their own screens and reach no entry in this record.
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
 *
 * For a collection like `timeline` that publishes no single schema in
 * `COLLECTION_SCHEMAS`: it is a discriminated union, whose patchable fields
 * depend on whether the row is an event or an activity, so `problemsIn`
 * cannot resolve a schema by name alone. The caller picks the variant off
 * the kind it is editing -- the discriminator is the dialog's own state.
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
 *
 * The write schemas are `.strict()` and an edit draft is the whole row: a
 * timeline row carries `id`, `provenance`, `unreviewed` and `timeAssumed`,
 * none of which `eventWriteSchema` declares, so parsing it whole refused
 * fields with no control on screen.
 *
 * Dropping rather than reporting is right only for a form: an analyst
 * cannot type an undeclared key, so it is always the dialog carrying more
 * of the row than it sends. A body over the wire is a different question,
 * and the route still enforces `.strict()`.
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
 *
 * Exported so the dialog, which drops blanks before it posts, and this,
 * which drops them before it parses, share one definition of "blank".
 *
 * `false` survives: the column is `bool` rather than nullable, so an
 * unticked checkbox is an answer.
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
 *
 * `import type { z } from 'zod'` is refused by `no-restricted-imports`:
 * derived off the schemas this module already imports, the union narrows
 * through the `switch` below instead, so `minimum` and `format` are read as
 * fields of the variant that has them.
 */
type Issue = NonNullable<
  ReturnType<(typeof COLLECTION_SCHEMAS)[string]['safeParse']>['error']
>['issues'][number]

/**
 * A zod issue as a sentence an analyst should read.
 *
 * Zod's own messages are for whoever wrote the schema -- "Invalid UUID",
 * "Too big: expected string to have <=2048 characters" -- not for someone
 * working a control on a screen; `tests/docs/test_ui_copy.py` lints this
 * surface for that reason.
 *
 * A `custom` issue passes through untouched: it is the one message an
 * author wrote deliberately, at the field, for a person.
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
