import { describe, expect, it } from 'vitest'

import { specsFixture } from '@/fixtures/specs'

import { bodySections, entityTiers, footerFields } from './dialogLayout'
import { fieldsOf, formSpec, type FormSpec } from './specs'

/**
 * The split is the served spec's, so these assert against the real fixture
 * rather than a hand-built form: a rule read off `kind` is only worth
 * anything if it lands all 22 event fields somewhere a reader expects.
 */

const event = formSpec(specsFixture, 'EVENT_FIELDS')
const activity = formSpec(specsFixture, 'TIMELINE_ACTION_FIELDS')
const section = (form: FormSpec, title: string) =>
  bodySections(form).find((one) => one.title === title)

describe('bodySections', () => {
  it('is the groups the schema declares, in served order', () => {
    expect(bodySections(event).map((one) => one.title)).toEqual([
      'What happened',
      'Assessment',
      'Actors and location',
      'Provenance',
      'Notes',
    ])
  })

  /**
   * Grouping on a control's kind puts every reference select together whatever
   * the schema says they are part of, and leaves everything that is neither a
   * textarea nor a reference in one group.
   */
  it('groups by what the schema says a field is part of, never by its control', () => {
    expect(section(event, 'Assessment')?.fields.map((f) => f.name)).toEqual([
      'severity',
      'tactic',
      'technique',
    ])
    // A text field and two autocompletes, together because provenance is what
    // they are - the kind-sort had them adrift in a group of eleven.
    expect(section(event, 'Provenance')?.folded.map((f) => f.name)).toEqual([
      // Leads the group: how the entry came to be known is what every field
      // here is, where the actors above are what the event involved.
      'methodIds',
      'sourceTool',
      'author',
      'tags',
    ])
  })

  it('folds the run the wire marks subordinate, and shows the rest', () => {
    expect(section(event, 'Assessment')?.folded.map((f) => f.name)).toEqual([
      'confidence',
      'ukcOverride',
    ])
    expect(section(event, 'What happened')?.folded).toEqual([])
  })

  /** Seven optional links: a whole group that opens shut. */
  it('keeps a group whose every field is subordinate', () => {
    const linked = section(event, 'Actors and location')
    expect(linked?.fields).toEqual([])
    expect(linked?.folded).toHaveLength(7)
  })

  it('leaves the footer trio to the band, out of the last group', () => {
    expect(section(event, 'Notes')?.fields.map((f) => f.name)).toEqual(['notes'])
  })

  it('lands every field of both timeline forms in exactly one group', () => {
    for (const form of [event, activity]) {
      const placed = bodySections(form).flatMap((one) => [...one.fields, ...one.folded])
      const footer = footerFields(form)
      expect(new Set(placed).size).toBe(placed.length)
      expect(placed.length + footer.length).toBe(fieldsOf(form).length)
    }
  })

  /**
   * **Found by a green break-verify.** Deleting the empty-group filter broke
   * nothing: `sectionsOf` already drops a section with no fields, so this one
   * only bites where every field a section holds is a footer field - and no
   * shipped form has one. The wire permits it, so the clause is not redundant;
   * it was untested.
   */
  it('drops a group the footer band empties', () => {
    const footerOnly = fieldsOf(event).filter((f) => f.footerRow === true)
    const settings: FormSpec = {
      collection: null,
      columns: 3,
      blank: {},
      fields: [
        ...fieldsOf(event).filter((f) => f.footerRow !== true),
        { section: { title: 'Per-entry settings' } },
        ...footerOnly,
      ],
    }
    expect(bodySections(settings).map((one) => one.title)).not.toContain('Per-entry settings')
  })

  /**
   * A form declaring no section is one untitled group, which is what every
   * form that is not stacked serves.
   */
  it('is one untitled group for a form that declares none', () => {
    const bare: FormSpec = {
      collection: null,
      columns: 3,
      blank: {},
      fields: fieldsOf(event).filter((f) => f.footerRow !== true),
    }
    const only = bodySections(bare)
    expect(only).toHaveLength(1)
    expect(only[0]?.title).toBe('')
  })
})

describe('footerFields', () => {
  it('is the three per-entry settings the wire marks footerRow', () => {
    expect(footerFields(event).map((field) => field.name)).toEqual([
      'colour',
      'hideFromGraph',
      'followup',
    ])
  })

  it('is empty at one column, where no column exists to move them out of', () => {
    // `blank` is what a create hook builds its optimistic row from and nothing
    // in this file reads it; empty rather than a copy of `event`'s, so it is
    // clear it is not under test here.
    const single: FormSpec = { collection: null, columns: 1, fields: event.fields, blank: {} }
    expect(footerFields(single)).toEqual([])
  })
})

