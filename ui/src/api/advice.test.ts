import { describe, expect, it } from 'vitest'

import { adviceFor } from './advice'

/**
 * **The door, not the rule.** What counts as a plausible indicator is decided
 * in `@contract/indicator-shape` and tested there against every kind, every
 * defang spelling and the port range. What is tested here is the dispatch: a
 * collection this does not advise on, a draft holding something that is not a
 * string, and that the sentence arrives keyed by the field it is about.
 */
describe('what a draft is advised about', () => {
  it('says nothing about a collection that has no shape rules', () => {
    expect(adviceFor('evidence', { type: 'ipv6', value: 'nonsense' })).toEqual({})
    expect(adviceFor('systems', { type: 'ipv6', value: 'nonsense' })).toEqual({})
  })

  /**
   * **A hostname is not advised on and that is the decision, not an
   * omission.** An analyst writes `Finance laptop` into one legitimately, so a
   * shape rule there would fire on correct input - which is how a warning
   * stops being read. Only a field whose wrong shape has a consequence the
   * analyst cannot see gets one.
   */
  it('says nothing about a hostname, whatever it looks like', () => {
    expect(adviceFor('systems', { hostname: 'Finance laptop' })).toEqual({})
  })

  it('advises on a malware hash, keyed by field', () => {
    expect(adviceFor('malware', { filename: 'invoice.exe', hash: 'nonsense' })).toEqual({
      hash: 'This does not look like a file hash.',
    })
  })

  it('says nothing about a malware hash that is one', () => {
    expect(
      adviceFor('malware', { hash: 'd41d8cd98f00b204e9800998ecf8427e' }),
    ).toEqual({})
  })

  /** A sample is keyed on its filename; the hash is optional and often absent. */
  it('says nothing about a malware row with no hash yet', () => {
    expect(adviceFor('malware', { filename: 'invoice.exe' })).toEqual({})
  })

  it('says nothing when the form owns no collection', () => {
    expect(adviceFor(null, { type: 'ipv6', value: 'nonsense' })).toEqual({})
    expect(adviceFor(undefined, { type: 'ipv6', value: 'nonsense' })).toEqual({})
  })

  it('advises on a network indicator, keyed by field', () => {
    expect(adviceFor('network_indicators', { type: 'ipv6', value: 'nonsense' })).toEqual({
      value: 'This does not look like an IPv6 address.',
    })
  })

  it('says nothing about a network indicator that looks right', () => {
    expect(
      adviceFor('network_indicators', { type: 'ipv4', value: '203.0.113.24', port: '443' }),
    ).toEqual({})
  })

  /**
   * **A draft holds whatever the controls put in it**, including `null` for a
   * cleared reference and `false` for an unticked box. Reading one of those as
   * a value would advise on the word `null`.
   */
  it('ignores a field that is not text', () => {
    expect(
      adviceFor('network_indicators', {
        type: 'ipv4',
        value: '203.0.113.24',
        port: null,
        systemId: null,
        blocked: false,
      }),
    ).toEqual({})
  })

  /** An untouched form is not yet wrong, so an absent field advises nothing. */
  it('says nothing about a draft that is still empty', () => {
    expect(adviceFor('network_indicators', {})).toEqual({})
  })
})
