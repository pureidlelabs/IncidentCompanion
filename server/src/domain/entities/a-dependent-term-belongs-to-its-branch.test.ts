import { describe, expect, it } from 'vitest'

import { DORA_ROOT_CAUSE_DETAILED, DORA_ROOT_CAUSE_HIGH } from '../vocabularies/compliance.js'

import { unofferedTerms } from './case-compliance.js'

/**
 * A term is real and its parent is real and the pair is not.
 *
 * Each level of the DORA root cause is a branch of the level above, and a
 * field schema is handed one value: it can refuse a term nothing defines, and
 * it cannot see which branch the term came from. So a detailed cause filed
 * under a high-level cause that does not offer it passes every field check,
 * and the filing that reaches a regulator names a pair the Regulation does
 * not.
 *
 * **Written from the attack**: the first case proves the pair is genuinely
 * impossible before anything asserts that it is caught, because a check that
 * refused everything would satisfy the second case perfectly.
 */
describe('a dependent compliance term', () => {
  const HIGH = 'human error'
  const FROM_ANOTHER_BRANCH = 'malicious actions: fraudulent actions'
  const ITS_OWN = 'human error: omission'

  it('is a pair the vocabulary really does not offer', () => {
    expect(DORA_ROOT_CAUSE_HIGH as readonly string[], 'the parent has to be real').toContain(HIGH)
    expect(
      Object.values(DORA_ROOT_CAUSE_DETAILED).flat() as readonly string[],
      'the child has to be real too, or this proves nothing',
    ).toContain(FROM_ANOTHER_BRANCH)
    expect(
      DORA_ROOT_CAUSE_DETAILED[HIGH] as readonly string[],
      'and its branch must not offer it',
    ).not.toContain(FROM_ANOTHER_BRANCH)
  })

  it('is named when its parent opens onto no such branch', () => {
    expect(
      unofferedTerms({
        doraRootCauseHigh: [HIGH],
        doraRootCauseDetailed: [FROM_ANOTHER_BRANCH],
      }),
    ).toEqual([{ field: 'doraRootCauseDetailed', term: FROM_ANOTHER_BRANCH }])
  })

  it('passes when the parent offers it', () => {
    expect(
      unofferedTerms({ doraRootCauseHigh: [HIGH], doraRootCauseDetailed: [ITS_OWN] }),
    ).toEqual([])
  })

  /**
   * Answering the child and not the parent is an incomplete filing rather than
   * a contradictory one, and the screen disables the child until the parent is
   * answered. Refusing it would make a row already holding that shape
   * unwritable rather than telling anybody why.
   */
  it('says nothing when the parent holds nothing', () => {
    expect(
      unofferedTerms({ doraRootCauseHigh: [], doraRootCauseDetailed: [FROM_ANOTHER_BRANCH] }),
    ).toEqual([])
  })

  /**
   * The third level is the same relationship one step down, and it is the one
   * a regulator reads as the most specific answer.
   */
  it('reads the third level against the second', () => {
    const detailed = 'process failure: ICT risk management process failure'
    const elsewhere = 'backup and restore'

    expect(
      unofferedTerms({
        doraRootCauseDetailed: [detailed],
        doraRootCauseAdditional: [elsewhere],
      }).map((one) => one.field),
    ).toEqual(['doraRootCauseAdditional'])
  })
})
