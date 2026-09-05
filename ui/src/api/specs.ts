/**
 * `GET /api/specs`, typed - what every form contains, in what order, and what
 * a select offers.
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import type { CaseCompliance as CaseComplianceFields } from '@contract/entities/case-compliance'
import type { FieldTier } from '@contract/field-spec'

import { request } from './client'
import type { CollectionName } from './model'
import { toCamel } from './naming'
import { keys } from './queryKeys'

/**
 * The closed set of kinds `GET /api/specs` publishes.
 */
export const FIELD_KINDS = [
  'autocomplete',
  'checkbox',
  'color',
  'device_select',
  'event_datetime',
  'multi_device_select',
  'number',
  'select',
  'tag_select',
  'text',
  'textarea',
] as const

export type FieldKind = (typeof FIELD_KINDS)[number]

/** The two kinds that resolve their options from the open case, never from a vocabulary. */
export const REFERENCE_KINDS: readonly FieldKind[] = ['device_select', 'multi_device_select']

/**
 * Where a reference field points.
 */
export interface FieldRef {
  target: string
  collection: CollectionName
  noun: string
  /** One id or a list of them. `account_id` and `account_ids` share a target. */
  multiple: boolean
}

/**
 * One field descriptor.
 */
export interface FieldSpec<TData = Record<string, unknown>> {
  name: keyof TData & string
  label: string
  kind: FieldKind
  /** Absent on a reference field, and on any free-text kind. */
  options?: readonly string[]
  /** Which vocabulary these options come from, for example `severity`. */
  vocabulary?: string
  /** Display text for an option whose stored value reads badly, keyed by value. */
  optionLabels?: Readonly<Record<string, string>>
  /** A consequence the analyst cannot see from the screen. */
  hint?: string
  /**
   * Opens one of an entity dialog's three surfaces; the fields after it
   * belong to it. Absent on a form the dialog does not stack.
   */
  tier?: FieldTier
  ref?: FieldRef
  required?: boolean
  optional?: boolean
  fullWidth?: boolean
  /** Renders below the fold. Data - nothing evaluates it here. */
  subordinate?: boolean
  footerRow?: boolean
  /** Names the checkbox that enables this field. Data, never evaluated server-side. */
  enabledBy?: string
  /**
   * The values of another field that make this one applicable.
   */
  applicableWhen?: { field: string; oneOf: readonly string[] }
  /**
   * What this field holds when it is empty, served only beside a gate.
   */
  blank?: unknown
  defaultsNow?: boolean
  /** Names the colour field this one drives. */
  drivesColour?: string
  colourMap?: Readonly<Record<string, string>>
  default?: unknown
}

/** A heading between two fields. Rides *in order* inside `fields`. */
export interface SectionMarker {
  section: { title: string; copy?: string }
}

export type FormEntry<TData = Record<string, unknown>> = FieldSpec<TData> | SectionMarker

export function isSection<TData>(entry: FormEntry<TData>): entry is SectionMarker {
  return 'section' in entry
}

export interface FormSpec<TData = Record<string, unknown>> {
  /** Which table these entries land in, or `null` for a form with no owner. */
  collection: CollectionName | null
  /** How many columns the form lays out in. Advisory. */
  columns: number
  /** Descriptors and section markers, interleaved in render order. */
  fields: readonly FormEntry<TData>[]
  /**
   * A whole row of this form's collection with nothing filled in.
   */
  blank: Readonly<Record<string, unknown>>
}

/** The measured tiering behind the event dialog's three groups. */
export interface Tiering {
  eventCore: readonly string[]
  eventAlwaysClear: readonly string[]
  tacticLinks: Readonly<Record<string, readonly string[]>>
  defaultTacticLinks: readonly string[]
}

/**
 * The compliance controls' own kinds, which are **not** `FieldKind`.
 */
export const COMPLIANCE_FIELD_KINDS = [
  'check',
  'event_datetime',
  'ground',
  'multi_csv',
  'multi_lines',
  'number',
  'select',
  'text',
] as const

export type ComplianceFieldKind = (typeof COMPLIANCE_FIELD_KINDS)[number]

/**
 * One compliance control.
 */
export interface ComplianceFieldSpec {
  /**
   * **A compliance column, not a case one.**
   */
  name: keyof CaseComplianceFields
  label: string
  kind: ComplianceFieldKind
  options?: readonly string[]
  optionLabels?: Readonly<Record<string, string>>
  vocabulary?: string
  /** `multi_csv` / `multi_lines` only: how chosen members join in the stored string. */
  join?: ',' | '\n'
  computedFrom?: string
}

/**
 * One card on the Compliance screen, naming the forms its regime switch picks.
 */
export interface ComplianceCardSpec {
  title: string
  regime: string | null
  form: string
  formOff: string | null
}

