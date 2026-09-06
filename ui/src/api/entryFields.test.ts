/**
 * What a body may name, and what belongs to the server.
 *
 * **Written from the defect.** Every create through the timeline dialog
 * answered 400 - `Unrecognized key: "provenance"`. The dialog seeds a new entry
 * with `{ kind, provenance }` so the form knows which arm to draw, and
 * `creatableFields` sends everything the draft holds; the Node write schema
 * omits `provenance` behind `.strict()` because it is the server's to decide.
 * Neither suite sees the disagreement on its own: the client's draft is
 * well-formed and the server's schema is right.
 *
 * The server half is asserted in `timeline.write.test.ts`. This is the half
 * that stops the client naming the field at all.
 */
import { describe, expect, it } from 'vitest'

import { changedFields, creatableFields } from './entryFields'

describe('what a create may send', () => {
  it('drops the fields the server owns', () => {
    const draft = {
      kind: 'action',
      provenance: 'typed',
      description: 'Contained DC-01',
    }
    expect(creatableFields(draft)).toEqual({ kind: 'action', description: 'Contained DC-01' })
  })

  it.each(['id', 'provenance', 'unreviewed', 'timeAssumed', 'ukcPhase', 'ukcCycle'])(
    'never sends %s',
    (name) => {
      // One case per field, because a single all-fields case goes green against
      // a list that dropped only the first one.
      expect(creatableFields({ description: 'x', [name]: 'anything' })).toEqual({
        description: 'x',
      })
    },
  )

  it('keeps the kind, which the union discriminates on', () => {
    // `kind` looks server-ish beside the others and is not: without it the
    // discriminated union has no arm to pick and refuses the whole body.
    expect(creatableFields({ kind: 'event', description: 'x' })).toHaveProperty('kind', 'event')
  })

  it('still sends a field the analyst actually changed', () => {
    expect(changedFields({ severity: 'low' }, { severity: 'high' })).toEqual({ severity: 'high' })
  })

  it('drops a server-owned field from a patch too', () => {
    // A patch is where this bites hardest: the strict schema refuses the whole
    // save, so one stray key loses the analyst's edit rather than one field.
    expect(changedFields({ provenance: 'typed' }, { provenance: 'imported' })).toEqual({})
  })
})
