import type { ComplianceRecord } from '@/api/compliance'
import type { ComplianceFieldSpec } from '@/api/specs'

/**
 * What a stored compliance answer is, what the control reads it as, and what
 * shape a served vocabulary asks to be drawn in.
 *
 * Holds no component, so the screen file and its tests read one projection.
 */

/**
 * Whether a field carries an answer.
 *
 * **`false` is an answer and `''` is not.** Every ground in the NIS2 and DORA
 * cards is a three-state select whose empty member reads "not stated", so a
 * falsy test would count "no" as unanswered on ten fields at once.
 */
export function isAnswered(record: ComplianceRecord, spec: ComplianceFieldSpec): boolean {
  const value = record[spec.name]
  if (value === null) return false
  if (typeof value === 'string') return value.trim() !== ''
  if (Array.isArray(value)) return value.length > 0
  return true
}

/** The stored value as the control wants it: a string, or a set of them. */
export function valueOf(record: ComplianceRecord, spec: ComplianceFieldSpec): string {
  const value = record[spec.name]
  if (Array.isArray(value)) return value.join(spec.join ?? ',')
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'true' : ''
  return typeof value === 'string' ? value : ''
}

export function chosen(record: ComplianceRecord, spec: ComplianceFieldSpec): string[] {
  const value = record[spec.name]
  if (Array.isArray(value)) return value.filter((one): one is string => typeof one === 'string')
  return valueOf(record, spec)
    .split(spec.join ?? ',')
    .map((one) => one.trim())
    .filter(Boolean)
}

// ---------------------------------------------------------------------------
// How a multi-select vocabulary wants to be drawn
// ---------------------------------------------------------------------------

/** One stem, and the options that carry it. `stem` is `''` for those that carry none. */
export interface OptionGroup {
  stem: string
  options: readonly { value: string; detail: string }[]
}

/**
 * What a set of served options looks like, and so what it is drawn as.
 *
 * - `compact` - a wrapping set of chips. Every option is short enough to read
 *   at a glance, and there are enough of them that a column is a page.
 * - `grouped` - a heading per stem, the stem said once.
 * - `column` - one row per option, which is right for a short list.
 */
export type OptionShape =
  | { kind: 'compact'; options: readonly string[] }
  | { kind: 'grouped'; groups: readonly OptionGroup[] }
  | { kind: 'column'; options: readonly string[] }

/**
 * At most four characters and at least nine of them: the point where a column
 * costs more than it gives.
 *
 * **Both are read off the served options, never off the field's name.** A
 * vocabulary is a drop-in registry, so keying on `affected_member_states` or
 * on a list of country codes means an analyst's own vocabulary needs a code
 * change to draw properly.
 *
 * Four characters is a code rather than a word - the longest ISO 3166-1
 * alpha-2 is two, and four leaves room for a numeric or alpha-3 vocabulary
 * without admitting `data`. Nine options is the count above which the column
 * is taller than the set of chips it would become at any usable width; below
 * it the column is already four or five rows and the chips buy nothing.
 */
const COMPACT_LABEL_MAX = 4
const COMPACT_MIN_OPTIONS = 9

/** What separates a stem from its detail. A colon with no space is punctuation. */
const STEM = ': '

/**
 * Two thirds of the options must carry a stem before the set is a hierarchy.
 *
 * One option with a colon in it is a sentence, not a parent - and grouping on
 * it would say one stem once and file every other option under a heading it
 * does not have. Measured on the served DORA 4.2 vocabulary: 27 of 28 carry
 * one, and the twenty-eighth is a typo in the Annex rather than a shape.
 */
const GROUP_MIN_STEMMED = 2 / 3

/**
 * Read the shape of a field's options.
 *
 * Stems are matched without regard to case, because the served vocabulary
 * spells one of them two ways; the first spelling seen is the one drawn.
 */
export function optionShape(spec: ComplianceFieldSpec): OptionShape {
  const options = spec.options ?? []
  const labelOf = (option: string): string => spec.optionLabels?.[option] ?? option

  if (
    options.length >= COMPACT_MIN_OPTIONS &&
    options.every((option) => {
      const label = labelOf(option)
      return label.trim() !== '' && label.length <= COMPACT_LABEL_MAX
    })
  ) {
    return { kind: 'compact', options }
  }

  const groups: { stem: string; options: { value: string; detail: string }[] }[] = []
  const byStem = new Map<string, (typeof groups)[number]>()
  let stemmed = 0

  for (const option of options) {
    const label = labelOf(option)
    const cut = label.indexOf(STEM)
    const stem = cut > 0 ? label.slice(0, cut) : ''
    const detail = cut > 0 ? label.slice(cut + STEM.length) : label
    if (stem !== '') stemmed += 1

    let group = byStem.get(stem.toLowerCase())
    if (group === undefined) {
      group = { stem, options: [] }
      byStem.set(stem.toLowerCase(), group)
      groups.push(group)
    }
    group.options.push({ value: option, detail })
  }

  const named = groups.filter((group) => group.stem !== '')
  if (named.length >= 2 && stemmed >= options.length * GROUP_MIN_STEMMED && named.length < stemmed) {
    // The options carrying no stem go last: they sit under no heading, and
    // leaving one where it fell puts an unlabelled row inside another group.
    return { kind: 'grouped', groups: [...named, ...groups.filter((group) => group.stem === '')] }
  }
  return { kind: 'column', options }
}