export interface ComplianceSpecs {
  cards: readonly ComplianceCardSpec[]
  forms: Readonly<Record<string, { fields: readonly ComplianceFieldSpec[] }>>
  vocabularies: Readonly<Record<string, readonly string[]>>
  fieldKinds: readonly string[]
}

/**
 * How the server says a classification value is painted.
 */
export interface FieldToneSpec {
  tone: string
  fill: 'solid' | 'hollow'
}

export interface Specs {
  forms: Readonly<Record<string, FormSpec>>
  /** Which case fields a PATCH accepts. The form is `forms.CASE_FIELDS`,
   *  and the two sets differ: `closedAt` is writable and undrawn. */
  case: { writable: readonly string[] }
  vocabularies: Readonly<Record<string, readonly string[]>>
  tiering: Tiering
  /** field -> value -> tone, for the table columns that read as a chip. */
  fieldTones: Readonly<Record<string, Readonly<Record<string, FieldToneSpec>>>>
  fieldKinds: readonly string[]
  compliance: ComplianceSpecs
}

/**
 * The stable default for an omitted `fieldTones` prop.
 */
export const EMPTY_FIELD_TONES: Specs['fieldTones'] = {}

// ---------------------------------------------------------------------------
// The wire, and the boundary
// ---------------------------------------------------------------------------

type Wire = Record<string, unknown>

/**
 * Keys whose *value* is a field name rather than data.
 */
const NAME_VALUED = new Set(['name', 'computed_from'])

/**
 * One descriptor, camelised one level deep.
 */
function parseField(raw: Wire): FieldSpec {
  const out: Wire = {}
  for (const [key, value] of Object.entries(raw)) {
    out[toCamel(key)] = NAME_VALUED.has(key) && typeof value === 'string' ? toCamel(value) : value
  }
  return out as unknown as FieldSpec
}

function parseEntry(raw: Wire): FormEntry {
  if ('section' in raw) return { section: raw.section as SectionMarker['section'] }
  return parseField(raw)
}

function parseForm(raw: Wire): FormSpec {
  return {
    collection: (raw.collection as CollectionName | null) ?? null,
    columns: typeof raw.columns === 'number' ? raw.columns : 1,
    fields: (raw.fields as Wire[]).map(parseEntry),
    // **Taken as served, not camelised.** The keys are the schema's own shape,
    // which is already camelCase; running `toCamel` over them would rewrite
    // nothing and quietly mangle any field whose name contains a digit run.
    blank: (raw.blank as Record<string, unknown> | undefined) ?? {},
  }
}

/**
 * The compliance block.
 */
function parseCompliance(raw: Wire): ComplianceSpecs {
  const forms = raw.forms as Record<string, { fields: Wire[] }>
  const cards = raw.cards as { title: string; regime: string | null; form: string; form_off: string | null }[]
  return {
    cards: cards.map((card) => ({
      title: card.title,
      regime: card.regime,
      form: card.form,
      formOff: card.form_off,
    })),
    forms: Object.fromEntries(
      Object.entries(forms).map(([name, form]) => [
        name,
        { fields: form.fields.map((field) => parseField(field) as unknown as ComplianceFieldSpec) },
      ]),
    ),
    vocabularies: raw.vocabularies as ComplianceSpecs['vocabularies'],
    fieldKinds: raw.field_kinds as string[],
  }
}

/** The whole document. Total over ~114 descriptors, so it runs once per session. */
export function parseSpecs(body: unknown): Specs {
  const raw = body as Wire
  const forms = raw.forms as Record<string, Wire>
  const caseBlock = raw.case as { writable: string[] }
  const tiering = raw.tiering as {
    event_core: string[]
    event_always_clear: string[]
    tactic_links: Record<string, string[]>
    default_tactic_links: string[]
  }
  const tones = raw.field_tones as Record<string, Record<string, FieldToneSpec>>

  return {
    forms: Object.fromEntries(
      Object.entries(forms).map(([name, form]) => [name, parseForm(form)]),
    ),
    case: { writable: caseBlock.writable.map(toCamel) },
    vocabularies: raw.vocabularies as Specs['vocabularies'],
    tiering: {
      eventCore: tiering.event_core.map(toCamel),
      eventAlwaysClear: tiering.event_always_clear.map(toCamel),
      // Keys are tactics ("command and control"), values are field names.
      tacticLinks: Object.fromEntries(
        Object.entries(tiering.tactic_links).map(([tactic, links]) => [tactic, links.map(toCamel)]),
      ),
      defaultTacticLinks: tiering.default_tactic_links.map(toCamel),
    },
    fieldTones: Object.fromEntries(
      Object.entries(tones).map(([field, values]) => [toCamel(field), values]),
    ),
    fieldKinds: raw.field_kinds as string[],
    compliance: parseCompliance(raw.compliance as Wire),
  }
}

