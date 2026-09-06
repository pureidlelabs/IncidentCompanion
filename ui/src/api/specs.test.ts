import { describe, expect, it } from 'vitest'

import { bulkFieldsFor } from '@/components/blocks/bulk-actions'
import { specsFixture, specsWire } from '@/fixtures/specs'

import { initialDraft } from '@/components/blocks/entity-dialog'

import {
  COLLECTION_FORMS,
  FIELD_KINDS,
  emptyFor,
  fieldOf,
  fieldsOf,
  formSpec,
  gateClosed,
  isSection,
  parseSpecs,
  shortLabel,
  shutFields,
  tiersFor,
  type FieldKind,
  type FieldSpec,
} from './specs'
import { entityTiers, footerFields } from './dialogLayout'
import { PAIRED_WRITE_ONLY, WRITABLE_WITHOUT_A_SPEC } from './specsResidual'

/**
 * The `GET /api/specs` boundary, over the captured document.
 *
 * Everything here is asserted against `src/fixtures/specs.json` as the wire
 * sends it, because the failure this file exists to catch is a conversion -
 * and a fixture already converted to camelCase would keep passing after the
 * conversion broke. A field name in this document travels as a key *and* as a
 * value, which is what makes a blanket `fromWire` wrong for it.
 */

const wire = specsWire as {
  forms: Record<string, { fields: Record<string, unknown>[] }>
  tiering: { event_core: string[]; tactic_links: Record<string, string[]> }
  case: { writable: string[] }
}

describe('field names cross the boundary as camelCase, wherever they travel', () => {
  /**
   * **A descriptor name is camelCase after parsing, however it arrived.**
   *
   * It used to arrive snake_case and this asserted the conversion. The Node
   * server's field names *are* the Zod schema's keys, so they are already
   * camelCase on the wire and the conversion is a no-op for them - which is
   * the right end state, since every row the same API serves is camelCase too.
   *
   * The property is unchanged and still worth holding: what a screen reads a
   * field by has to match what the row carries, or `entry[field.name]` is
   * `undefined` for every value on the form.
   */
  it('names a descriptor the way the rows spell it', () => {
    const form = formSpec(specsFixture, 'EVENT_FIELDS')
    expect(fieldOf(form, 'eventSource')?.label).toBe('Telemetry source')
    expect(fieldOf(form, 'event_source')).toBeUndefined()

    // Nothing on a form is snake_case after parsing, whichever side converted.
    const snake = fieldsOf(form)
      .map((field) => field.name)
      .filter((name) => name.includes('_'))
    expect(snake).toEqual([])
  })

  it('camelises a name that arrives as a value, not a key', () => {
    // `tactic_links` maps a tactic to a list of *field names*. `fromWire`
    // rewrites keys only, so these would stay snake_case and every gap lookup
    // against a camelCase entry would miss - silently, as "nothing missing".
    expect(wire.tiering.tactic_links['command and control']).toEqual([
      'system_id',
      'network_indicator_ids',
    ])
    expect(specsFixture.tiering.tacticLinks['command and control']).toEqual([
      'systemId',
      'networkIndicatorIds',
    ])
    expect(specsFixture.tiering.eventCore).toContain('eventSource')
    // Re-anchored: this named `incidentReference`, which this backend has
    // never served - the fixture was a stale dump and the example outlived the
    // field. `detectionGap` is a live camelCase entry in the same list, so the
    // property survives with something the server actually declares.
    expect(specsFixture.case.writable).toContain('detectionGap')
  })

  it('leaves a tactic key and an option value alone', () => {
    // Keys of `tacticLinks` are tactics and its option values are vocabulary
    // members: data, not names. A recursive conversion would rewrite an
    // option containing an underscore, and there is no way back from that.
    expect(Object.keys(specsFixture.tiering.tacticLinks)).toContain('command and control')
    expect(specsFixture.vocabularies.zone).toContain('internal - server')
    expect(
      Object.values(specsFixture.vocabularies).flatMap((options) =>
        options.filter((option) => option.includes('_')),
      ),
    ).toEqual([])
  })
})

