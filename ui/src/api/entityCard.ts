import {
  fieldsOf,
  shortLabel,
  type FieldSpec,
  type FieldToneSpec,
  type FormSpec,
  type Specs,
} from './specs'

/**
 * What a hover card says about one entity, derived from the served form rather
 * than written out per collection.
 *
 * **Nothing here names a field**; the order the form declares is the
 * identifying order. The rules, as they apply:
 *
 * - The **name** is the first free-text field carrying a value - `ip` falling
 *   to `domain` on a domain-only network indicator.
 * - The **chip** is the first field whose name `specs.fieldTones` carries. A
 *   form with none gets no chip rather than a neutral one.
 * - The **rows** are the next `CARD_FIELD_LIMIT` filled fields. References are
 *   skipped: a card resolving another card's ids is a second hop, and the ids
 *   are all it would have. `tags` and `colour` are skipped because the row face
 *   renders them separately.
 * - A **checkbox** appears only when true. `Isolated - No` spends a line saying
 *   nothing; the analyst reads the absence.
 *
 * The cap is four: a card that runs to a screenful under the pointer is a
 * panel rather than a hint.
 */

/** Kinds that never earn a line: the value is an id, a colour or the tag string. */
const SKIPPED_KINDS = new Set(['color', 'tag_select', 'device_select', 'multi_device_select'])

export const CARD_FIELD_LIMIT = 4

export interface CardRow {
  name: string
  label: string
  value: string
}

export interface CardTone {
  /** The field the chip came from, so the body can skip that one and no other. */
  field: string
  label: string
  value: string
  /** The served tone -- a colour role and a fill -- straight from `specs.fieldTones`. */
  tone: FieldToneSpec
}

export interface EntityCardContent {
  /** The field the name came from, so the rows can skip it. */
  nameField: string | undefined
  tone: CardTone | undefined
  rows: CardRow[]
}

/** A wire value as display text, or `''` for anything with nothing to show. */
function displayValue(field: FieldSpec, raw: unknown): string {
  if (field.kind === 'checkbox') return raw === true ? 'Yes' : ''
  if (typeof raw === 'string') return raw.trim()
  if (typeof raw === 'number') return String(raw)
  return ''
}

export function nameFieldOf(
  form: FormSpec,
  row: Readonly<Record<string, unknown>>,
): FieldSpec | undefined {
  return fieldsOf(form).find(
    (field) => field.kind === 'text' && displayValue(field, row[field.name]) !== '',
  )
}

/**
 * The card's chip, or nothing.
 *
 * Reads `fieldTones` by field name and not by form, which is what makes it
 * work for a collection nobody has added yet: the tones document is keyed by
 * field, so a new form declaring `verdict` gets the chip for free.
 */
export function toneOf(
  specs: Specs,
  form: FormSpec,
  row: Readonly<Record<string, unknown>>,
): CardTone | undefined {
  for (const field of fieldsOf(form)) {
    const tones = specs.fieldTones[field.name]
    if (!tones) continue
    const value = displayValue(field, row[field.name])
    const tone = value ? tones[value.toLowerCase()] : undefined
    if (value && tone) return { field: field.name, label: shortLabel(field.label), value, tone }
  }
  return undefined
}

export function cardContentOf(
  specs: Specs,
  form: FormSpec,
  row: Readonly<Record<string, unknown>>,
): EntityCardContent {
  const nameField = nameFieldOf(form, row)
  const tone = toneOf(specs, form, row)
  const rows: CardRow[] = []

  for (const field of fieldsOf(form)) {
    if (rows.length === CARD_FIELD_LIMIT) break
    if (field.name === nameField?.name) continue
    if (SKIPPED_KINDS.has(field.kind)) continue
    // **The chip's own field, not every field with a tone map.** Skipping by
    // "has a tone map" drops a field whose *value* nothing mapped -- it gets
    // no chip and no line, and disappears off the card entirely.
    if (field.name === tone?.field) continue
    const value = displayValue(field, row[field.name])
    if (!value) continue
    rows.push({ name: field.name, label: shortLabel(field.label), value })
  }

  return { nameField: nameField?.name, tone, rows }
}

/**
 * How many timeline entries reference this id.
 *
 * Scans every value rather than a list of link fields. A per-field map goes
 * stale against a link field added later by counting one entry too few -
 * silent, and indistinguishable from an entity nothing links to. An id is a `uuid4`
 * hex string; it appears in no free-text field by accident.
 */
export function referenceCount(
  entries: readonly Readonly<Record<string, unknown>>[],
  id: string,
): number {
  if (!id) return 0
  return entries.filter((entry) =>
    Object.entries(entry).some(([key, value]) =>
      key === 'id' ? false : Array.isArray(value) ? value.includes(id) : value === id,
    ),
  ).length
}