/**
 * The Compliance screen's cards, with a regime the install has switched off
 * resolved away.
 */
export function complianceCards(
  specs: Specs,
  enabled: Readonly<Record<string, boolean>>,
): { title: string; fields: readonly ComplianceFieldSpec[] }[] {
  return specs.compliance.cards.flatMap((card) => {
    const on = card.regime === null || enabled[card.regime] === true
    const form = on ? card.form : card.formOff
    if (form === null) return []
    const served = specs.compliance.forms[form]
    if (!served) throw new Error(`GET /api/specs publishes no compliance form named ${form}`)
    return [{ title: card.title, fields: served.fields }]
  })
}

/**
 * The specs, fetched once.
 */
export function useSpecs(): UseQueryResult<Specs> {
  return useQuery({
    queryKey: keys.specs(),
    // `raw`: the keys of this document are data. See `RequestOptions.raw`.
    queryFn: async () => parseSpecs(await request<unknown>('/specs', { raw: true })),
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
  })
}

// ---------------------------------------------------------------------------
// Reading one form
// ---------------------------------------------------------------------------

/**
 * One form, by the name the server publishes it under (`SYSTEM_FIELDS`,
 * `EVENT_FIELDS`).
 *
 * Throws rather than returning `undefined`: a form the server does not publish
 * is a wrong constant name, and rendering an empty screen hides it.
 */
export function formSpec<TData = Record<string, unknown>>(
  specs: Specs,
  name: string,
): FormSpec<TData> {
  const form = specs.forms[name]
  if (!form) throw new Error(`GET /api/specs publishes no form named ${name}`)
  return form as FormSpec<TData>
}

/**
 * Which served form describes a collection's fields.
 */
export const COLLECTION_FORMS = {
  systems: 'SYSTEM_FIELDS',
  accounts: 'ACCOUNT_FIELDS',
  network_indicators: 'NETWORK_FIELDS',
  malware: 'MALWARE_FIELDS',
  cloud_apps: 'CLOUD_APP_FIELDS',
  evidence: 'EVIDENCE_FIELDS',
  impact: 'IMPACT_FIELDS',
  actions: 'ACTION_FIELDS',
} as const

/** The form name for a collection, or `undefined` where none is mapped. */
export function formNameFor(collection: string): string | undefined {
  return (COLLECTION_FORMS as Record<string, string>)[collection]
}

/** The descriptors, section markers dropped. */
export function fieldsOf<TData>(form: FormSpec<TData>): FieldSpec<TData>[] {
  return form.fields.filter((entry): entry is FieldSpec<TData> => !isSection(entry))
}

export function fieldOf<TData>(
  form: FormSpec<TData>,
  name: string,
): FieldSpec<TData> | undefined {
  return fieldsOf(form).find((field) => field.name === name)
}

/** A run of fields under one heading. `title` is `''` for the run before the first. */
export interface FormSection<TData> {
  title: string
  copy?: string
  fields: FieldSpec<TData>[]
}

/**
 * The form as its served order groups it: the fields before the first section
 * marker, then one group per marker.
 */
export function sectionsOf<TData>(form: FormSpec<TData>): FormSection<TData>[] {
  const out: FormSection<TData>[] = [{ title: '', fields: [] }]
  for (const entry of form.fields) {
    if (isSection(entry)) {
      const { title, copy } = entry.section
      out.push(copy === undefined ? { title, fields: [] } : { title, copy, fields: [] })
    } else {
      out[out.length - 1]?.fields.push(entry)
    }
  }
  return out.filter((section) => section.fields.length > 0)
}

/** This form's labels, keyed by field name - what a column header or a `<dt>` reads. */
export function labelsOf<TData>(form: FormSpec<TData>): Record<string, string> {
  return Object.fromEntries(fieldsOf(form).map((field) => [field.name, field.label]))
}

/**
 * A label with its parenthetical dropped: "Description (title)" -> "Description".
 */
export function shortLabel(label: string): string {
  return label.split(' (')[0] ?? label
}

/** Whether this field's options come from the open case rather than a vocabulary. */
export function isReference<TData>(field: FieldSpec<TData>): boolean {
  return field.ref !== undefined
}

/**
 * Whether a draft leaves this field shut, by either gate it may declare.
 */
export function gateClosed<TData>(
  field: FieldSpec<TData>,
  draft: Readonly<Record<string, unknown>>,
): boolean {
  if (field.enabledBy !== undefined && !draft[field.enabledBy]) return true
  const when = field.applicableWhen
  if (when === undefined) return false
  const held = draft[when.field]
  return typeof held !== 'string' || !when.oneOf.includes(held)
}

/**
 * Whether a *value* gate leaves this field shut. `enabledBy` is not consulted.
 */
