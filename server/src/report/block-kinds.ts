/**
 * Every section a report can hold, grouped the way the Add menu offers them.
 */
import { BLOCK_KINDS } from '../domain/entities/report.js'
import { EN } from './document/labels.en.js'

/**
 * What the *menu button* says, where it differs from the heading.
 */
const MENU_LABEL: Record<string, string> = {
  written: 'Written section',
}

/**
 * Kinds the vocabulary carries and no build can draw, so the menu does not
 * offer them. The list is empty.
 */
export const UNDRAWABLE_KINDS: readonly string[] = []

/**
 * The six groups, in the order the menu draws them.
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
 * The grouped menu.
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
 * **Every drawable kind is offered, or the menu quietly loses one.**
 */
export function kindsWithoutAGroup(): string[] {
  const grouped = new Set(GROUPS.flatMap(([, kinds]) => kinds))
  return BLOCK_KINDS.filter(
    (kind) => !grouped.has(kind) && !UNDRAWABLE_KINDS.includes(kind),
  )
}

/**
 * The layout that seeds nothing.
 */
export const BLANK_LAYOUT = '__blank__'

/**
 * The one kind whose words are the analyst's rather than the case's.
 */
export const WRITTEN_BLOCK = 'written'
