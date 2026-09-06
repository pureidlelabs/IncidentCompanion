/**
 * The timeline's two shapes, attacked rather than demonstrated.
 *
 * Both properties here were conventions in Python that the model could not
 * state, and one of them has already been violated once - `SEVERITY_LEVELS`
 * still carries a dead `soc` value because a response record was given a
 * severity.
 */
import { describe, expect, it } from 'vitest'

import { ENTRY_COLOUR } from '../colours.lists.js'
import { formSpec } from '../field-spec.js'
import {
  actionWriteSchema,
  eventWriteSchema,
  timelineToWire,
  timelineWriteSchema,
} from './timeline.js'

const anEvent = {
  kind: 'event' as const,
  description: 'Consent-phishing email delivered',
  time: '2026-08-09T09:00:00Z',
}

const anAction = {
  kind: 'action' as const,
  description: 'Rogue app consent revoked',
  time: '2026-08-09T11:00:00Z',
}

describe('an activity is not an observation', () => {
  it('refuses a severity on an action', () => {
    // The defect that put a non-severity into the severity vocabulary: a SOC
    // response has no severity, and Python could only say so in a comment.
    const result = actionWriteSchema.safeParse({ ...anAction, severity: 'critical' })
    expect(result.success).toBe(false)
  })

  it('refuses a confidence on an action', () => {
    // Same shape: "how sure are we this happened" is meaningless about
    // something the SOC did itself.
    expect(actionWriteSchema.safeParse({ ...anAction, confidence: 'high' }).success).toBe(false)
  })

  it('accepts both on an event', () => {
    const result = eventWriteSchema.safeParse({
      ...anEvent,
      severity: 'critical',
      confidence: 'low',
    })
    expect(result.success).toBe(true)
  })
})

describe('what a caller may not set', () => {
  it('refuses provenance rather than accepting and ignoring it', () => {
    // **The security one.** `provenance` is what the report's "how do we know
    // this" column reads, so a caller that can assert `imported` can assert an
    // import that never happened. A silent drop would report success for a
    // call that changed nothing.
    const result = timelineWriteSchema.safeParse({ ...anEvent, provenance: 'imported' })
    expect(result.success).toBe(false)
  })

  it('refuses a caller-supplied id', () => {
    expect(timelineWriteSchema.safeParse({ ...anEvent, id: crypto.randomUUID() }).success).toBe(
      false,
    )
  })

  it('refuses the unreviewed and time-assumed flags', () => {
    expect(timelineWriteSchema.safeParse({ ...anEvent, unreviewed: true }).success).toBe(false)
    expect(timelineWriteSchema.safeParse({ ...anEvent, timeAssumed: true }).success).toBe(false)
  })
})