describe('a section marker rides in order inside the field list', () => {
  it('keeps the marker rather than dropping it to a flat field list', () => {
    const form = formSpec(specsFixture, 'SYSTEM_FIELDS')
    const markers = form.fields.filter(isSection)
    expect(markers.map((marker) => marker.section.title)).toEqual(['Classification', 'Mitigation'])
  })

  it('places it where the form declares it, between two named fields', () => {
    // Order is the whole content of a marker: hoisted to the top or appended,
    // it groups the wrong fields and nothing about the render fails.
    const form = formSpec(specsFixture, 'SYSTEM_FIELDS')
    const names = form.fields.map((entry) =>
      isSection(entry) ? `#${entry.section.title}` : entry.name,
    )
    expect(names.slice(0, 3)).toEqual(['hostname', '#Classification', 'systemType'])
  })

  it('drops markers from `fieldsOf`, which is what a form iterates', () => {
    const form = formSpec(specsFixture, 'SYSTEM_FIELDS')
    expect(form.fields).toHaveLength(12)
    expect(fieldsOf(form)).toHaveLength(10)
    expect(fieldsOf(form).every((field) => typeof field.name === 'string')).toBe(true)
  })
})

/**
 * These assert the *served shape*, not this module's conversion of it.
 *
 * Verified by planting the defect: no mutation of `specs.ts` reds them,
 * because the conversion is one level deep and every value here sits at depth
 * two. They stay because a screen reads `ref` to decide whether a control is a
 * picker or a chip list, and a route change that dropped `ref` or camelised
 * the collection would otherwise surface as a 404 in a browser rather than a
 * red test.
 */
describe('a reference field resolves against the case, never a vocabulary', () => {
  it('carries a ref and no options', () => {
    const field = fieldOf(formSpec(specsFixture, 'EVENT_FIELDS'), 'systemId')
    expect(field?.kind).toBe('device_select')
    expect(field?.options).toBeUndefined()
    expect(field?.ref?.target).toBe('system')
    expect(field?.ref?.multiple).toBe(false)
  })

  it('publishes arity, so a picker and a chip list are distinguishable', () => {
    const form = formSpec(specsFixture, 'EVENT_FIELDS')
    expect(fieldOf(form, 'accountIds')?.ref?.multiple).toBe(true)
    expect(fieldOf(form, 'sourceSystemId')?.ref?.multiple).toBe(false)
  })

  it('leaves the target collection as the URL segment the API takes', () => {
    // `network_indicators` camelised is a table `GET /api/cases/{id}/{name}`
    // has never heard of - a 404 the moment someone opens the reference.
    const field = fieldOf(formSpec(specsFixture, 'EVENT_FIELDS'), 'networkIndicatorIds')
    expect(field?.ref?.collection).toBe('network_indicators')
  })
})

describe('what a bulk edit may set is decided by kind', () => {
  it('offers every select and checkbox on the form, in the form order', () => {
    const fields = bulkFieldsFor(formSpec(specsFixture, 'SYSTEM_FIELDS'))
    expect(fields.map((field) => field.field)).toEqual([
      'systemType',
      'verdict',
      'analysisStatus',
      'zone',
      'isolated',
    ])
    expect(fields.map((field) => field.label)).toEqual([
      'Asset type',
      'Verdict',
      'Analysis status',
      'Zone',
      'Isolated',
    ])
  })

  it('refuses free text, a colour and a reference', () => {
    // "Set the description of these forty rows to the same string" destroys
    // forty rows in one click; a colour is per-entry; a reference resolves
    // against rows this dialog has not fetched.
    const offered = new Set(
      bulkFieldsFor(formSpec(specsFixture, 'EVENT_FIELDS')).map((field) => field.field),
    )
    expect(offered.has('description')).toBe(false) // text
    expect(offered.has('notes')).toBe(false) // textarea
    expect(offered.has('sourceTool')).toBe(false) // autocomplete
    expect(offered.has('tags')).toBe(false) // tag_select
    expect(offered.has('time')).toBe(false) // event_datetime
    expect(offered.has('colour')).toBe(false) // color
    expect(offered.has('systemId')).toBe(false) // device_select
    expect(offered.has('accountIds')).toBe(false) // multi_device_select
  })

  it('writes a real boolean for a checkbox and the value itself for a select', () => {
    const fields = bulkFieldsFor(formSpec(specsFixture, 'SYSTEM_FIELDS'))
    const isolated = fields.find((field) => field.field === 'isolated')
    const verdict = fields.find((field) => field.field === 'verdict')
    expect(isolated?.apply('Yes')).toEqual({ isolated: true })
    expect(isolated?.apply('No')).toEqual({ isolated: false })
    expect(verdict?.apply('compromised')).toEqual({ verdict: 'compromised' })
  })
})

