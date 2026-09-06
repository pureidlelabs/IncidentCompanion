/**
 * The structured editor a library row is edited and previewed through.
 *
 * **Derived from the payload schema, never described a second time**: an array
 * of objects is a section, anything else is a field, so a library that gains a
 * column gains a control without this file changing. What a field is called
 * and which control it draws comes from `field()`, the registry the entity
 * forms use; a key with no metadata still renders, labelled from the key.
 *
 * The document is a projection and `values` is the whole of the state - add
 * and remove re-render from the values the form already holds and write
 * nothing.
 */
import { z } from 'zod'

import { fields as fieldRegistry, type FieldMeta } from '../domain/field-spec.js'

export interface EditorOption {
  value: string
  label: string
}

export interface EditorField {
  key: string
  label: string
  value: string
  kind: string
  options: EditorOption[]
}

/** One column of a row section, before it is bound to a row's values. Carried
 *  separately because a section with no rows still has columns. */
export interface EditorSpec {
  key: string
  label: string
  kind: string
  options: EditorOption[]
}

export interface EditorSection {
  key: string
  heading: string
  /** What one row is called, for Add and the empty state. */
  noun: string
  specs: EditorSpec[]
  rows: { fields: EditorField[] }[]
}

/**
 * `[text, level]` - the same pair every refusal in this app answers with.
 *
 * **The level is second, which is the wrong way round to guess.** The client
 * filters with `([, tone]) => tone === 'negative'`, so a message written
 * `[level, text]` renders as a success with the word "negative" in it.
 */
export type WrittenMessage = [string, string]

/**
 * The editor document, published.
 *
 * **Declared beside the interfaces rather than replacing them.** These types are
 * built up piece by piece by `editorDocument`, and a schema-first rewrite of
 * that construction buys nothing here - what was missing is a description the
 * reference can carry, and the compiler checks the two agree the moment the
 * route declares its return type.
 */
export const editorOptionSchema = z.object({ value: z.string(), label: z.string() })

export const editorFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  value: z.string(),
  kind: z.string().describe('Which control draws it.'),
  options: z.array(editorOptionSchema),
})

export const editorSpecSchema = z.object({
  key: z.string(),
  label: z.string(),
  kind: z.string(),
  options: z.array(editorOptionSchema),
})

export const editorSectionSchema = z.object({
  key: z.string(),
  heading: z.string(),
  noun: z.string().describe('What one row is called, for Add and the empty state.'),
  specs: z
    .array(editorSpecSchema)
    .describe('The columns, carried separately because a section with no rows still has them.'),
  rows: z.array(z.object({ fields: z.array(editorFieldSchema) })),
})

export const editorDocumentSchema = z.object({
  kind: z.string(),
  name: z.string(),
  title: z.string(),
  subtitle: z.string(),
  blurb: z.string(),
  fields: z.array(editorFieldSchema),
  sections: z.array(editorSectionSchema),
  messages: z.array(z.tuple([z.string(), z.string()])),
  hasPreview: z.boolean(),
  canEdit: z.boolean().describe('False for a built-in: shown so it can be read, never written.'),
})

export interface EditorDocument {
  kind: string
  name: string
  title: string
  subtitle: string
  blurb: string
  fields: EditorField[]
  sections: EditorSection[]
  messages: WrittenMessage[]
  hasPreview: boolean
  /** False for a built-in: it is shown so it can be read, never written. */
  canEdit: boolean
}

/** `[{key, value}]` - a list because the keys are data. */
export interface EditorValue {
  key: string
  value: string
}

type Unwrappable = z.ZodType & { def?: { innerType?: z.ZodType } }

/**
 * The schema under any number of `.default()` / `.optional()` wrappers.
 *
 * **A loop, not one unwrap.** `z.array(...).default([]).optional()` is two
 * deep, and stopping at the first leaves an array looking like a scalar - the
 * section then renders as a text box holding `[object Object]`.
 */
function core(schema: z.ZodType): z.ZodType {
  let current = schema as Unwrappable
  while (current.def?.innerType) current = current.def.innerType
  return current
}