describe('the form each kind draws', () => {
  /**
   * **Order is the whole spec here**, since the object's key order is what the
   * dialog renders. Composing the two kinds from a shared spread put notes and
   * the footer flags above severity and tactic, and nothing failed - the
   * schemas still validated, the types were still right, and only looking at
   * the rendered list showed it.
   */
  it('draws an event in the order the analyst reads it', () => {
    expect(formSpec(eventWriteSchema).map((f) => f.name)).toEqual([
      'description', 'time', 'eventSource',
      // **Severity and confidence are a pair - how bad, and how sure.** They
      // were nine fields apart, with `confidence` stranded after the links,
      // for as long as the dialog laid the form out in columns by control
      // kind: everything that was neither a textarea nor a reference fell into
      // one group of eleven, so their distance was invisible. Stacked into the
      // groups the schema declares, it was the first thing that read wrong.
      'severity', 'confidence',
      'tactic', 'technique', 'ukcOverride',
      'sourceSystemId', 'systemId', 'accountIds', 'cloudAppIds', 'networkIndicatorIds',
      'malwareIds', 'evidenceIds',
      'methodIds',
      'sourceTool', 'author', 'tags',
      'notes', 'colour', 'hideFromGraph', 'followup',
    ])
  })

  /**
   * **The groups the dialog stacks, which the key order alone cannot carry.**
   * A `section` marker rides the first field of its group, so a field moving
   * across a boundary is a silent regrouping - `confidence` moved above and
   * nothing here would have noticed if it had landed in the wrong one.
   */
  it('declares the groups an analyst fills in turn', () => {
    const groups = formSpec(eventWriteSchema).reduce<Record<string, string[]>>(
      (into, field) => {
        if (field.section) into[field.section.title] = []
        const open = Object.keys(into).at(-1)
        if (open !== undefined) into[open]?.push(field.name)
        return into
      },
      {},
    )
    expect(Object.keys(groups)).toEqual([
      'What happened',
      'Assessment',
      'Actors and location',
      'Provenance',
      'Notes',
    ])
    expect(groups['Assessment']).toEqual(['severity', 'confidence', 'tactic', 'technique', 'ukcOverride'])
    expect(groups['Provenance']).toEqual(['methodIds', 'sourceTool', 'author', 'tags'])
  })

  it('draws source host before destination host', () => {
    // Movement reads source -> destination, always in that order; reversing it
    // is how an analyst records a hop backwards.
    const names = formSpec(eventWriteSchema).map((f) => f.name)
    expect(names.indexOf('sourceSystemId')).toBeLessThan(names.indexOf('systemId'))
  })

  it('gives an action its own labels rather than the event\u2019s', () => {
    // The registry keys on the schema object, so a shared instance would take
    // whichever label registered last - silently, and in one form only.
    const account = formSpec(actionWriteSchema).find((f) => f.name === 'accountIds')
    const eventAccount = formSpec(eventWriteSchema).find((f) => f.name === 'accountIds')

    // **The property is that they differ, not what either one says.** This
    // read the two strings, so the label sweep that took "(if applicable)" off
    // one of them failed a test about registry keying.
    expect(account?.label).toBeTruthy()
    expect(eventAccount?.label).toBeTruthy()
    expect(account?.label).not.toBe(eventAccount?.label)
  })

  it('offers an action no kill chain, no source host and no graph toggle', () => {
    const names = formSpec(actionWriteSchema).map((f) => f.name)
    expect(names).not.toContain('ukcOverride')
    expect(names).not.toContain('sourceSystemId')
    expect(names).not.toContain('hideFromGraph')
  })
})

describe('the shared core', () => {
  it('needs a description on either kind', () => {
    expect(eventWriteSchema.safeParse({ kind: 'event', time: anEvent.time }).success).toBe(false)
    expect(actionWriteSchema.safeParse({ kind: 'action', time: anAction.time }).success).toBe(false)
  })

  it('routes on kind, so one schema takes both', () => {
    expect(timelineWriteSchema.safeParse(anEvent).success).toBe(true)
    expect(timelineWriteSchema.safeParse(anAction).success).toBe(true)
  })

  it('refuses a kind that is neither', () => {
    expect(timelineWriteSchema.safeParse({ ...anEvent, kind: 'note' }).success).toBe(false)
  })

  it('asserts no confidence on an entry that gave none', () => {
    // An imported or templated entry must not claim a confidence nobody gave.
    const parsed = eventWriteSchema.parse(anEvent)
    expect(parsed.confidence).toBeNull()
    expect(parsed.severity).toBeNull()
  })
})

/**
 * One table holds both kinds, so every column comes back on every row. What the
 * API *means* is narrower than what the query returns, and this is where the
 * difference is enforced rather than left to the reader to remember.
 */
