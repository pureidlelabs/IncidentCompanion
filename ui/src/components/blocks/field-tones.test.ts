import { describe, expect, it } from 'vitest'

import { PROTOTYPE_KEYS } from '@/test/prototypeKeys'
import specs from '@/fixtures/specs.json'

import { ROLE_PAINT, UNMAPPED_ROLE, paintFor, type FieldToneSpec } from './field-tones'

/**
 * The client half of the classification ramp, attacked at the seam.
 */

/** Every served (field, value, tone) in the committed document. */
const served = Object.entries(
  specs.field_tones as Record<string, Record<string, FieldToneSpec>>,
).flatMap(([field, values]) =>
  Object.entries(values).map(([value, tone]) => ({ field, value, tone })),
)

describe('the seam between the served vocabulary and the paint', () => {
  it('has a paint for every role the server actually serves', () => {
    expect(served.length).toBeGreaterThan(0)
    const unpainted = served
      .filter(({ tone }) => !Object.hasOwn(ROLE_PAINT, tone.tone))
      .map(({ field, value, tone }) => `${field}.${value} -> ${tone.tone}`)
    expect(unpainted, 'these draw grey, and the server meant a colour').toEqual([])
  })

  it('paints a role it has never heard of as grey rather than as nothing', () => {
    // A hue the server grows before this build has a token for it. An unstyled
    // `Badge` reads as a rendering failure; grey reads as unrated, which is
    // what an unresolvable role honestly is.
    const paint = paintFor({ tone: 'chartreuse', fill: 'solid' })
    expect(paint.role).toBe(UNMAPPED_ROLE)
    expect(paint.className).not.toBe('')
  })

  it.each(PROTOTYPE_KEYS)('reads %o as a role it does not have, not as a function', (role) => {
    // `ROLE_PAINT[role]` reads a function back off the prototype for these, and
    // `[fill]` on a function is `undefined` -- an unpainted chip, from a lookup
    // that looked like it succeeded.
    const paint = paintFor({ tone: role, fill: 'solid' })
    expect(paint.role).toBe(UNMAPPED_ROLE)
    expect(typeof paint.className).toBe('string')
  })

  it('answers for a row that carries no tone at all', () => {
    // An optimistic row is the fields the dialog sent and nothing else.
    for (const absent of [undefined, {} as unknown as FieldToneSpec]) {
      expect(paintFor(absent).role).toBe(UNMAPPED_ROLE)
    }
  })
})

describe('the fill axis', () => {
  it('fills only on the word solid, so a garbled fill claims nothing is wrong', () => {
    // Grey is the absence of a judgement and hollow is the absence of an
    // adverse finding: together they say nothing is claimed, which is what an
    // unreadable tone honestly means. A filled grey chip would say the
    // opposite -- something is wrong, and nobody judged it.
    for (const fill of ['SOLID', 'filled', '', undefined, null, 1]) {
      expect(paintFor({ tone: 'low', fill } as unknown as FieldToneSpec).fill).toBe('hollow')
    }
    expect(paintFor({ tone: 'low', fill: 'solid' }).fill).toBe('solid')
  })

  it('separates two chips of one hue by more than a class name', () => {
    // `suspicious` and `benign` are both `low`, and fill is the only thing
    // telling them apart. If the hollow chip kept a background they would be
    // one chip with two spellings.
    const solid = paintFor({ tone: 'low', fill: 'solid' }).className
    const hollow = paintFor({ tone: 'low', fill: 'hollow' }).className
    expect(solid).toMatch(/\bbg-/)
    expect(hollow).not.toMatch(/\bbg-/)
    expect(hollow).toMatch(/\bborder-/)
  })

  it('borders and letters a hollow chip from one token, so neither can pass alone', () => {
    for (const [role, paint] of Object.entries(ROLE_PAINT)) {
      const border = /\bborder-([a-z0-9-]+)/.exec(paint.hollow)?.[1]
      const text = /\btext-([a-z0-9-]+)/.exec(paint.hollow)?.[1]
      expect(border, `${role} has no border colour`).toBeDefined()
      expect(text, `${role} has no lettering colour`).toBe(border)
    }
  })

  it('gives every role both fills, so no role can only be drawn one way', () => {
    for (const [role, paint] of Object.entries(ROLE_PAINT)) {
      expect(paint.solid, `${role} cannot be filled`).toMatch(/\bbg-/)
      expect(paint.hollow, `${role} cannot be hollow`).toMatch(/\bborder-/)
    }
  })
})

describe('the two token choices contrast measurement forced', () => {
  /**
   * jsdom has no colours, so this holds the *choice* rather than the ratio.
   */
  it('fills a critical chip from the type token, not from the ramp', () => {
    // The ramp's dark red carries `--on-severity` at 3.76:1, under the floor.
    expect(ROLE_PAINT.critical?.solid).toContain('bg-severity-critical-type')
    expect(ROLE_PAINT.critical?.solid).not.toMatch(/bg-severity-critical(?![a-z-])/)
  })

  it('letters a hollow low chip from the type token, not from the ramp', () => {
    // The ramp's yellow is 1.81:1 as type on the light page.
    expect(ROLE_PAINT.low?.hollow).toContain('text-severity-low-type')
    expect(ROLE_PAINT.low?.hollow).not.toMatch(/text-severity-low(?![a-z-])/)
  })

  it('keeps the filled low chip on its own dark ink, which is the only one that reads', () => {
    // White on the yellow is 1.8:1; `--on-severity-low` is 10.4:1.
    expect(ROLE_PAINT.low?.solid).toContain('text-on-severity-low')
  })
})
