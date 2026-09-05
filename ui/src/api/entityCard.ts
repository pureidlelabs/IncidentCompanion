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

/** The first free-text field carrying a value - see the rules above. */
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

/** The card's body: up to `CARD_FIELD_LIMIT` filled fields, in the form's order. */
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
    // no chip and no line, and disappears off the card entirely. It also
    // dropped `isolated` the moment that field gained a tone.
    if (field.name === tone?.field) continue
    const value = displayValue(field, row[field.name])
    if (!value) continue
    rows.push({ name: field.name, label: shortLabel(field.label), value })
  }

  return { nameField: nameField?.name, tone, rows }
}

/**
 * How many timeline entries reference this id.
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