describe('projecting a stored row onto the kind it names', () => {
  const stored: Record<string, unknown> = {
    id: '11111111-1111-4111-8111-111111111111',
    caseId: '22222222-2222-4222-8222-222222222222',
    kind: 'action',
    description: 'Isolate the host',
    time: new Date('2026-08-10T09:00:00.000Z'),
    actionType: 'containment',
    author: 'Ada',
    notes: '',
    colour: '',
    followup: false,
    systemId: null,
    accountIds: [],
    cloudAppIds: [],
    networkIndicatorIds: [],
    malwareIds: [],
    evidenceIds: [],
    provenance: 'typed',
    unreviewed: false,
    timeAssumed: false,
    // The other arm's columns. Present on the row because the table holds both
    // kinds; meaningless on an action, and the whole point of the projection.
    severity: null,
    tactic: '',
    technique: '',
    eventSource: null,
    sourceTool: '',
    ukcOverride: '',
    sourceSystemId: null,
    confidence: null,
    tags: '',
    hideFromGraph: false,
    version: 3,
    createdAt: new Date('2026-08-10T08:00:00.000Z'),
    updatedAt: new Date('2026-08-10T09:00:00.000Z'),
    createdBy: 'u-ada',
    updatedBy: null,
  }

  it('drops the other kind\u2019s fields from an action', () => {
    const wire = timelineToWire(stored)

    for (const absent of [
      'severity', 'tactic', 'technique', 'eventSource', 'sourceTool',
      'ukcOverride', 'sourceSystemId', 'confidence', 'tags', 'hideFromGraph',
    ]) {
      expect(wire, absent).not.toHaveProperty(absent)
    }
  })

  it('drops actionType from an event', () => {
    const wire = timelineToWire({ ...stored, kind: 'event' })

    expect(wire).not.toHaveProperty('actionType')
    // ...and keeps what an event is for, so this cannot pass by projecting
    // nothing at all.
    expect(wire).toHaveProperty('severity')
    expect(wire).toHaveProperty('technique')
  })

  it('keeps the envelope every write needs', () => {
    const wire = timelineToWire(stored)

    // `version` is the one that matters: a row the client cannot name a
    // version for is a row it cannot legally patch.
    expect(wire).toMatchObject({ version: 3, caseId: stored['caseId'], createdBy: 'u-ada' })
    expect(wire['id']).toBe(stored['id'])
  })

  it('sends dates as ISO strings, because JSON has no date', () => {
    const wire = timelineToWire(stored)

    expect(wire['time']).toBe('2026-08-10T09:00:00.000Z')
    expect(wire['createdAt']).toBe('2026-08-10T08:00:00.000Z')
  })

  /**
   * **A column in neither schema is not passed through.** That is how a
   * server-owned value leaks: added to the table for the server's own use, and
   * carried to every client because the projection was a spread.
   */
  it('drops a column no schema claims', () => {
    const wire = timelineToWire({ ...stored, internalNote: 'not for the wire' })

    expect(wire).not.toHaveProperty('internalNote')
  })
})

/**
 * **A colour on an entry is a value from the palette or it is nothing.**
 *
 * A `vocabulary` reaches the served document without reaching any write path,
 * so the schema is the only thing that refuses a value outside the palette.
 * That is not a cosmetic gap: `TimelineRow` omits the severity token whenever
 * a colour is set, so a value the CSSOM refuses leaves the rail with no colour
 * at all rather than falling back - the row silently loses its classification
 * stripe. The API and CSV import both reach it, which is the surface
 * `colours.lists.ts` argues against offering.
 */
describe('the entry colour is the palette, on both shapes', () => {
  const shapes = [
    ['event', eventWriteSchema, anEvent],
    ['action', actionWriteSchema, anAction],
  ] as const

  for (const [name, schema, base] of shapes) {
    it(`refuses a colour outside the palette on an ${name}`, () => {
      // A CSS colour name, a nonsense word, and something that reads as an
      // attempt to smuggle a second declaration through. React assigns through
      // the CSSOM so none of them injects; all three render as no colour.
      for (const bad of ['chartreuse', 'not-a-colour', 'red;background-image:url(x)']) {
        expect(schema.safeParse({ ...base, colour: bad }).success, bad).toBe(false)
      }
    })

    it(`takes every colour the palette offers on an ${name}, and the empty one`, () => {
      expect(schema.safeParse({ ...base, colour: '' }).success).toBe(true)
      for (const hex of ENTRY_COLOUR) {
        expect(schema.safeParse({ ...base, colour: hex }).success, hex).toBe(true)
      }
    })
  }
})
