/**
 * Every section a report can hold, grouped the way the Add menu offers them.
 *
 * Served rather than copied into the client, which is the argument `/api/specs`
 * makes for the entity forms; `blocks.kindLabel` there is a fallback for a kind
 * the menu does not carry, never a second source.
 *
 * The grouping is editorial and the headings are copy, so both are stated here
 * rather than derived from the slug.
 */
import { BLOCK_KINDS } from '../domain/entities/report.js'
import { EN } from './document/labels.en.js'

/**
 * What the *menu button* says, where it differs from the heading.
 *
 * Only the written block: its heading is empty, so a menu built from headings
 * alone would offer a nameless item.
 */
const MENU_LABEL: Record<string, string> = {
  written: 'Written section',
}

/**
 * Kinds the vocabulary carries and no build can draw, so the menu does not
 * offer them. The list is empty.
 *
 * **Not a place to hide a kind**: a kind listed here must have no resolver, and
 * one that can be drawn and is merely unwanted belongs out of `BLOCK_KINDS`
 * entirely. `block-kinds.test.ts` asserts the difference.
 */
export const UNDRAWABLE_KINDS: readonly string[] = []

/**
 * The six groups, in the order the menu draws them.
 *
 * **Ordered by the question each answers**, not alphabetically: an analyst
 * adding a section is somewhere in the story, and the groups follow it - what
 * the case is, what happened, what was found, what was done.
 */
const GROUPS: readonly (readonly [string, readonly string[]])[] = [
  ['Write your own', ['written', 'figure']],
  ['The case in short', ['case_header', 'exec_card', 'metrics', 'impact']],
  [
    'What happened',
    ['timeline', 'narrative', 'ribbon', 'techniques', 'technique_table', 'killchain', 'root_cause'],
  ],
  ['What we found', ['entities', 'indicators', 'evidence', 'methods']],
  ['What we did', ['actions']],
  ['Reference', ['glossary']],
]

export interface BlockKind {
  kind: string
  label: string
}

export interface BlockKindGroup {
  heading: string
  kinds: BlockKind[]
}

/**
 * The grouped menu. It offers a kind and hands out no words: the labels are app
 * chrome, deliberately untranslated, and taken from the English pack rather
 * than a second copy of the same strings.
 */
export function blockKindGroups(): BlockKindGroup[] {
  return GROUPS.map(([heading, kinds]) => ({
    heading,
    kinds: kinds.map((kind) => ({
      kind,
      label: MENU_LABEL[kind] ?? EN[`heading.${kind}`] ?? kind,
    })),
  }))
}

/**
 * **Every drawable kind is offered, or the menu quietly loses one.** A kind
 * added to `BLOCK_KINDS` and not to a group is a section nothing can insert,
 * and the only symptom is a menu one item shorter than it was.
 *
 * `UNDRAWABLE_KINDS` is excluded rather than reported: those are absent on
 * purpose, and counting them here would make the check red for the state it is
 * meant to describe.
 */
export function kindsWithoutAGroup(): string[] {
  const grouped = new Set(GROUPS.flatMap(([, kinds]) => kinds))
  return BLOCK_KINDS.filter(
    (kind) => !grouped.has(kind) && !UNDRAWABLE_KINDS.includes(kind),
  )
}

/**
 * The layout that seeds nothing.
 *
 * **Named rather than expressed as an absence**, because "start from nothing"
 * and "no layout chosen" are different answers and the form has to be able to
 * offer the first one.
 */
export const BLANK_LAYOUT = '__blank__'

/**
 * The one kind whose words are the analyst's rather than the case's.
 *
 * Named because the identity rule turns on it: every other kind is identified
 * by kind alone, and two written sections differ only by their heading.
 * -> `lifecycle.service.ts`
 */
export const WRITTEN_BLOCK = 'written'