function isArray(schema: z.ZodType): schema is z.ZodArray {
  return core(schema).def.type === 'array'
}

function isObject(schema: z.ZodType): schema is z.ZodObject {
  return core(schema).def.type === 'object'
}

/**
 * A readable label for a key nothing declared one for.
 *
 * `initialAccessVector` reads as *Initial access vector* - sentence case, not
 * Title Case, which is what every other label in this app uses.
 */
function labelFrom(key: string): string {
  const spaced = key.replace(/([A-Z])/g, ' $1').trim().toLowerCase()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/**
 * The control the client draws.
 *
 * **`colour` rather than `color`.** The editor's vocabulary is the analyst's
 * spelling and `FieldKind`'s is the CSS one; they are one letter apart and the
 * client tests `field.kind === 'colour'`, so a straight pass-through renders a
 * hex value as a plain text box with no swatch.
 */
function kindOfField(meta: FieldMeta | undefined): string {
  if (!meta) return 'text'
  return meta.kind === 'color' ? 'colour' : meta.kind
}

/** An enum's members, as options. Anything else offers none. */
function optionsOf(schema: z.ZodType): EditorOption[] {
  const inner = core(schema) as z.ZodType & { options?: readonly string[] }
  // **Not `Array.isArray`**: its signature narrows to `any[]`, which widens
  // every option back to `any` on the way out. The cast above already states
  // the shape, so presence is the only question left.
  const options = inner.options
  if (!options) return []
  return options.map((value) => ({ value, label: value }))
}

function metaOf(schema: z.ZodType): FieldMeta | undefined {
  return fieldRegistry.get(schema)
}

/** A stored value as the form carries it: every control is a string. */
function asText(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

function specsOf(element: z.ZodObject): EditorSpec[] {
  return Object.entries(element.shape).map(([key, sub]) => {
    const schema = sub as z.ZodType
    const meta = metaOf(schema)
    return {
      key,
      label: meta?.label ?? labelFrom(key),
      kind: kindOfField(meta),
      options: optionsOf(schema),
    }
  })
}

/**
 * The document for a payload, given the values a form is holding.
 *
 * `values` is what the analyst has typed rather than what is on disk, so a
 * refusal re-renders their edit. `stored` seeds it on first open.
 */
export function editorDocument(options: {
  schema: z.ZodObject
  kind: string
  name: string
  title: string
  subtitle: string
  blurb: string
  values: Record<string, unknown>
  canEdit: boolean
  messages?: WrittenMessage[]
}): EditorDocument {
  const flat: EditorField[] = []
  const sections: EditorSection[] = []

  for (const [key, sub] of Object.entries(options.schema.shape)) {
    const schema = sub as z.ZodType
    const meta = metaOf(schema)

    if (isArray(schema)) {
      const element = core(schema) as z.ZodArray & { element: z.ZodType }
      if (!isObject(element.element)) continue
      const specs = specsOf(core(element.element) as z.ZodObject)
      const held = Array.isArray(options.values[key]) ? (options.values[key] as unknown[]) : []
      sections.push({
        key,
        heading: meta?.label ?? labelFrom(key),
        noun: nounFor(key),
        specs,
        rows: held.map((row, index) => ({
          fields: specs.map((spec) => ({
            key: `${key}.${String(index)}.${spec.key}`,
            label: spec.label,
            value: asText((row as Record<string, unknown>)[spec.key]),
            kind: spec.kind,
            options: spec.options,
          })),
        })),
      })
      continue
    }

    flat.push({
      key,
      label: meta?.label ?? labelFrom(key),
      value: asText(options.values[key]),
      kind: kindOfField(meta),
      options: optionsOf(schema),
    })
  }

  return {
    kind: options.kind,
    name: options.name,
    title: options.title,
    subtitle: options.subtitle,
    blurb: options.blurb,
    fields: flat,
    sections,
    messages: options.messages ?? [],
    // No library renders a specimen on this server: a preview would be the
    // report renderer's and nothing here calls it. Said once rather than left
    // for the client to infer from an empty document.
    hasPreview: false,
    canEdit: options.canEdit,
  }
}

/**
 * A singular noun for a section, for Add and the empty state.
 *
 * **Trailing `s` removed and nothing cleverer.** The four sections that exist
 * are `actions`, `evidence`, `notes` and whatever a later library adds; a
 * pluralisation library would be a dependency to make *Evidence* read as
 * *Evidenc*.
 */
function nounFor(key: string): string {
  const label = labelFrom(key).toLowerCase()
  return label.endsWith('s') ? label.slice(0, -1) : label
}

/**
 * Values from a form, back into the shape the payload schema validates.
 *
 * A key is `field` or `section.index.field`. **Indices are re-packed rather
 * than trusted**: removing row 1 of three leaves keys `0` and `2`, and an
 * array with a hole in it is not what `z.array` expects - nor what the next
 * render should number from.
 */
export function payloadFrom(values: readonly EditorValue[]): Record<string, unknown> {
  const flat: Record<string, unknown> = {}
  const rows = new Map<string, Map<number, Record<string, unknown>>>()

  for (const { key, value } of values) {
    const parts = key.split('.')
    if (parts.length === 1) {
      flat[key] = value
      continue
    }
    if (parts.length !== 3) continue
    const [section, index, field] = parts as [string, string, string]
    const at = Number(index)
    if (!Number.isInteger(at)) continue
    if (!rows.has(section)) rows.set(section, new Map())
    const bySection = rows.get(section)!
    if (!bySection.has(at)) bySection.set(at, {})
    bySection.get(at)![field] = value
  }

  for (const [section, bySection] of rows) {
    flat[section] = [...bySection.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, row]) => row)
  }
  return flat
}

