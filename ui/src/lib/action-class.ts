/**
 * Which of three things an activity *is*, and the colour that says so.
 */

import type { ACTIVITY_ACTION } from '@contract/vocabularies.lists'

export type ActionClass = 'response' | 'mitigation' | 'investigation'

/**
 * **Total over the served vocabulary, so an eleventh action type is a compile
 * error.**
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
 * The word on the badge.
 */
export const ACTION_NOUN: Readonly<Record<ActionClass, string>> = {
  response: 'notification',
  mitigation: 'containment',
  investigation: 'investigation',
}
