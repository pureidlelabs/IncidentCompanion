/**
 * That `/api/specs` is a document the React client can actually parse.
 *
 * **Asserts the client's contract, not the server's intent**: the keys
 * `ui/src/api/specs.ts` reads, spelled the way it reads them. The document is
 * fetched `raw`, so `event_core` is snake_case and `fullWidth` is not, and a
 * camelisation of the whole payload would pass a "has the key" check while
 * breaking the parse.
 *
 * **What it cannot see**: whether a form reads well on screen, and whether a
 * vocabulary's values are the right ones - only that every field naming one
 * resolves, and that nothing is served which no field names.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import type { z } from 'zod'
import { describe, expect, it } from 'vitest'

import { FORM_SCHEMAS, SpecsController } from './specs.controller.js'
import { COLLECTION_SCHEMAS } from '../domain/collections.js'
import { systemSchema } from '../domain/entities/system.js'
import { caseStatus } from '../db/schema/case.js'

const document_ = new SpecsController().specs() as Record<string, unknown>

/** The case form's field names, from the form the client now reads. */
function caseFormNames(): (string | undefined)[] {
  const forms = document_['forms'] as Record<string, { fields: { name?: string }[] }>
  return (forms['CASE_FIELDS']?.fields ?? []).map((one) => one.name)
}

/**
 * The forms `EntityCreateDialog` draws, which is the set that owes a tier.
 *
 * **Written out, and the list is the claim.** Deriving it from "every form
 * with a collection" would grow silently: `CASE_FIELDS` and the compliance
 * forms are drawn by their own screens and want no tier, so a derived list
 * would either demand one of them or - once relaxed to allow that - stop
 * demanding one of these.
 */
const STACKED_FORMS = [
  'SYSTEM_FIELDS',
  'ACCOUNT_FIELDS',
  'NETWORK_FIELDS',
  'MALWARE_FIELDS',
  'CLOUD_APP_FIELDS',
  'EVIDENCE_FIELDS',
  'IMPACT_FIELDS',
  'ACTION_FIELDS',
] as const

describe('the blank row a form publishes', () => {
  /**
   * **A field's declared default is what the blank row carries.**
   *
   * The blank row is what a client's optimistic append is completed from, so a
   * value the schema would refuse becomes a cache row that cannot be saved:
   * open its pencil before the refetch lands and every field is legal except
   * the ones nobody touched. Nothing caught it, because the server never
   * parses a blank row - it publishes one.
   *
   * Measured 2026-08-20: `blankRow` skipped a declared default of `null`
   * (`if (declared !== undefined && declared !== null)`) and fell through to
   * the empty value for the control kind, so every
   * `z.uuid().nullable().default(null)` was published as `""` and every
   * nullable timestamp with it. Nine forms, and the `""` is refused by the
   * same schema the row came from.
   *
   * **Not "the blank row parses".** It does not and should not: a required
   * field is empty in a blank row by definition, which is what blank means.
   * The claim is narrower and is the one the defect broke.
   */
  it.each(Object.keys(FORM_SCHEMAS))('%s carries each declared default', (name) => {
    const forms = document_['forms'] as Record<string, { blank?: Record<string, unknown> }>
    const form = forms[name]
    expect(form?.blank, `${name} publishes no blank row`).toBeTruthy()

    const shape = FORM_SCHEMAS[name]!.schema.shape
    let checked = 0
    for (const [field, sub] of Object.entries(shape)) {
      // `safeParse(undefined)` applies the declared default and nothing else,
      // so it answers "what does this field become when nobody supplies it"
      // without reaching into zod's internals for the wrapper.
      const applied = (sub as z.ZodType).safeParse(undefined)
      if (!applied.success || applied.data === undefined) continue
      checked += 1
      expect(form!.blank![field], `${name}.${field}`).toEqual(applied.data)
    }
    expect(checked, `${name} declares no defaults, so this asserted nothing`).toBeGreaterThan(0)
  })
})

