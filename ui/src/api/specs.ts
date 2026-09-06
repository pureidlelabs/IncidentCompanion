/**
 * `GET /api/specs`, typed - what every form contains, in what order, and what
 * a select offers.
 *
 * One request per session under `staleTime: Infinity`: the document is built
 * from the server's own entity schemas, which are module constants, so it
 * cannot change while the server process lives.
 * -> `server/src/specs/specs.controller.ts`
 *
 * Fetched with `raw: true` and camelised here one level deep, because keys and
 * several values in this document are data rather than field names.
 *
 * A derived kill chain phase, `closedAt` and the `rsitClass`/`rsitType` pair
 * are not carried. `specsResidual.ts` holds the reason, and a client rendering
 * `case.fields` blind never offers a control for them.
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
 *
 * Written out rather than `string`: the form renderer ends in a bare `else`
 * that builds a text input, so an unknown kind renders as a textbox instead of
 * failing. `specs.test.ts` holds the served list equal to this one and is the
 * only place a new kind announces itself.
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
 *
 * `collection` is the URL segment `GET /api/cases/{id}/{collection}` takes, so
 * a client resolves the names itself. There are no `options` on a reference
 * field and there never will be - a static list of the open case's hosts is a
 * list of nothing.
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
 *
 * `TData` is the caller's assertion that this form's names are keys of that
 * entry type - the same assertion `fromWire<T>` makes about a response body,
 * and made in one place (`formSpec`) rather than at every call site. Unknown
 * keys survive as `extra`: the route copies through any key a spec carries,
 * and dropping one silently is the mirror's failure mode.
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
   *
   * **The server's own union, not a copy of it.** Re-spelling the three names
   * here compiles clean against a fourth added server-side, and then hands
   * `entityTiers` a bucket that does not exist.
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
   *
   * **The schema's refusal is generated from this same declaration**, so the
   * rule that greys the control here and the rule that refuses the write on
   * the server are one thing rather than two that could disagree.
   */
  applicableWhen?: { field: string; oneOf: readonly string[] }
  /**
   * What this field holds when it is empty, served only beside a gate.
   *
   * The server parses the column to get it, so it is in the shape the column
   * stores - `null` for a reference or a count, `''` for text, `[]` for a
   * multi-reference. A table keyed on the control kind cannot answer this.
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
   *
   * **What an optimistic append is built on.** A create dialog drops every
   * blank before it posts, so a cache row spread from the submitted fields
   * alone is *missing* whatever the analyst left empty - and one
   * `entry.someField.trim()` takes the section to the error boundary with zero
   * rows showing. -> `optimisticRow.ts`
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
 *
 * The two vocabularies overlap without agreeing: `select`, `text`, `number`
 * and `event_datetime` mean the same thing in both, a tickbox is `check` here
 * and `checkbox` there, and `ground`, `multi_csv` and `multi_lines` exist only
 * here. Validating a compliance field against `FIELD_KINDS` calls four of
 * these eight unknown.
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
 *
 * `computedFrom` names the field this one's vocabulary is rebuilt from, and
 * arrives *instead of* `options` - DORA 4.3's list depends on which 4.2 causes
 * are chosen, and a static copy would offer causes the case does not owe.
 * A field carrying it has no vocabulary this client can offer, so it renders
 * read-only.
 */
