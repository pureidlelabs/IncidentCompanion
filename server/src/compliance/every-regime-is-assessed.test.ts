/**
 * A regime the vocabulary offers is one the assessment knows about.
 *
 * `Record<RegimeKey, ...>` in `verdict.ts` and `readiness.ts` refuses a key
 * with no entry, at compile time. `REGIMES` here is an array, so a key missing
 * from it compiles: the regime is offered in Settings, accepted on a customer,
 * and then filtered out of every assessment with nothing saying so.
 */
import { describe, expect, it } from 'vitest'

import { REGIMES } from './regimes.js'
import { REGIME_KEYS } from '../domain/vocabularies/regimes.js'

describe('the regimes an assessment covers', () => {
  it('covers every regime the vocabulary offers', () => {
    expect([...REGIMES.map((one) => one.key)].sort()).toEqual([...REGIME_KEYS].sort())
  })
})