describe('the tiers an entity dialog stacks', () => {
  /**
   * **Every stacked form opens all three surfaces, and its first field opens
   * one.**
   *
   * A form declaring none renders as one flat grid: no identity plate, and
   * every optional field drawn as a control rather than as a folded line. That
   * is a legible screen, which is exactly why nothing else would catch it -
   * the dialog cannot tell "this form wants no tiers" from "somebody added a
   * schema and forgot". And a form whose *first* field declares nothing puts
   * the fields before the first marker into whichever tier the fallback names,
   * which is silent in the same way.
   */
  it.each(STACKED_FORMS)('%s declares identity, assessment and detail', (name) => {
    const forms = document_['forms'] as Record<
      string,
      { fields: ({ name?: string; tier?: string } | { section: unknown })[] }
    >
    const fields = (forms[name]?.fields ?? []).filter(
      (one): one is { name?: string; tier?: string } => !('section' in one),
    )
    expect(fields.length, `${name} is not served at all`).toBeGreaterThan(0)
    expect(fields[0]?.tier, `${name}'s first field opens no tier`).toBe('identity')
    expect(new Set(fields.map((one) => one.tier).filter(Boolean))).toEqual(
      new Set(['identity', 'assessment', 'detail']),
    )
  })

  /**
   * **A tier is opened once.** Declaring one twice reads as a group being
   * reopened, and the group-by has no such thing: the second marker silently
   * appends to the first group, in the order the schema happens to list them.
   */
  it.each(STACKED_FORMS)('%s opens each tier exactly once', (name) => {
    const forms = document_['forms'] as Record<string, { fields: { tier?: string }[] }>
    const opened = (forms[name]?.fields ?? []).map((one) => one.tier).filter(Boolean)
    expect(opened).toEqual([...new Set(opened)])
  })
})

