/**
 * What a form may send back, given the row it opened over.
 *
 * A dialog holds a whole entry and a `PATCH` takes changed fields; the diff is
 * here rather than in each dialog because getting it wrong is silent in one
 * direction and a 422 in the other.
 *
 * **A derived field is refused on write, not ignored.** A read carries
 * `ukcPhase` and `ukcCycle`, derived on the way out with no column behind
 * either, and the write schemas are `.strict()` - so sending one back is an
 * unrecognised key and the whole body is refused, even when the value is the
 * one just read. A dialog seeded from `row.original` and saved whole therefore
 * fails every time. The diff is what saves it: an untouched derived field
 * equals itself and drops out. `DERIVED_FIELDS` is stripped as well, so a
 * *new* entry, which has nothing to diff against, cannot carry one either.
 * -> `server/src/domain/entities/timeline.ts`
 *
 * The list is not published by `GET /api/specs`, which serialises no derivation
 * (`specsResidual.ts`). A name the server derives and this list does not
 * re-breaks the same save the same way.
 */

/** Read-only on every collection, in camelCase. */
export const DERIVED_FIELDS: readonly string[] = ['ukcPhase', 'ukcCycle']

/**
 * What the server owns and a caller may never name.
 *
 * **`provenance`, `unreviewed` and `timeAssumed` are the timeline's**, and the
 * write schema omits all three behind `.strict()` - so naming one is a 400 for
 * the *whole* write rather than a field quietly dropped. The dialog seeds a new
 * entry with `{ kind, provenance }`, and `creatableFields` sends everything the
 * draft holds, so **every create through the timeline dialog was refused**:
 * `Unrecognized key: "provenance"`. Python accepted it, which is why it was
 * there and why neither suite could see it.
 *
 * Listed here rather than at the timeline's own call site because this is the
 * one place a body is assembled, and a second list beside it is a second thing
 * to keep true. A field named here that another collection *does* accept is a
 * field this list is wrong about - none is today.
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
 *
 * Exported because the edit dialog marks a changed field with a rail, and a
 * bare `!==` lights it for a reference list toggled on and off again - the
 * picker hands back a fresh array, so the mark says "you touched this" on a
 * field `changedFields` correctly declines to send. One predicate, or the mark
 * and the write disagree.
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
 *
 * A key absent from `draft` is untouched rather than cleared: a form renders a
 * tier of the entry, and a PATCH clearing whatever the tier did not show is
 * the whole-row write the per-row PATCH exists to avoid.
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
