/**
 * What a form may send back, given the row it opened over.
 */

/** Read-only on every collection, in camelCase. */
export const DERIVED_FIELDS: readonly string[] = ['ukcPhase', 'ukcCycle']

/**
 * What the server owns and a caller may never name.
 */
const NEVER_SENT: readonly string[] = [
  'id',
  ...DERIVED_FIELDS,
  'provenance',
  'unreviewed',
  'timeAssumed',
]

/**
 * Whether two stored values are the same answer.
 */
export function same(before: unknown, after: unknown): boolean {
  if (Array.isArray(before) && Array.isArray(after)) {
    // Order is meaningful - a link list is what the graph draws in sequence -
    // so a reordering is a change and a sorted comparison would hide it.
    return before.length === after.length && before.every((item, at) => item === after[at])
  }
  return before === after
}

/**
 * The fields of `draft` that differ from `entry`, minus what a caller may never
 * set.
 */
export function changedFields<T extends object>(entry: Partial<T>, draft: Partial<T>): Partial<T> {
  const before = entry as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const [name, value] of Object.entries(draft as Record<string, unknown>)) {
    if (NEVER_SENT.includes(name)) continue
    if (!same(before[name], value)) out[name] = value
  }
  return out as Partial<T>
}

/** Everything a new row carries, minus what the server assigns. No diff to make. */
export function creatableFields<T extends object>(draft: Partial<T>): Partial<T> {
  return changedFields<T>({}, draft)
}