describe('the specs document', () => {
  /**
   * **Every kind a form is drawn with has to be in the list served beside it.**
   * The renderer's `switch` ends in a `default` that builds a text input, so a
   * kind the client has never heard of renders as a plain box and posts a
   * string -- and `field_kinds` is the only thing a client can check against.
   *
   * The two declarations of that closed set are `FieldKind` in `field-spec.ts`
   * and `FIELD_KINDS` in `tiering.ts`, and nothing compared them: a kind added
   * to the union alone typechecks, serves, and renders as a text box with
   * every suite green. This asserts the property rather than the pair, so it
   * holds however the two are arranged.
   */
  it('serves no field whose kind is missing from the kinds it publishes', () => {
    const served = new Set(document_['field_kinds'] as string[])
    const forms = document_['forms'] as Record<string, { fields: { name?: string; kind?: string }[] }>

    const orphans: string[] = []
    for (const [form, spec] of Object.entries(forms)) {
      for (const one of spec.fields ?? []) {
        if (one.kind && !served.has(one.kind)) orphans.push(`${form}.${one.name ?? '?'} -> ${one.kind}`)
      }
    }

    expect(orphans, 'a form field carries a kind the document does not publish').toEqual([])
    expect(served.size).toBeGreaterThan(5)
  })

  /**
   * The parse order in `parseSpecs`. Listed rather than deep-equalled: the
   * point is that none is *absent*, and a value check would go stale every
   * time a form gains a field.
   */
  it.each([
    ['forms'],
    ['vocabularies'],
    ['case'],
    ['tiering'],
    ['field_tones'],
    ['field_kinds'],
    ['compliance'],
  ])('carries %s', (key) => {
    expect(document_[key]).toBeDefined()
  })

  it('gives case and compliance the shape the parser walks into', () => {
    // `.fields.map` and `.writable.map` - an empty object here throws exactly
    // as a missing key does, which is the failure this whole file exists for.
    //
    // **Present-and-walkable, not present-and-empty.** `case` was empty while
    // the form was unbuilt; it is served now, so the assertion is the shape
    // rather than the emptiness - which is what it was always for. The form
    // itself moved into `forms.CASE_FIELDS`, so `case` is the write list
    // alone and the walkable-fields half is asserted through the form.
    const caseBlock = document_['case'] as Record<string, unknown>
    expect(Array.isArray(caseBlock['writable'])).toBe(true)
    const forms = document_['forms'] as Record<string, { fields: unknown[] }>
    expect(Array.isArray(forms['CASE_FIELDS']?.fields)).toBe(true)
    // Compliance is served now too, so the same re-anchoring applies: every
    // card has to name a form the parser can find, since `parseCompliance`
    // dereferences `forms[card.form].fields` without checking.
    const compliance = document_['compliance'] as {
      cards: { title: string; form: string; form_off: string | null }[]
      forms: Record<string, { fields: unknown[] }>
    }
    expect(compliance.cards.length).toBeGreaterThan(0)
    for (const card of compliance.cards) {
      expect(Array.isArray(compliance.forms[card.form]?.fields), card.title).toBe(true)
      if (card.form_off !== null) {
        expect(Array.isArray(compliance.forms[card.form_off]?.fields), card.title).toBe(true)
      }
    }
  })

  /**
   * The case's own form, which the Overview screen is entirely made of.
   *
   * **It was served empty and the screen rendered fine** - a form with no
   * fields draws a heading and nothing else, so nothing anywhere went red
   * while the whole of a case's detail was missing.
   */
  it('describes the case form the Overview screen draws', () => {
    const named = caseFormNames().filter(Boolean)
    expect(named).toContain('title')
    expect(named).toContain('detectionGap')
    expect(named).toContain('openedAt')
  })

  it('keeps closedAt writable and undrawn, and the rsit pair out of both', () => {
    // `closedAt` is stamped on close, so a control for it would need gating on
    // another field's value - which a descriptor cannot express. The rsit pair
    // validates together and goes through its own route, so a client must not
    // think a case PATCH can carry either.
    const caseBlock = document_['case'] as { writable: string[] }
    const named = caseFormNames()
    expect(caseBlock.writable).toContain('closedAt')
    expect(named).not.toContain('closedAt')
    for (const paired of ['rsitClass', 'rsitType']) {
      expect(named, `${paired} is a paired write`).not.toContain(paired)
      expect(caseBlock.writable, `${paired} is a paired write`).not.toContain(paired)
    }
  })

  it('spells tiering the way the client reads it, not the way TypeScript would', () => {
    // snake_case, because the document is fetched raw. A camelised `eventCore`
    // reaches `parseSpecs` as undefined and `.map` throws.
    const tiering = document_['tiering'] as Record<string, unknown>
    expect(Object.keys(tiering).sort()).toEqual([
      'default_tactic_links',
      'event_always_clear',
      'event_core',
      'tactic_links',
    ])
  })

  /**
   * **Named the way the client asks for them.** `formSpec(specs,
   * 'EVENT_FIELDS')` throws on a missing key at *render* time, which the
   * section's error boundary catches - so a tidier name reads as "this section
   * stopped rendering" rather than as a bad request.
   */
  it('keys the forms by the constant names the sections ask for', () => {
    const forms = document_['forms'] as Record<string, unknown>
    for (const name of Object.keys(forms)) {
      expect(name, `${name} is not a *_FIELDS constant name`).toMatch(/^[A-Z][A-Z_]*_FIELDS$/)
    }
    // Every one the client asks for.
    expect(Object.keys(forms).sort()).toEqual([
      'ACCOUNT_FIELDS',
      'ACTION_FIELDS',
      'CASENOTE_FIELDS',
      'CASE_FIELDS',
      'CLOUD_APP_FIELDS',
      'EVENT_FIELDS',
      'EVIDENCE_FIELDS',
      'IMPACT_FIELDS',
      'MALWARE_FIELDS',
      'METHOD_FIELDS',
      'NETWORK_FIELDS',
      'SYSTEM_FIELDS',
      'TIMELINE_ACTION_FIELDS',
    ])
  })

  /**
   * **A field a schema declares and the reference drops leaves no trace.**
   * `serialise` walks the schema's own shape and skips anything with no entry
   * in the field registry -- `if (!meta) continue` -- so a field added without
   * one is absent from the reference, absent from the screen drawn out of it,
   * and absent from any complaint.
   *
   * The requirement is that a description gaining a field gains it in the
   * reference *without anybody writing it down*. That holds only while every
   * declared field is registered, which is what this asserts, per form and
   * against the form's own schema rather than a list kept here.
   */
  it.each(Object.keys(FORM_SCHEMAS))('%s describes every field its schema declares', (name) => {
    const forms = document_['forms'] as Record<string, { fields: { name?: string }[] }>
    const published = new Set(
      (forms[name]?.fields ?? []).map((one) => one.name).filter((one) => one !== undefined),
    )
    /**
     * **A discriminator is not a field.** `timelineWriteSchema` is a union
     * discriminated on `kind`, whose branches declare it as `z.literal`. It
     * has one possible value, the client chooses the branch rather than the
     * value, and there is nothing for a control to offer -- so it is excluded
     * by what it is rather than by being named here, which is what keeps a
     * second discriminator from needing an edit.
     */
    const declared = Object.entries(FORM_SCHEMAS[name]!.schema.shape)
      .filter(([, sub]) => (sub as { def?: { type?: string } }).def?.type !== 'literal')
      .map(([field]) => field)

    expect(declared.length, `${name} declares no fields, so this asserts nothing`).toBeGreaterThan(0)

    const dropped = declared.filter((field) => !published.has(field))
    expect(
      dropped,
      `${name} declares these and the reference does not describe them -- a field with no ` +
        'registry entry is skipped in silence, so the screen drawn from this document has ' +
        'no control for it and nothing reports the gap',
    ).toEqual([])
  })

  /**
   * **The published values are the values, not a copy of them.** The
   * vocabulary case below asserts every named vocabulary resolves to
   * *something*, which a stale list satisfies: options that are wrong are
   * still options.
   *
   * `caseStatus` is the one entry in the controller's vocabulary map written
   * as a literal rather than read from a vocabulary constant, so it is the one
   * that can drift, and the requirement is explicit that there must be no step
   * at which somebody transcribes anything into the reference.
   *
   * Compared against the database's own enum, which is the declaration a write
   * is checked against -- comparing it to the controller's own map would be
   * the constant checked against itself.
   */
  it('publishes the case states the store actually accepts', () => {
    const forms = document_['forms'] as Record<string, { fields: Record<string, unknown>[] }>
    const [field] = Object.values(forms)
      .flatMap((form) => form.fields)
      .filter((one) => one['vocabulary'] === 'caseStatus')

    expect(field, 'no field names the caseStatus vocabulary, so this asserts nothing').toBeDefined()

    expect(
      [...(field!['options'] as string[])].sort(),
      'the reference publishes case states the store does not accept, or omits ones it ' +
        'does -- a hand-written list beside the enum that decides a write',
    ).toEqual([...caseStatus.enumValues].sort())
  })

  /**
   * Every vocabulary a field names has to resolve, or the select renders with
   * no options and the analyst cannot answer a required field at all - which
   * looks like a disabled control rather than a missing list.
   */
  it('inlines options for every field that names a vocabulary', () => {
    const forms = document_['forms'] as Record<string, { fields: Record<string, unknown>[] }>
    const named = Object.values(forms)
      .flatMap((form) => form.fields)
      .filter((field) => 'vocabulary' in field)
    expect(named.length).toBeGreaterThan(0)
    for (const field of named) {
      expect(field['options'], `${String(field['vocabulary'])} resolved to nothing`).not.toEqual([])
    }
  })

  /**
   * The client's committed copy of this document, against the document.
   *
   * **`ui/src/fixtures/specs.json` feeds real client tests**, so a drifted
   * fixture is a second description of the contract rather than a capture of
   * it - and client tests stay green against fields `server/src` does not
   * have.
   *
   * Compared as parsed JSON, so re-indenting the file is not a failure and a
   * changed value is.
   */
  it('is what the client has committed as its fixture', () => {
    const path = fileURLToPath(new URL('../../../ui/src/fixtures/specs.json', import.meta.url))
    const committed = JSON.parse(readFileSync(path, 'utf8')) as unknown
    expect(
      committed,
      'stale: npx tsx scripts/dump-specs.ts ../ui/src/fixtures/specs.json',
    ).toEqual(document_)
  })

  /**
   * **A gated field carries the blank the dialog seals it to.**
   *
   * `is what the client has committed as its fixture` catches this too, and
   * its own message tells the reader to regenerate the fixture - which turns
   * this tier green with the contract broken. A guard whose remedy is to
   * overwrite the thing it guards is worth naming separately.
   *
   * The value is the column's own blank, so a table keyed on the control kind
   * cannot stand in for it. -> `blankOf`
   */
  it('serves a blank beside every gate', () => {
    const gated: string[] = []
    const forms = document_['forms'] as Record<string, { fields: Record<string, unknown>[] }>
    for (const [form, spec] of Object.entries(forms)) {
      for (const entry of spec.fields) {
        if (!('applicableWhen' in entry)) continue
        const where = `${form}.${String(entry['name'])}`
        gated.push(where)
        expect(entry, `${where} is gated and serves no blank`).toHaveProperty('blank')
      }
    }
    expect(gated, 'no served field declares a gate - this test measured nothing').not.toEqual([])
  })

  /**
   * The other direction, which the check above cannot see: it walks the fields
   * and asks whether each resolves, so a vocabulary nobody asks for passes by
   * not being looked at.
   *
   * Goes red when a field is dropped and its options are left behind.
   */
  it('serves no vocabulary that no field names', () => {
    /**
     * **Every place a field can live, not just `forms`.** `case.fields` and
     * `compliance` carry fields too, and walking only `forms` reports three
     * live vocabularies as unused.
     */
    const walk = (node: unknown, into: Set<string>): void => {
      if (Array.isArray(node)) {
        for (const one of node) walk(one, into)
        return
      }
      if (node === null || typeof node !== 'object') return
      const record = node as Record<string, unknown>
      if (typeof record['vocabulary'] === 'string') into.add(record['vocabulary'])
      for (const value of Object.values(record)) walk(value, into)
    }
    const named = new Set<string>()
    for (const key of ['forms', 'case', 'compliance']) walk(document_[key], named)
    expect(named.size, 'the walk found no field naming any vocabulary').toBeGreaterThan(5)

    /**
     * **Named, with a reason, or it fails** - the shape `INSTALL_ROUTES` uses
     * in the case-route sweep. A vocabulary may legitimately be served before
     * the field that names it exists; what may not happen is one surviving a
     * field's deletion by nobody noticing. Writing it here makes the first
     * case a decision and leaves the second red.
     *
     * `verisAction`: `domain/entities/case-facts.ts` declares `incidentClass`
     * against it and nothing imports that module yet - ENISA RSIT is
     * first-class in the parked compliance design.
     */
    const SERVED_AHEAD_OF_THEIR_FIELDS: ReadonlySet<string> = new Set(['verisAction'])

    const served = Object.keys(document_['vocabularies'] as Record<string, unknown>)
    expect(
      served.filter((key) => !named.has(key) && !SERVED_AHEAD_OF_THEIR_FIELDS.has(key)),
      'a vocabulary nothing names is payload no screen can use',
    ).toEqual([])

    // A stale exemption is the same hole with a delay on it: once the field
    // lands, this entry stops describing anything and quietly covers whatever
    // loses its field next.
    expect(
      [...SERVED_AHEAD_OF_THEIR_FIELDS].filter((key) => named.has(key)),
      'this vocabulary has a field now - drop it from the list',
    ).toEqual([])
  })

  /**
   * **Every reference names a collection the API actually serves.**
   *
   * Checked against `COLLECTION_SCHEMAS` rather than a list written here: a
   * list is a second description of the roster and goes stale in the direction
   * that passes. A picker built from a name nothing serves fetches a 404 and
   * renders as a control with no options, which reads as "this case has no
   * hosts" rather than as a broken reference.
   */
  it('names a real collection on every reference field', () => {
    const forms = document_['forms'] as Record<string, { fields: Record<string, unknown>[] }>
    const refs = Object.values(forms)
      .flatMap((form) => form.fields)
      .filter((field) => 'ref' in field)
      .map((field) => field['ref'] as { collection: string; target: string })

    expect(refs.length).toBeGreaterThan(0)
    const served = new Set([...Object.keys(COLLECTION_SCHEMAS), 'timeline'])
    const unknown = [...new Set(refs.map((ref) => ref.collection))].filter(
      (name) => !served.has(name),
    )
    expect(unknown, 'a reference field points at a collection nothing serves').toEqual([])
  })

  /**
   * **`target` is the screen key, and it is not the collection.**
   *
   * The client resolves a reference's link, its hover card and its "Open in ..."
   * through `ENTITY_TARGETS`, which is keyed by `system` / `cloud_app` - not by
   * `systems` / `cloud_apps`. Serving the collection in both fields collapses a
   * distinction the client depends on, and every reference cell then resolves
   * to nothing.
   */
  it('serves a screen key on a reference, distinct from its collection', () => {
    const forms = document_['forms'] as Record<string, { fields: Record<string, unknown>[] }>
    const refs = Object.values(forms)
      .flatMap((form) => form.fields)
      .filter((field) => 'ref' in field)
      .map((field) => field['ref'] as { collection: string; target: string })

    /**
     * **The mapping has to be total, and that is the checkable half.** A
     * collection with no screen key falls through to its own plural name,
     * which is a target the client has never heard of - and it falls through
     * *silently*, which is how a seventh collection would arrive broken.
     *
     * `malware` and `evidence` are their own screen keys, so "every target
     * differs from its collection" is not the property; it was asserted that
     * way first and failed on the two that are legitimately the same.
     */
    const SAME_BY_NATURE = new Set(['malware', 'evidence'])
    const fellThrough = refs
      .filter((ref) => ref.target === ref.collection && !SAME_BY_NATURE.has(ref.collection))
      .map((ref) => ref.collection)
    expect(
      [...new Set(fellThrough)],
      'no screen key for these, so the client resolves the reference to nothing',
    ).toEqual([])

    // And the two fields are not simply the same value everywhere, which the
    // check above would pass on if every collection were its own key.
    expect(refs.some((ref) => ref.target !== ref.collection)).toBe(true)
  })

  /**
   * **A field's default is served, because the dialog posts it.** A missing
   * one is not "sending less" - the analyst is shown a blank where the write
   * stores `unknown`.
   *
   * Checked against the Zod schema's own defaults rather than a list, since
   * the schema is where a default is declared.
   */
  it('carries the default of every field whose schema declares a value', () => {
    /**
     * **Only the defaults that put a value in the control.** `''`, `false` and
     * `null` are what a control already shows when nothing is set, so serving
     * them adds keys the analyst never touched. `verdict: 'unknown'` is the
     * case that matters - shown, and stored by the write.
     */
    const declared = Object.entries(systemSchema.shape)
      .filter(([, sub]) => sub.def.type === 'default')
      .filter(([, sub]) => {
        const value = (sub as unknown as { def: { defaultValue: unknown } }).def.defaultValue
        const resolved = typeof value === 'function' ? (value as () => unknown)() : value
        return resolved !== '' && resolved !== false && resolved !== null
      })
      .map(([name]) => name)
    expect(declared).toEqual(['verdict', 'analysisStatus', 'zone'])

    const forms = document_['forms'] as Record<string, { fields: Record<string, unknown>[] }>
    const fields = forms['SYSTEM_FIELDS']!.fields
    const missing = declared.filter((name) => {
      const field = fields.find((one) => one['name'] === name)
      return field && !('default' in field)
    })
    expect(missing, 'the create dialog will show a blank and store a value').toEqual([])

    // And the empty ones are genuinely absent, or the rule above is prose.
    const served = fields.filter((one) => 'default' in one).map((one) => one['name'])
    expect(served).toEqual(['verdict', 'analysisStatus', 'zone'])
  })

  /**
   * The other half: a field the schema makes required is marked, or the dialog
   * lets a submit through that the server then refuses.
   */
  it('marks the fields a schema requires', () => {
    const forms = document_['forms'] as Record<string, { fields: Record<string, unknown>[] }>
    const hostname = forms['SYSTEM_FIELDS']!.fields.find((one) => one['name'] === 'hostname')
    expect(hostname?.['required'], 'hostname is required and is not marked').toBe(true)

    const optional = forms['SYSTEM_FIELDS']!.fields.find((one) => one['name'] === 'tags')
    expect(optional?.['required'], 'tags is optional and is marked required').toBeUndefined()
  })
})