describe('the three surfaces an entity dialog stacks', () => {
  /**
   * **The schema declares the boundaries; this only groups by them.**
   *
   * The property that matters is that a declared grouping is what reaches the
   * screen. `tier` is what declares it, and `specs.controller.test.ts` holds
   * every stacked form to declaring it. Keying off
   * `FieldMeta.column` instead reaches a key only `NETWORK_FIELDS` sets.
   */
  it('groups a form by the tier its fields open, in declaration order', () => {
    const form = formSpec(specsFixture, 'NETWORK_FIELDS')
    const tiers = entityTiers(form)
    expect(tiers.identity.map((f) => f.name)).toEqual(['type', 'value', 'scope', 'port'])
    expect(tiers.assessment.map((f) => f.name)).toEqual(['context', 'disposition', 'triage'])
    expect(tiers.detail.map((row) => row.field.name)).toEqual([
      'systemId',
      'malwareId',
      'methodId',
      'blocked',
      'tags',
    ])
  })

  /**
   * **A gated field is drawn on its gate's row, so it takes none of its own.**
   * `blockedAt` names `blocked` in `enabledBy`; two rows stated containment
   * twice, the second restating the first's absence as "Not recorded".
   */
  it('folds a gated field into the row of the field that frees it', () => {
    const tiers = entityTiers(formSpec(specsFixture, 'NETWORK_FIELDS'))
    const blocked = tiers.detail.find((row) => row.field.name === 'blocked')
    expect(blocked?.gated.map((f) => f.name)).toEqual(['blockedAt'])
    expect(tiers.detail.map((row) => row.field.name)).not.toContain('blockedAt')
  })

  /**
   * **The `when` of a chain of custody belongs with the `who`, and a heuristic
   * cannot put it there.** Keying the band off the control kind folds
   * `collectedAt` -- an `event_datetime` -- into a band headed "Links and
   * containment", away from the two fields its own `section` marker groups it
   * with. This is the case for serving the tier rather than inferring it.
   */
  it('keeps a timestamp on the face when its schema groups it there', () => {
    const tiers = entityTiers(formSpec(specsFixture, 'EVIDENCE_FIELDS'))
    expect(tiers.assessment.map((f) => f.name)).toContain('collectedAt')
    expect(tiers.detail.map((row) => row.field.name)).not.toContain('collectedAt')
  })

  /** Every field lands on exactly one surface, for every form that stacks. */
  it.each([
    'SYSTEM_FIELDS',
    'ACCOUNT_FIELDS',
    'NETWORK_FIELDS',
    'MALWARE_FIELDS',
    'CLOUD_APP_FIELDS',
    'EVIDENCE_FIELDS',
    'IMPACT_FIELDS',
    'ACTION_FIELDS',
  ])('places every %s field once', (name) => {
    const form = formSpec(specsFixture, name)
    const tiers = entityTiers(form)
    const placed = [
      ...tiers.identity,
      ...tiers.assessment,
      ...tiers.detail.flatMap((row) => [row.field, ...row.gated]),
    ].map((f) => f.name)
    expect(placed.slice().sort()).toEqual(
      fieldsOf(form)
        .map((f) => f.name)
        .sort(),
    )
    expect(new Set(placed).size, `${name} draws a field twice`).toBe(placed.length)
  })

  /**
   * **A gate chain leaves no field undrawn**, at any depth.
   *
   * A field gated by a gate belonged to something that was not itself a row,
   * so it was dropped by the filter and collected by nobody's `gated` - drawn
   * nowhere at all, in a dialog that rendered perfectly. No schema declares
   * one; a field that silently vanishes is not a shape worth leaving
   * reachable, and nothing else would report it.
   */
  it('draws a field gated through a chain, on the row at the top of it', () => {
    const chained: FormSpec = {
      collection: null,
      columns: 1,
      blank: {},
      fields: [
        { name: 'label', label: 'Label', kind: 'text', tier: 'identity' },
        { name: 'a', label: 'A', kind: 'checkbox', tier: 'detail' },
        { name: 'b', label: 'B', kind: 'checkbox', enabledBy: 'a' },
        { name: 'c', label: 'C', kind: 'event_datetime', enabledBy: 'b' },
      ],
    }
    const tiers = entityTiers(chained)
    expect(tiers.detail.map((row) => row.field.name)).toEqual(['a'])
    expect(tiers.detail[0]?.gated.map((one) => one.name)).toEqual(['b', 'c'])

    // The property that was broken: every field reaches the screen.
    const drawn = [
      ...tiers.identity,
      ...tiers.assessment,
      ...tiers.detail.flatMap((row) => [row.field, ...row.gated]),
    ].map((one) => one.name)
    expect(drawn.slice().sort()).toEqual(['a', 'b', 'c', 'label'])
  })

  /**
   * **A form declaring no tier is not an entity form**, and gets the plain
   * grid rather than an empty plate over a fold of everything.
   */
  it('gives a form that opens no tier one flat group', () => {
    const tiers = entityTiers(formSpec(specsFixture, 'CASE_FIELDS'))
    expect(tiers.identity).toEqual([])
    expect(tiers.detail).toEqual([])
    expect(tiers.assessment.length).toBeGreaterThan(0)
  })

  /**
   * **A `footerRow` field belongs to the footer band and to no tier.** The
   * event path already reads it that way -- `tiersFor` drops them and says
   * they render in the footer -- and this one drew them in the body, so
   * `Colour`, `Hide on investigation graph` and `Flag for follow-up` appeared
   * in the middle of the form on both timeline dialogs.
   */
  it('leaves a footer-row field out of every tier', () => {
    const form = formSpec(specsFixture, 'EVENT_FIELDS')
    const footer = footerFields(form)
    expect(footer.length, 'the fixture form declares no footer row').toBeGreaterThan(0)

    const tiers = entityTiers(form)
    const placed = [
      ...tiers.identity,
      ...tiers.assessment,
      ...tiers.detail.flatMap((row) => [row.field, ...row.gated]),
    ].map((field) => field.name)

    for (const field of footer) {
      expect(placed, `${field.label} is drawn in a tier as well as the footer`).not.toContain(
        field.name,
      )
    }
  })
})