function valueGateShut<TData>(
  field: FieldSpec<TData>,
  draft: Readonly<Record<string, unknown>>,
): boolean {
  const when = field.applicableWhen
  if (when === undefined) return false
  const held = draft[when.field]
  return typeof held !== 'string' || !when.oneOf.includes(held)
}

/**
 * Every field a draft leaves shut by a value gate, chains included.
 *
 * **Read off the whole draft and iterated to a fixed point, never off the name
 * of the field that changed.** The first build asked *what did this edit
 * shut*, one edge at a time, which cannot see a field gated on a field that is
 * itself gated: changing the root cleared the middle and left the leaf holding
 * a value behind a shut gate, the exact state the clearing exists to prevent.
 */
export function shutFields<TData>(
  fields: readonly FieldSpec<TData>[],
  draft: Readonly<Record<string, unknown>>,
): string[] {
  const shut = new Set<string>()
  const state: Record<string, unknown> = { ...draft }
  for (const _pass of fields) {
    const found = fields.filter((one) => !shut.has(one.name) && valueGateShut(one, state))
    if (found.length === 0) break
    for (const one of found) {
      shut.add(one.name)
      state[one.name] = emptyFor(one)
    }
  }
  return fields.filter((one) => shut.has(one.name)).map((one) => one.name)
}

/**
 * What a shut field is emptied to: the blank its own column holds.
 */
export function emptyFor<TData>(field: FieldSpec<TData>): unknown {
  return field.blank
}

/**
 * The draft with every shut field emptied, which is what a submit sends.
 */
export function sealed<TData>(
  fields: readonly FieldSpec<TData>[],
  draft: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const out = { ...draft }
  const shut = new Set<string>(shutFields(fields, draft))
  for (const field of fields) {
    if (shut.has(field.name)) out[field.name] = emptyFor(field)
  }
  return out
}

/**
 * `emptyEntryFor` lived here and is gone: it seeded a `required` free-text
 * field with `''` so Add could stamp a row straight into the table, which was
 * the whole of the remaining gap.
 */

// ---------------------------------------------------------------------------
// The tactic tiering
// ---------------------------------------------------------------------------

/**
 * This tactic's expected reference fields, or the default for an unmeasured one.
 */
export function tacticLinks(tiering: Tiering, tactic: string | undefined): readonly string[] {
  return tiering.tacticLinks[(tactic ?? '').trim().toLowerCase()] ?? tiering.defaultTacticLinks
}

/** Core, then always-clear, then this tactic's links - the dialog's group order. */
export function expectedFields(tiering: Tiering, tactic: string | undefined): string[] {
  return [...tiering.eventCore, ...tiering.eventAlwaysClear, ...tacticLinks(tiering, tactic)]
}

/**
 * An entry as the gap rules see it: the three fields they consult by name.
 */
export interface GappableEntry {
  kind?: string
  /**
   * **`| undefined` explicitly, because an action has no tactic at all.**
   */
  tactic?: string | undefined
  timeAssumed?: boolean | undefined
}

/**
 * Which of this entry's expected fields carry no value, in dialog order.
 */
export function missingExpected(tiering: Tiering, entry: GappableEntry): string[] {
  if ((entry.kind ?? 'event') !== 'event') return []
  const values = entry as Record<string, unknown>
  return expectedFields(tiering, entry.tactic).filter((name) => {
    if (name === 'time') return Boolean(entry.timeAssumed)
    const value = values[name]
    return Array.isArray(value) ? value.length === 0 : !value
  })
}

export interface EventTiers<TData> {
  core: FieldSpec<TData>[]
  alwaysClear: FieldSpec<TData>[]
  links: FieldSpec<TData>[]
  /** Everything else - what `N more fields` opens. */
  folded: FieldSpec<TData>[]
}

/**
 * The dialog's three groups and what the fold hides, for one tactic.
 */
export function tiersFor<TData>(
  form: FormSpec<TData>,
  tiering: Tiering,
  tactic: string,
  values: Partial<TData>,
): EventTiers<TData> {
  const all = fieldsOf(form).filter((field) => field.footerRow !== true)
  const byName = new Map<string, FieldSpec<TData>>(all.map((field) => [field.name, field]))
  const expected = new Set(expectedFields(tiering, tactic))
  const filled = (field: FieldSpec<TData>) => {
    const value = (values as Record<string, unknown>)[field.name]
    return Array.isArray(value) ? value.length > 0 : Boolean(value)
  }
  const pick = (names: readonly string[]) =>
    names.flatMap((name) => {
      const field = byName.get(name)
      return field ? [field] : []
    })

  return {
    core: pick(tiering.eventCore),
    alwaysClear: pick(tiering.eventAlwaysClear),
    links: [
      ...pick(tacticLinks(tiering, tactic)),
      ...all.filter((field) => !expected.has(field.name) && filled(field)),
    ],
    folded: all.filter((field) => !expected.has(field.name) && !filled(field)),
  }
}