/** The values a document holds, in the order the form submits them. */
export function valuesOf(document: EditorDocument): EditorValue[] {
  const out = document.fields.map((one) => ({ key: one.key, value: one.value }))
  for (const section of document.sections) {
    for (const row of section.rows) {
      out.push(...row.fields.map((one) => ({ key: one.key, value: one.value })))
    }
  }
  return out
}

/**
 * The values with one row added to, or removed from, a section.
 *
 * **Neither writes anything.** They re-render the form the analyst is holding,
 * which is why they take and return values rather than touching the row.
 */
export function withRow(
  values: readonly EditorValue[],
  section: string,
  specs: readonly EditorSpec[],
): EditorValue[] {
  const payload = payloadFrom(values)
  const held = Array.isArray(payload[section]) ? (payload[section] as unknown[]) : []
  payload[section] = [...held, Object.fromEntries(specs.map((spec) => [spec.key, '']))]
  return flatten(payload)
}

export function withoutRow(
  values: readonly EditorValue[],
  section: string,
  index: number,
): EditorValue[] {
  const payload = payloadFrom(values)
  const held = Array.isArray(payload[section]) ? (payload[section] as unknown[]) : []
  payload[section] = held.filter((_, at) => at !== index)
  return flatten(payload)
}

/** A payload back to the flat `[{key, value}]` the form carries. */
function flatten(payload: Record<string, unknown>): EditorValue[] {
  const out: EditorValue[] = []
  for (const [key, value] of Object.entries(payload)) {
    if (Array.isArray(value)) {
      value.forEach((row, index) => {
        for (const [field, held] of Object.entries(row as Record<string, unknown>)) {
          out.push({ key: `${key}.${String(index)}.${field}`, value: asText(held) })
        }
      })
      continue
    }
    out.push({ key, value: asText(value) })
  }
  return out
}

/**
 * A Zod failure as messages an analyst can act on.
 *
 * **The path is named, because "invalid input" on a form with three sections
 * and nine rows is not actionable.** Zod's own message carries the rule; the
 * path carries which control broke it.
 */
export function messagesFrom(error: z.ZodError): WrittenMessage[] {
  return error.issues.map((issue) => {
    const where = issue.path.join('.')
    return [where ? `${where}: ${issue.message}` : issue.message, 'negative'] as WrittenMessage
  })
}
