/**
 * The served classification map, attacked rather than restated.
 *
 * **The defects this is written against are silent ones.** A key spelled
 * differently from the vocabulary maps nothing and renders grey; a value the
 * owner has not ruled on renders the same grey and reads as a decision; and
 * the fill axis inverts wholesale if somebody reads it as *confirmed* instead
 * of *adverse*, which leaves every chip painted and every assertion about hue
 * still green.
 */
import { describe, expect, it } from 'vitest'

import { DELIBERATELY_GREY, FIELD_TONES, TONE_ROLES, UNRULED } from './field-tones.js'
import {
  ASSET_VERDICT,
  DATA_DISPOSITION,
  DISPOSITION,
  TASK_STATUS,
  TRIAGE,
} from './vocabularies.lists.js'

const entries = Object.entries(FIELD_TONES).flatMap(([field, values]) =>
  Object.entries(values).map(([value, tone]) => ({ field, value, ...tone })),
)

describe('the served tone', () => {
  it('names only roles the vocabulary declares', () => {
    // `FIELD_TONES` is a `Record<string, ...>`, so a role invented in a literal
    // typechecks the moment anything widens it. The client falls through to
    // grey on an unknown role, which is exactly the failure that renders as a
    // deliberate choice.
    const unknown = entries.filter((e) => !(TONE_ROLES as readonly string[]).includes(e.tone))
    expect(unknown).toEqual([])
  })

  it('answers both axes for every value, never a bare hue', () => {
    // A tone missing its `fill` is `undefined`, which is neither solid nor
    // hollow and paints as whichever branch the client's ternary falls to.
    const halfAnswered = entries.filter((e) => e.fill !== 'solid' && e.fill !== 'hollow')
    expect(halfAnswered).toEqual([])
  })
})

describe('a key that maps nothing', () => {
  it('spells every verdict the way the vocabulary does', () => {
    const strays = Object.keys(FIELD_TONES['verdict'] ?? {}).filter(
      (value) => !(ASSET_VERDICT as readonly string[]).includes(value),
    )
    expect(strays, 'a verdict key the vocabulary has no value for maps nothing').toEqual([])
  })

  it('spells every disposition the way one of the two vocabularies does', () => {
    const known = new Set<string>([...DISPOSITION, ...DATA_DISPOSITION])
    const strays = Object.keys(FIELD_TONES['disposition'] ?? {}).filter((v) => !known.has(v))
    expect(strays).toEqual([])
  })

  it('spells every triage value the way the vocabulary does', () => {
    const strays = Object.keys(FIELD_TONES['triage'] ?? {}).filter(
      (value) => !(TRIAGE as readonly string[]).includes(value),
    )
    expect(strays).toEqual([])
  })

  it('keeps the two disposition vocabularies disjoint, which is what makes one map safe', () => {
    const shared = DISPOSITION.filter((v) => (DATA_DISPOSITION as readonly string[]).includes(v))
    // `unknown` is in both and neither is mapped; anything mapped that is in
    // both would paint one field from the other field's ruling.
    const mapped = shared.filter((v) => v in (FIELD_TONES['disposition'] ?? {}))
    expect(mapped, 'a value in both vocabularies cannot carry one ruling').toEqual([])
  })
})

describe('a value that draws grey', () => {
  const covered = [
    { field: 'verdict', vocabulary: ASSET_VERDICT },
    { field: 'disposition', vocabulary: DISPOSITION },
    { field: 'disposition', vocabulary: DATA_DISPOSITION },
    { field: 'triage', vocabulary: TRIAGE },
    { field: 'analysis_status', vocabulary: TASK_STATUS },
    { field: 'status', vocabulary: TASK_STATUS },
  ]

  /**
   * **The ratchet, and it is the whole of what keeps grey legible.**
   *
   * Grey on screen cannot say whether it was chosen or defaulted, so a value
   * added to a vocabulary and forgotten renders exactly like one that was
   * ruled to have no tone. This refuses the third possibility: every value is
   * mapped, ruled grey, or named as awaiting a ruling.
   *
   * It is here rather than an assertion over `UNRULED` because a list can be
   * empty and satisfy any test about its contents. This is what put the three
   * `TASK_STATUS` values into it: they had drawn grey since the map was
   * written and nothing said whether that was a choice.
   */
  it('forces a decision on every vocabulary value, rather than letting one inherit grey', () => {
    const undecided = covered.flatMap(({ field, vocabulary }) =>
      vocabulary
        .filter((value) => !(value in (FIELD_TONES[field] ?? {})))
        .filter((value) => !(DELIBERATELY_GREY as readonly string[]).includes(value))
        .filter((value) => !UNRULED.includes(value))
        .map((value) => `${field}.${value}`),
    )
    expect(
      undecided.sort(),
      'these draw grey and nothing says whether that was chosen -- map it, or name it in UNRULED',
    ).toEqual([])
  })

  it('keeps the ruled-grey values unmapped, so the ruling and the code agree', () => {
    const painted = DELIBERATELY_GREY.filter((value) =>
      Object.values(FIELD_TONES).some((values) => value in values),
    )
    expect(painted).toEqual([])
  })

  it('names only values that exist in a vocabulary it covers', () => {
    // A stale name in either list hides a real absence from the ratchet above.
    const vocabulary = new Set<string>([
      ...ASSET_VERDICT,
      ...DISPOSITION,
      ...DATA_DISPOSITION,
      ...TRIAGE,
      ...TASK_STATUS,
    ])
    expect([...DELIBERATELY_GREY, ...UNRULED].filter((v) => !vocabulary.has(v))).toEqual([])
  })
})

