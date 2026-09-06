/**
 * Written from an attack on the pack reader, not from its intention.
 *
 * The question each of these asks is "how do I get a document that looks
 * translated and is not", because that is the failure an analyst cannot see:
 * a heading printing a key, a pack claiming coverage it does not have, or a
 * pack quietly replacing the floor everything else falls back to.
 */
import { describe, expect, it } from 'vitest'

import {
  EN_KEYS,
  coverageIn,
  orderedLanguages,
  packFrom,
  translatorFor,
  unknownKeysIn,
} from './packs.js'

const someKey = EN_KEYS[0]!
const otherKey = EN_KEYS[1]!

describe('reading an uploaded pack', () => {
  it('falls back to English key by key rather than printing the key', () => {
    const t = translatorFor(packFrom({ code: 'nl', label: 'Nederlands', strings: { [someKey]: 'Vertaald' } }))
    expect(t(someKey)).toBe('Vertaald')
    // The untranslated one prints English, which an analyst can decide about;
    // printing `column.hash` is a defect a customer finds.
    expect(t(otherKey)).not.toBe(otherKey)
    expect(t(otherKey).length).toBeGreaterThan(0)
  })

  it('returns the key itself when nothing anywhere has it', () => {
    const t = translatorFor(packFrom({ code: 'nl', label: 'Nederlands', strings: {} }))
    expect(t('no.such.key')).toBe('no.such.key')
  })

  it('names every key English does not have', () => {
    // A typo'd key is a string that can never render, and nothing downstream
    // would ever say so -- the pack simply looks less complete than it is.
    const found = unknownKeysIn({ [someKey]: 'ok', 'colunm.hash': 'typo', 'made.up': 'x' })
    expect(found.sort()).toEqual(['colunm.hash', 'made.up'])
  })

  it('stores none of the keys English has no place for', () => {
    /**
     * **Reporting them is not the same as refusing them**, and a mutation that
     * stores them leaves the rest of this file green. A stored key that can
     * never render makes the row disagree with its own coverage figure for the
     * life of the pack.
     */
    const pack = packFrom({
      code: 'nl',
      label: 'Nederlands',
      strings: { [someKey]: 'Vertaald', 'colunm.hash': 'typo' },
    })
    expect(Object.keys(pack.strings)).toEqual([someKey])
  })

  it('measures coverage against English, ignoring keys English lacks', () => {
    const half = Object.fromEntries(EN_KEYS.slice(0, Math.floor(EN_KEYS.length / 2)).map((k) => [k, 'x']))
    expect(coverageIn(half)).toBeCloseTo(0.5, 1)
    expect(coverageIn({ ...half, 'not.a.key': 'x' })).toBeCloseTo(coverageIn(half), 5)
  })

  it('counts an empty string as untranslated', () => {
    expect(coverageIn({ [someKey]: '' })).toBe(0)
    const t = translatorFor(packFrom({ code: 'nl', label: 'N', strings: { [someKey]: '' } }))
    expect(t(someKey)).not.toBe('')
  })

  it('is 1 for English itself and 0 for a pack with nothing', () => {
    expect(coverageIn(Object.fromEntries(EN_KEYS.map((k) => [k, 'x'])))).toBe(1)
    expect(coverageIn({})).toBe(0)
  })
})

/**
 * **Asserted against an arbitrary list rather than the packs this build
 * ships**, so the order survives an install uploading one.
 */
describe('the order the report form offers languages in', () => {
  const stored = [
    { code: 'de', label: 'Deutsch', coverage: 0.4, builtin: false },
    { code: 'nl', label: 'Nederlands', coverage: 0.65, builtin: true },
    { code: 'af', label: 'Afrikaans', coverage: 0.2, builtin: false },
  ]

  it('leads with English, whatever is stored', () => {
    // English is the floor every other pack falls through, so it is not one
    // option among several -- sorting it in by name would put it after
    // Afrikaans and Deutsch.
    expect(orderedLanguages(stored)[0]).toEqual({
      code: 'en', label: 'English', coverage: 1, builtin: true,
    })
  })

  it('sorts the rest by their own label rather than by code', () => {
    // The analyst reads labels, so labels are what this sorts on -- though the
    // fixture's codes sort the same way, so the assertion pins the sequence
    // rather than telling the two rules apart.
    expect(orderedLanguages(stored).slice(1).map((one) => one.code)).toEqual(['af', 'de', 'nl'])
  })

  it('offers English alone when the install stores nothing', () => {
    expect(orderedLanguages([]).map((one) => one.code)).toEqual(['en'])
  })

  it('never offers a stored English row beside the real one', () => {
    // An install that got an `en` row past the door would otherwise see the
    // language twice, and the two would disagree about coverage.
    const withEnglish = [...stored, { code: 'en', label: 'Engels', coverage: 0.1, builtin: false }]
    expect(orderedLanguages(withEnglish).filter((one) => one.code === 'en')).toHaveLength(1)
  })
})