describe('the rest of the document', () => {
  it('serves exactly the ten kinds this client knows how to render', () => {
    // The form renderer ends in a bare `else` that builds a text input, so an
    // eleventh kind renders as a textbox rather than failing.
    expect([...specsFixture.fieldKinds].sort()).toEqual([...FIELD_KINDS].sort())
  })

  it('describes no case field that needs a bespoke control', () => {
    // A descriptor for one of these would put a generic input in front of a
    // gated or paired write. `closedAt` is writable and unspecced; the rsit
    // pair is in neither list. -> `specsResidual.ts`
    const named = new Set(fieldsOf(formSpec(specsFixture, 'CASE_FIELDS')).map((field) => field.name))
    for (const name of WRITABLE_WITHOUT_A_SPEC) {
      expect(specsFixture.case.writable).toContain(name)
      expect(named.has(name)).toBe(false)
    }
    for (const name of PAIRED_WRITE_ONLY) {
      expect(specsFixture.case.writable).not.toContain(name)
      expect(named.has(name)).toBe(false)
    }
  })

  it('drops the dialog example from a label without touching an ordinary one', () => {
    expect(shortLabel('ATT&CK technique (for example T1566.001)')).toBe('ATT&CK technique')
    expect(shortLabel('Severity')).toBe('Severity')
  })

  it('seeds a new entry with the spec defaults and no required blanks', () => {
    // This asserted `emptyEntryFor`, which seeded `hostname: ''` so Add could
    // stamp a row. The property it now pins is the opposite one: a required
    // field is *not* seeded - `''` posted for it overwrites nothing but reads
    // as an answer - and a `default` is, because Add renders it
    // into the control and posts it.
    expect(initialDraft(formSpec(specsFixture, 'SYSTEM_FIELDS'))).toEqual({
      verdict: 'unknown',
      analysisStatus: 'open',
      zone: 'external',
    })
    expect(initialDraft(formSpec(specsFixture, 'TIMELINE_ACTION_FIELDS'))).not.toHaveProperty(
      'description',
    )
  })

  it('parses a re-parse of the same wire body identically', () => {
    expect(parseSpecs(specsWire)).toEqual(specsFixture)
  })
})

describe('the tiering the dialog groups by', () => {
  it('never folds a field the entry already carries', () => {
    const form = formSpec(specsFixture, 'EVENT_FIELDS')
    const tiers = tiersFor(form, specsFixture.tiering, 'lateral movement', {
      evidenceIds: ['ev-1'],
    })
    expect(tiers.folded.map((field) => field.name)).not.toContain('evidenceIds')
    expect(tiers.links.map((field) => field.name)).toContain('evidenceIds')
  })

  it('puts no footer-band field in any tier, folded included', () => {
    const form = formSpec(specsFixture, 'EVENT_FIELDS')
    // `colour` carries a default, so the populated-field rule would otherwise
    // lift it into `links` on every entry, and the two switches would land in
    // `folded` - three fields promised by a fold control that reveals none of
    // them, because the band renders them whatever the fold says.
    const tiers = tiersFor(form, specsFixture.tiering, 'command and control', {
      colour: '#c0392b',
    })
    const tiered = [...tiers.core, ...tiers.alwaysClear, ...tiers.links, ...tiers.folded]
    expect(tiered.filter((field) => field.footerRow === true)).toEqual([])
  })
})

/**
 * The two gates a field may declare, and the shapes an adversarial pass tried.
 *
 * **These are the probe table from the review that found three defects in the
 * first build**, written down before the fixes so each one has to survive every
 * shape rather than the one it was written for. The cases that were already
 * correct are kept beside the ones that were not: they are what a later fix is
 * most likely to break.
 */