describe('fill means adverse, and the other reading was refused', () => {
  /**
   * **The pair that inverts.** Under *fill means confirmed*, `suspected` is
   * hollow and `benign` is filled; under the ruling both swap. Asserting the
   * two together is what makes the wrong reading red - either one alone stays
   * green when the map is flipped as a whole.
   */
  it('fills suspected and hollows benign', () => {
    expect(FIELD_TONES['verdict']?.['suspected']).toEqual({ tone: 'low', fill: 'solid' })
    expect(FIELD_TONES['disposition']?.['benign']).toEqual({ tone: 'low', fill: 'hollow' })
  })

  it('keeps benign on the yellow rather than promoting it to the green', () => {
    // `benign` means the indicator showed up and has an explanation. Green is
    // for the value that says nothing was there.
    expect(FIELD_TONES['disposition']?.['benign']?.tone).toBe('low')
  })

  it('shares one hue between suspicious and benign, separated only by fill', () => {
    expect(FIELD_TONES['disposition']?.['suspicious']?.tone).toBe(
      FIELD_TONES['disposition']?.['benign']?.tone,
    )
    expect(FIELD_TONES['disposition']?.['suspicious']?.fill).not.toBe(
      FIELD_TONES['disposition']?.['benign']?.fill,
    )
  })

  /**
   * **The inventory, not a sample.** Fill is one bit and every value carries
   * it, so an inverted reading of any single value is a one-line change that
   * no per-value assertion above would catch. Listing the whole hollow set is
   * what makes the axis reviewable.
   */
  it('hollows exactly the values that claim nothing is wrong', () => {
    const hollow = entries.filter((e) => e.fill === 'hollow').map((e) => `${e.field}.${e.value}`)
    expect(hollow.sort()).toEqual([
      // A lifecycle state is never adverse -- it says where the work got to.
      'analysis_status.completed',
      'analysis_status.in progress',
      'disposition.benign',
      'disposition.untouched',
      'isolated.true',
      'status.completed',
      'status.in progress',
      'triage.assessed',
      'triage.investigating',
      'triage.untriaged',
      'verdict.clean',
    ])
  })

  it('fills nothing outside a classification field', () => {
    // What this protects against: a second filled column doubles the filled
    // chips on a table, and every row carries a lifecycle value.
    const lifecycle = ['analysis_status', 'status', 'triage']
    const filled = entries
      .filter((e) => lifecycle.includes(e.field) && e.fill === 'solid')
      .map((e) => `${e.field}.${e.value}`)
    expect(filled).toEqual([])
  })
})

describe('untouched, the value the vocabulary did not have', () => {
  it('is in the data disposition vocabulary, not only in the tone map', () => {
    // A tone for a value no form offers is a mapping nothing can reach.
    expect(DATA_DISPOSITION).toContain('untouched')
  })

  it('takes the green rather than the grey, because it is a judgement', () => {
    // Grey is the absence of a judgement. `untouched` is one: somebody looked
    // and nothing happened. `unknown` is what stays grey.
    expect(FIELD_TONES['disposition']?.['untouched']).toEqual({ tone: 'contain', fill: 'hollow' })
    expect(FIELD_TONES['disposition']?.['unknown']).toBeUndefined()
  })

  it('does not re-merge the two things `unknown` used to mean', () => {
    // `unknown` was split apart because it meant *we cannot tell* and *nobody
    // has checked* at once. Mapping it to anything reverses that split.
    expect(DISPOSITION).toContain('unknown')
    expect(FIELD_TONES['disposition']?.['unknown']).toBeUndefined()
  })
})

describe('isolated', () => {
  it('is keyed by the string a boolean cell renders, not by a boolean', () => {
    // `Object.keys` on a record is strings; a `true` key written as a boolean
    // literal becomes `"true"` anyway, and a lookup by `String(value)` is the
    // only thing a cell can do.
    expect(FIELD_TONES['isolated']?.['true']).toEqual({ tone: 'contain', fill: 'hollow' })
  })

  it('says nothing about a host that is not isolated', () => {
    // A hollow green "false" beside a compromised verdict reads as containment.
    expect(FIELD_TONES['isolated']?.['false']).toBeUndefined()
  })
})

describe('the three the maintainer ruled last, which had been left grey', () => {
  it('takes commodity infection off the severity ramp entirely', () => {
    // It is adverse -- something is on the host -- but the value exists to say
    // *this is not the intrusion*, and the ramp would put it in the same
    // language as the thing it is being told apart from.
    expect(FIELD_TONES['verdict']?.['commodity infection']).toEqual({
      tone: 'info',
      fill: 'solid',
    })
  })

  it('gives encrypted the same hue as destroyed, which is the ruling and not a collision', () => {
    expect(FIELD_TONES['disposition']?.['encrypted']).toEqual(
      FIELD_TONES['disposition']?.['destroyed'],
    )
    expect(FIELD_TONES['disposition']?.['encrypted']?.tone).toBe('high')
  })

  it('places altered between accessed and destroyed, and nowhere near either', () => {
    // The integrity leg differs in degree rather than in kind here, which was
    // ruled with that stated. `medium` is unused elsewhere in this vocabulary.
    expect(FIELD_TONES['disposition']?.['altered']).toEqual({ tone: 'medium', fill: 'solid' })
    const others = Object.entries(FIELD_TONES['disposition'] ?? {})
      .filter(([value]) => value !== 'altered')
      .filter(([, tone]) => tone.tone === 'medium')
    expect(others).toEqual([])
  })

  it('fills all three, because all three are places something is wrong', () => {
    for (const value of ['commodity infection']) {
      expect(FIELD_TONES['verdict']?.[value]?.fill).toBe('solid')
    }
    for (const value of ['encrypted', 'altered']) {
      expect(FIELD_TONES['disposition']?.[value]?.fill).toBe('solid')
    }
  })
})
