/**
 * That `/api/specs` is a document the React client can actually parse.
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
   * **A tier is opened once.**
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
   * The parse order in `parseSpecs`.
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
   * **Named the way the client asks for them.**
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
   */
  it.each(Object.keys(FORM_SCHEMAS))('%s describes every field its schema declares', (name) => {
    const forms = document_['forms'] as Record<string, { fields: { name?: string }[] }>
    const published = new Set(
      (forms[name]?.fields ?? []).map((one) => one.name).filter((one) => one !== undefined),
    )
    /**
     * **A discriminator is not a field.**
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
   * **The published values are the values, not a copy of them.**
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
   */
  it('serves no vocabulary that no field names', () => {
    /**
     * **Every place a field can live, not just `forms`.**
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
     * **Named, with a reason, or it fails** - the shape `INSTALL_ROUTES` uses in
     * the case-route sweep.
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

  it('serves a screen key on a reference, distinct from its collection', () => {
    const forms = document_['forms'] as Record<string, { fields: Record<string, unknown>[] }>
    const refs = Object.values(forms)
      .flatMap((form) => form.fields)
      .filter((field) => 'ref' in field)
      .map((field) => field['ref'] as { collection: string; target: string })

    /**
     * **The mapping has to be total, and that is the checkable half.**
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
   * **A field's default is served, because the dialog posts it.**
   */
  it('carries the default of every field whose schema declares a value', () => {
    /**
     * **Only the defaults that put a value in the control.**
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
 */
describe('the blank row a form carries', () => {
  const forms = document_['forms'] as Record<
    string,
    { collection: string; fields: { name?: string }[]; blank: Record<string, unknown> }
  >

  /**
   * **Section markers ride in the field list**, in draw order, and carry no name
   * - so a `.map(one => one.name)` over the list yields `undefined` for each
   * heading.
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
   * **The gap `zeroFor` cannot fill, made loud.**
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
   * matters.**
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