export interface ComplianceFieldSpec {
  /**
   * **A compliance column, not a case one.** The regulatory fields are
   * `case_compliance`, a row with its own version, and the form reads
   * `record[spec.name]` off that record - so naming the case's keys here types
   * the whole compliance screen against the wrong table.
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
 *
 * `formOff` is what the card renders when `regime` is switched off, and `null`
 * means the card is not rendered at all. **Evaluated against `GET /api/regimes`,
 * never against this document** - the switches are install preferences that
 * change while the server runs, and this document is cached for the session.
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
 *
 * **Two axes, both served.** `tone` names a colour role; `fill` says whether
 * anything is wrong here -- filled is adverse, hollow is "nothing is, or it is
 * explained". Neither is decided here: the server owns which value takes which
 * role, and `components/blocks/field-tones.ts` owns what a role looks like, so
 * a new classification value needs no client change at all.
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
 *
 * Use this rather than an inline `= {}` on a component's own signature: a
 * default parameter expression runs on every call, and the fresh identity
 * rebuilds every column it gates.
 */
export const EMPTY_FIELD_TONES: Specs['fieldTones'] = {}

type Wire = Record<string, unknown>

/**
 * Keys whose *value* is a field name rather than data.
 *
 * This set is the load-bearing half of the boundary and the half `fromWire`
 * cannot do: it rewrites keys, and a field name in this document travels as a
 * value at least as often as it travels as a key. Adding `collection` here
 * because it also looks like a name is the mistake
 * `leaves the target collection as the URL segment the API takes` exists to
 * catch - a camelised `network_indicators` is a table the API has never heard
 * of, and the symptom is a 404 the moment someone opens a reference.
 *
 * **Only the keys the wire actually spells in snake_case belong here.** A key
 * the wire already spells camel matches nothing and reads as coverage that is
 * not there.
 *
 * **`applicableWhen` carries its field name one level down and is never reached**,
 * because `parseField` does not descend - correct while the value is camel on
 * the wire, and the thing to check first if a nested name ever arrives snake.
 */
const NAME_VALUED = new Set(['name', 'computed_from'])

/**
 * One descriptor, camelised one level deep.
 *
 * **Never recursive.** `options`, `option_labels`, `colour_map` and `ref` are
 * keyed and valued by data - option values, vocabulary members, a URL segment -
 * and descending into them would rewrite an option containing an underscore
 * with no way back. Adding an explicit opaque-key list, or rebuilding `ref` by
 * hand, changes nothing: this loop does not descend.
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
 *
 * Parsed through `parseField`'s loop rather than a second one: the descriptors
 * are served in the entity forms' shape precisely so one camelisation covers
 * both, and `computed_from` travels as a *field name*, so it joins `NAME_VALUED`
 * above rather than getting a rewrite of its own here.
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
 *
 * `enabled` is `GET /api/regimes`' answer, keyed by regime - passed in rather
 * than read here, so this stays a pure function a test can drive across every
 * combination of switches without a fetch.
 *
 * A card whose regime is off falls to `formOff` and is dropped when there is
 * none. **An unknown regime resolves to off**, not on.
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
 *
 * `staleTime: Infinity` and no refetch: the document is built from module
 * constants at import, so the only thing that changes it is a server restart.
 * Polling it would be one request per window focus for a body that is provably
 * identical.
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

/**
 * One form, by the name the server publishes it under (`SYSTEM_FIELDS`,
 * `EVENT_FIELDS`).
 *
 * The key is the served constant's name because that is the only name these
 * lists have; a slug invented client-side would be a second vocabulary.
 * `TData` is an assertion, unchecked here for the same reason `fromWire<T>`'s
 * is - there is nothing to infer it from.
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
 *
 * **A map rather than a transformation, for `ENTITY_TARGETS`' reason.**
 * `systems` is `SYSTEM_FIELDS`, `network_indicators` is `NETWORK_FIELDS` and
 * `cloud_apps` is `CLOUD_APP_FIELDS` -- singular, truncated and expanded
 * respectively, so any rule derived from three of them is wrong about the
 * fourth.
 *
 * A caller reaching a collection that is absent gets `undefined` and decides
 * for itself; `reviewModel.test.ts` says why nothing here can check the map
 * against `IMPORTABLE` from this tier.
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

export function formNameFor(collection: string): string | undefined {
  return (COLLECTION_FORMS as Record<string, string>)[collection]
}

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
 *
 * The markers ride *in order* inside `fields` (see `SectionMarker`), so the
 * grouping is the served form's own and not a second layout decision - a
 * heading added to `TIMELINE_ACTION_FIELDS` appears here without a client
 * change. Used by the forms that have no measured tiering of their own; the
 * event dialog ignores it, because its three groups come from the served
 * `TACTIC_LINKS` rather than from the markers.
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

export function labelsOf<TData>(form: FormSpec<TData>): Record<string, string> {
  return Object.fromEntries(fieldsOf(form).map((field) => [field.name, field.label]))
}

/**
 * A label with its parenthetical dropped: "Description (title)" -> "Description".
 *
 * The parenthetical is help for someone filling the field in, and noise in a
 * column header scanned down eighty rows. **A label's brackets are the strip
 * point**, so an example written as a comma clause survives into every gap
 * count.
 */
export function shortLabel(label: string): string {
  return label.split(' (')[0] ?? label
}

export function isReference<TData>(field: FieldSpec<TData>): boolean {
  return field.ref !== undefined
}

/**
 * Whether a draft leaves this field shut, by either gate it may declare.
 *
 * **Two gates, one answer**, so no caller has to remember there are two:
 * `enabledBy` names a checkbox the analyst ticks, `applicableWhen` names the
 * values of another field that give this one a meaning. A field declaring
 * neither is never shut.
 *
 * The comparison is on the stored value, which is what a select holds - a
 * vocabulary's label is the analyst's spelling of it and is not what the
 * schema refines on.
 *
 * **Anything that is not a string leaves the gate shut**, rather than being
 * coerced into one. A vocabulary is strings, so a gate pointed at a checkbox
 * or a reference is a mis-declaration - and `String(value)` would answer
 * `[object Object]`, which matches nothing and reads as a value that was
 * compared.
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
 *
 * **Only the value gate empties a field, and the split is deliberate.** A
 * checkbox is the analyst's own toggle and they may tick it back within the
 * same edit, so its field's value is theirs to keep - emptying on it would
 * post a blank over every unticked row's timestamp on every unrelated edit. A
 * value gate says the field means nothing for the kind now chosen, and there
 * is no reading under which the old value survives.
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
 * of the field that changed.** Asking *what did this edit shut*, one edge at a
 * time, cannot see a field gated on a field that is itself gated: changing the
 * root clears the middle and leaves the leaf holding a value behind a shut
 * gate, the exact state the clearing exists to prevent.
 *
 * **One pass is not enough either**, which is the half that is easy to miss: a
 * leaf's gate reads the middle's *value*, so the middle has to be emptied
 * before the leaf can be seen to be shut. The loop is bounded by the field
 * count, so a schema that declares a cycle stops rather than hanging.
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
 *
 * **Served beside the gate rather than decided here.** A table keyed on the
 * control kind cannot answer the question, on either side of the wire: a
 * single-reference column refuses `''` and stores `null`, and a count stores
 * `null` for *not stated* where `0` is a real answer an analyst may mean. The server parses the column and puts the
 * result on the descriptor; `blankOf` in `@contract/field-spec` is the one
 * definition.
 *
 * Absent means the field declares no gate, so nothing seals it.
 */
export function emptyFor<TData>(field: FieldSpec<TData>): unknown {
  return field.blank
}

/**
 * The draft with every shut field emptied, which is what a submit sends.
 *
 * **Sealed at submit rather than cleared on each change.** Clearing on the way
 * out restores nothing on the way back in, so changing a kind and changing it
 * straight back - two clicks, no typing - wipes a stored value and Save posts
 * the wipe, with no whole-case undo to recover it. Nothing is touched while
 * the analyst is still editing; a value that ends the edit behind an open gate
 * is sent exactly as it was found.
 *
 * **It also has to run before the draft is validated**, or a row that already
 * carries a refused pair is locked out of editing entirely: the control is
 * disabled, so the analyst can neither correct it nor clear it, and every
 * other field on the row is held behind a refusal they cannot act on.
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
 * This tactic's expected reference fields, or the default for an unmeasured one.
 *
 * A tactic no demo case exercises, and an unset tactic on a freshly captured
 * line, both fall to the default rather than to an empty list: folding the
 * host away is what makes a dialog feel like it hid the field you wanted.
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
 *
 * No index signature - one would make every generated entry interface
 * unassignable, since none of them declares one. The remaining fields are read
 * through a single cast in `missingExpected`, which is the only place a name
 * from the tiering meets a value from a row.
 */
export interface GappableEntry {
  kind?: string
  /**
   * **`| undefined` explicitly, because an action has no tactic at all.** The
   * server projects a response record through its own schema, so the key is
   * absent rather than empty - and under `exactOptionalPropertyTypes` an
   * optional `string` does not accept one. Writing it out is what lets a
   * timeline row be handed here without a cast.
   */
  tactic?: string | undefined
  timeAssumed?: boolean | undefined
}

/**
 * Which of this entry's expected fields carry no value, in dialog order.
 *
 * **Derived on every read, never stored** - three write paths reach a timeline
 * entry, so a stored list is one stale queue the moment a fourth arrives.
 *
 * An `action` row answers to `TIMELINE_ACTION_FIELDS` and has no tactic, so it
 * yields nothing: without that check every SOC response in the case joins the
 * gap queue asking for a tactic it has no field to hold.
 *
 * `time` is never empty - the model places a timeless capture at now - so the
 * stored value cannot answer for it and `timeAssumed` has to. Drop that clause
 * and the one gap the design names explicitly never appears.
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
 *
 * **A populated field is never folded, whatever the tactic says.**
 * `expectedFields` reads the tiering and not the entry, so without this an edit
 * of a lateral-movement event that also carries `evidenceIds` would fold the
 * one reference the analyst can already see is answered. Populated extras join
 * the links group rather than opening a fourth: three headings is the shape the
 * design settled on.
 *
 * **A `footerRow` field enters none of the four groups.** They render in the
 * dialog's footer band, never in a column, so counting them would promise
 * three more fields than unfolding reveals.
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