describe('a field gated on a checkbox or on another field\'s value', () => {
  type Spec = FieldSpec
  const gate: Spec = { name: 'a', label: 'A', kind: 'select' }
  const gated = (name: string, on: string, kind: FieldKind = 'text'): Spec => ({
    name,
    label: name.toUpperCase(),
    kind,
    applicableWhen: { field: on, oneOf: ['y'] },
  })

  it('shuts on anything the vocabulary does not hold, including a missing key', () => {
    const scope = gated('b', 'a')
    // A vocabulary is strings. Everything else shuts rather than being coerced
    // - `String(value)` would answer `[object Object]`, which matches nothing
    // and reads as a value that was compared.
    expect(gateClosed(scope, {})).toBe(true)
    expect(gateClosed(scope, { a: 1 })).toBe(true)
    expect(gateClosed(scope, { a: true })).toBe(true)
    expect(gateClosed(scope, { a: 'n' })).toBe(true)
    expect(gateClosed(scope, { a: 'y' })).toBe(false)
  })

  it('composes the two gates as AND, so either one shuts the field', () => {
    const both: Spec = { ...gated('b', 'a'), enabledBy: 'c' }
    expect(gateClosed(both, { c: true, a: 'y' })).toBe(false)
    expect(gateClosed(both, { c: false, a: 'y' })).toBe(true)
    expect(gateClosed(both, { c: true, a: 'n' })).toBe(true)
  })

  /**
   * **The cascade, which the first build could not see.** It asked *what did
   * a change to this field shut*, one edge at a time, so a field gated on a
   * field that is itself gated was left holding a value behind a shut gate -
   * the exact state the clearing exists to prevent. Reading the whole draft
   * answers for every depth without enumerating any.
   */
  it('names a field shut through a chain, not only the ones naming the gate', () => {
    const fields = [gate, gated('b', 'a'), gated('c', 'b')]
    expect(shutFields(fields, { a: 'n', b: 'y', c: 'kept' })).toEqual(['b', 'c'])
    // And the whole chain is open only when every link is.
    expect(shutFields(fields, { a: 'y', b: 'y', c: 'kept' })).toEqual([])
  })

  it('names every field on one gate, not the first', () => {
    const fields = [gate, gated('b', 'a'), gated('c', 'a')]
    expect(shutFields(fields, { a: 'n' })).toEqual(['b', 'c'])
  })

  /**
   * **The blank comes off the wire, not off the control kind.** Two tables
   * preceded this, one on each side, and a kind cannot answer the question: a
   * single-reference column refuses `''` and stores `null`, and a count stores
   * `null` for *not stated* where `0` is a real answer. The server parses the
   * column and serves the result beside the gate.
   */
  it('empties a shut field to the blank its column holds', () => {
    const scope = fieldOf(formSpec(specsFixture, 'NETWORK_FIELDS'), 'scope')
    expect(scope?.applicableWhen, 'the served gate went missing').toBeTruthy()
    expect(emptyFor(scope!)).toBe('')
  })

  /**
   * **A field with no gate is never sealed, and answers nothing.** A fallback
   * here would be a third table: the one thing this must not do is invent a
   * value for a column it was told nothing about.
   */
  it('answers nothing for a field that declares no gate', () => {
    const port = fieldOf(formSpec(specsFixture, 'NETWORK_FIELDS'), 'port')
    expect(port?.applicableWhen).toBeUndefined()
    expect(emptyFor(port!)).toBeUndefined()
  })
})

/**
 * **Every served field lands in exactly one tier**, which the six placement
 * tests each assume and none of them states. A boundary that drops a field is
 * silent: the dialog renders perfectly and posts a body without it.
 */
describe('the three tiers account for the whole form', () => {
  it('loses no field of any served form', () => {
    for (const name of Object.keys(specsFixture.forms)) {
      const form = formSpec(specsFixture, name)
      const tiers = entityTiers(form)
      // The footer band is the fourth surface, not a fourth tier: a
      // `footerRow` field is drawn beside the buttons rather than in the run
      // of fields, and counting it here is what keeps this a claim about
      // nothing being lost rather than about where things sit.
      const placed = [
        ...tiers.identity,
        ...tiers.assessment,
        ...tiers.detail.flatMap((row) => [row.field, ...row.gated]),
        ...footerFields(form),
      ].map((field) => field.name)
      expect(new Set(placed), `${name} placed ${String(placed.length)}`).toEqual(
        new Set(fieldsOf(form).map((field) => field.name)),
      )
    }
  })
})

/**
 * **Only one dialog honours a gate, and this is what says so out loud.**
 *
 * `EntityDialog` reads `enabledBy` and `applicableWhen`. `EventDialog`,
 * `NewCaseForm` and `LibraryEditorDialog` draw their own forms from the same
 * served document and consult neither, so a gate declared on a form one of
 * them draws would render a live control the form was calling shut, and post a
 * value the schema refuses.
 *
 * Nothing is wrong today: all three declarations sit on forms the entity
 * dialog draws. That is exactly the state that goes silently wrong the day
 * somebody adds the first one elsewhere - and the fix when this reddens is to
 * teach that dialog the gate, never to widen the list.
 *
 * A comment would have been the cheaper answer and is the one nobody reads
 * while adding a field.
 */
describe('a gate is only declared where a dialog reads it', () => {
  it('puts every gated field on a form EntityDialog draws', () => {
    const drawn = new Set<string>(Object.values(COLLECTION_FORMS))
    const stranded: string[] = []
    const found: string[] = []

    for (const name of Object.keys(specsFixture.forms)) {
      for (const field of fieldsOf(formSpec(specsFixture, name))) {
        if (field.enabledBy === undefined && field.applicableWhen === undefined) continue
        found.push(`${name}.${field.name}`)
        if (!drawn.has(name)) stranded.push(`${name}.${field.name}`)
      }
    }

    // A walk that found nothing passes the assertion under it.
    expect(found, 'no form declares a gate - this test measured nothing').not.toEqual([])
    expect(stranded, 'a gate on a form EntityDialog does not draw does nothing').toEqual([])
  })
})
