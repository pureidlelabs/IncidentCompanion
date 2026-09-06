/**
 * Which of three things an activity *is*, and the colour that says so.
 *
 * The SOC's own work splits three ways - telling someone, fixing something,
 * finding something out - and that split is what lets an activity carry a hue
 * without borrowing the severity ramp it has no place on. Nothing server-side
 * makes this split: the rail and the badge are the only readers, on the
 * screens tier and in the running app both.
 *
 * **One copy, and it lives here for that reason.** The gallery had a second
 * map naming six of the ten types and falling through to `investigation`,
 * against this one's `response` - so an imported or hand-typed action type
 * was drawn in two different colours by the two surfaces.
 *
 * **Keyed by the action type's name**, never by the row's stored `colour` -
 * that hex is the analyst's, editable per entry, so classing off it would drop
 * every activity row at once, where a name this file has not heard of costs one
 * row. That row renders as `response`, the fallback.
 */

import type { ACTIVITY_ACTION } from '@contract/vocabularies.lists'

export type ActionClass = 'response' | 'mitigation' | 'investigation'

/**
 * **Total over the served vocabulary, so an action type added there is a
 * compile error here.** `ACTIVITY_ACTION` comes through `@contract/*.lists`,
 * which the client may value-import because those modules import nothing.
 *
 * The alternative was a test, and it cannot be written: `response` is both a
 * real class and the fallback, so from outside this module a value that fell
 * through is indistinguishable from one that legitimately maps to it. Three
 * lists describe these types - the vocabulary, the baked hex per value, and
 * this - and the other two are pinned to each other by
 * `colours.lists.test.ts`. This is what pins the third.
 */
const CLASS_OF: Readonly<Record<(typeof ACTIVITY_ACTION)[number], ActionClass>> = {
  'external notification sent': 'response',
  'external notification received': 'response',
  'internal notification': 'response',
  escalation: 'response',
  'containment action': 'mitigation',
  'remediation action': 'mitigation',
  'investigation started': 'investigation',
  'ticket created': 'investigation',
  'evidence collected': 'investigation',
  other: 'investigation',
}

export function actionClassOf(actionType: string | null | undefined): ActionClass {
  // **Read through a widened view, because the argument is a wire string.**
  // The map is total over the vocabulary at its declaration, which is what
  // makes an unmapped type a compile error; casting the *lookup* into that
  // union instead would make `?? 'response'` read as dead to the linter while
  // an imported or hand-typed value still lands here as `undefined`.
  const known = CLASS_OF as Readonly<Record<string, ActionClass | undefined>>
  return known[(actionType ?? '').trim().toLowerCase()] ?? 'response'
}

/**
 * The class as a badge: a rule and lettering in the class colour, no fill.
 *
 * All three are legible as ink on both grounds by construction - they were
 * chosen against `--background`, which the severity ramp was not, so they need
 * no `-ink` companion the way `--severity-low` does. Measured 5.03/5.68:1 light
 * and 7.36/7.04:1 dark; `--action-notify` is `--severity-info`, 5.77/7.48:1.
 *
 * Unfilled: an activity's colour is a classification, not an alarm, and a solid
 * chip on every row of the SOC's own work reads as five things going wrong.
 */
export const ACTION_CHIP: Readonly<Record<ActionClass, string>> = {
  response: 'text-action-notify border-current',
  mitigation: 'text-action-contain border-current',
  investigation: 'text-action-investigate border-current',
}

export const ACTION_RAIL: Readonly<Record<ActionClass, string>> = {
  response: 'bg-action-notify',
  mitigation: 'bg-action-contain',
  investigation: 'bg-action-investigate',
}

/**
 * The word on the badge. One noun per class, not the stored action type - the
 * type is already the editable value on the metadata line below, and repeating
 * "external notification received" in a chip spends the row's one scan target
 * on a string too long to scan.
 */
export const ACTION_NOUN: Readonly<Record<ActionClass, string>> = {
  response: 'notification',
  mitigation: 'containment',
  investigation: 'investigation',
}