/**
 * The blank row each form serves, which is what a client's optimistic append
 * is built on.
 *
 * **These are the assertions the client tier cannot make.** It can prove its
 * hook uses the blank; only here can it be shown that the blank is *complete*
 * and holds nothing a reader will trip over.
 */
describe('the blank row a form carries', () => {
  const forms = document_['forms'] as Record<
    string,
    { collection: string; fields: { name?: string }[]; blank: Record<string, unknown> }
  >

  /**
   * **Section markers ride in the field list**, in draw order, and carry no
   * name - so a `.map(one => one.name)` over the list yields `undefined` for
   * each heading. Filtering them here rather than widening the assertion,
   * because a genuinely nameless *field* should still fail.
   */
  const drawnIn = (key: string): string[] =>
    forms[key]!.fields.map((one) => one.name).filter((name): name is string => name !== undefined)

  /** The fields whose own schema answers `null` when nobody supplies a value. */
  const declaredNulls = (key: string): Set<string> => {
    // **`FORM_SCHEMAS`, not `COLLECTION_SCHEMAS`.** The latter omits the
    // timeline's two write schemas on purpose, so keying by collection found
    // no shape for them and every declared null read as a surprise one.
    const shape = FORM_SCHEMAS[key]?.schema.shape
    if (!shape) return new Set<string>()
    return new Set(
      Object.entries(shape)
        .filter(([, sub]) => {
          const applied = (sub as z.ZodType).safeParse(undefined)
          return applied.success && applied.data === null
        })
        .map(([name]) => name),
    )
  }

  it.each(Object.keys(forms))('%s carries one', (key) => {
    expect(forms[key]!.blank).toBeDefined()
  })

  /**
   * **The gap `zeroFor` cannot fill, made loud.** A field it has no zero for
   * gets `null`, and `null.trim()` throws exactly like the `undefined` this
   * whole mechanism exists to stop - so the day one appears, this fails rather
   * than the analyst's section going blank.
   *
   * **"No *surprise* null", not "no null".** A blank row honours a declared
   * `z.uuid().nullable().default(null)`, so forbidding every null would make
   * the row publish `""` for a value the schema refuses -- in the row an
   * optimistic append is completed from. What is forbidden is a field whose
   * schema never declared `null` becoming one, which is the case `zeroFor`
   * cannot answer.
   */
  it.each(Object.keys(forms))('%s is null only where its schema says so', (key) => {
    const declared = declaredNulls(key)
    const nulls = Object.entries(forms[key]!.blank)
      .filter(([, value]) => value === null || value === undefined)
      .map(([name]) => name)
    expect(nulls.filter((name) => !declared.has(name)), `${key} has no zero for these`).toEqual([])
  })

  /**
   * **Every field the form draws, or the row is still incomplete where it
   * matters.** The dialog drops blanks, so precisely the fields it draws are
   * the ones that can go missing from an optimistic row.
   */
  it.each(Object.keys(forms))('%s covers every field it draws', (key) => {
    const missing = drawnIn(key).filter((name) => !(name in forms[key]!.blank))
    expect(missing, `${key} draws fields its blank does not carry`).toEqual([])
  })

  it('holds the declared default where there is one, not a zero', () => {
    // The reason the blank is the *schema's* and not a zero-fill: a row that
    // appears as `unknown` and refetches as `unknown` does not change under
    // the analyst when the request settles.
    expect(forms['SYSTEM_FIELDS']!.blank['verdict']).toBe('unknown')
    expect(forms['SYSTEM_FIELDS']!.blank['zone']).toBe('external')
  })

  it('holds the blanks the field list deliberately omits', () => {
    // `default` is served only when it puts a visible value in the control, so
    // `''` and `false` are absent there by design. This is the half that needs
    // them, and reading it off the same schema is what keeps the two in step.
    expect(forms['SYSTEM_FIELDS']!.blank['tags']).toBe('')
    expect(forms['SYSTEM_FIELDS']!.blank['isolated']).toBe(false)
  })
})
