import { Clock3, FileWarning } from 'lucide-react'

import type { FieldSpec } from '@/api/specs'
import type { Draft } from '@/components/blocks/field-control'

/**
 * How the case record's served fields are grouped, and how many of them carry
 * an answer.
 *
 * Holds no component, so the form block, the screen and their tests read one
 * projection.
 */

/** Which pane of the case record a group belongs to. */
export type CaseGroupKey = 'details' | 'times'

export interface CaseGroup {
  key: CaseGroupKey
  title: string
  icon: typeof FileWarning
  fields: FieldSpec[]
}

/** The groups, in the order they are read, by field name. */
const GROUPS: readonly {
  key: CaseGroupKey
  title: string
  icon: typeof FileWarning
  names: readonly string[]
}[] = [
  {
    key: 'details',
    title: 'Case details',
    icon: FileWarning,
    names: [
      'title',
      'reference',
      'customer',
      'analyst',
      'status',
      'severity',
      'incidentClass',
      'detectionSource',
      'initialAccessVector',
      'detectionGap',
      'summary',
    ],
  },
  {
    key: 'times',
    title: 'Key times',
    icon: Clock3,
    names: ['openedAt', 'detectedAt', 'containedAt', 'eradicatedAt', 'recoveredAt'],
  },
]

/**
 * The served fields, placed. A name in neither list keeps a place rather than
 * disappearing, which is what makes this safe to leave hand-written.
 *
 * The leftovers join `details`, not a group of their own: a field the server
 * grows has to be answerable somewhere, and a pane nothing routes to is a
 * field with no door on it.
 */
export function groupedCaseFields(fields: readonly FieldSpec[]): CaseGroup[] {
  const named = fields.filter((field) => typeof field.name === 'string' && field.name !== '')
  const placed = new Set<string>()
  const groups = GROUPS.map((group) => {
    const own = group.names
      .map((name) => named.find((field) => field.name === name))
      .filter((field): field is FieldSpec => field !== undefined)
    for (const field of own) placed.add(field.name)
    return { key: group.key, title: group.title, icon: group.icon, fields: own }
  })

  const rest = named.filter((field) => !placed.has(field.name))
  return groups.map((group) =>
    group.key === 'details' ? { ...group, fields: [...group.fields, ...rest] } : group,
  )
}

/** The groups belonging to one pane, empty ones dropped. */
export function caseGroupsFor(fields: readonly FieldSpec[], key: CaseGroupKey): CaseGroup[] {
  return groupedCaseFields(fields).filter(
    (group) => group.key === key && group.fields.length > 0,
  )
}

/**
 * Which pane holds the field a refusal names, by the label the analyst read.
 *
 * A refusal carries the label rather than the wire name, so the lookup is by
 * label. An unrecognised label answers `details`: the band has to be shown
 * somewhere, and a refusal drawn on no pane at all is a lost write that the
 * screen reports as a clean save.
 */
export function paneHoldingLabel(fields: readonly FieldSpec[], label: string): CaseGroupKey {
  const wanted = label.trim().toLowerCase()
  const found = groupedCaseFields(fields).find((group) =>
    group.fields.some((field) => field.label.trim().toLowerCase() === wanted),
  )
  return found?.key ?? 'details'
}

export function answered(draft: Draft, fields: readonly FieldSpec[]): number {
  return fields.filter((field) => {
    const value = draft[field.name]
    if (typeof value === 'string') return value.trim() !== ''
    return value !== null && value !== undefined && value !== false
  }).length
}
