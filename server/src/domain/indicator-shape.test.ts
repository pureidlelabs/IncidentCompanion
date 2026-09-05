import { describe, expect, it } from 'vitest'

import { adviseIndicator } from './indicator-shape.js'

/**
 * **Advice, not refusal, and the distinction is the whole design.**
 *
 * `network-indicator.ts` checks a value's *length* - `min(1).max(2048)` - and
 * nothing about its shape, so kind `ipv6` accepts `asdfasdfasdfasdfasdf` and
 * `port` accepts `asdfasdf`. The maintainer's call is that a wrong-looking value is
 * warned about, never refused: an analyst pasting a half-redacted address, a
 * defanged domain or a value straight off a vendor console into an incident
 * record is doing their job, and a form that refuses it makes them keep it
 * somewhere the case cannot see.
 *
 * So every case here is about what the analyst is *told*. Nothing in this
 * module can stop a write, and `network-indicator.ts` is untouched.
 */
describe('what an indicator value is advised about', () => {
  it('says nothing about a value that matches its kind', () => {
    expect(adviseIndicator({ type: 'ipv4', value: '203.0.113.24' })).toEqual({})
    expect(adviseIndicator({ type: 'ipv6', value: '2001:db8::1' })).toEqual({})
    expect(adviseIndicator({ type: 'domain', value: 'mail.example.invalid' })).toEqual({})
    expect(adviseIndicator({ type: 'url', value: 'https://example.invalid/a' })).toEqual({})
  })

  it('names the kind it does not look like', () => {
    expect(adviseIndicator({ type: 'ipv6', value: 'asdfasdfasdfasdfasdf' })).toEqual({
      value: 'This does not look like an IPv6 address.',
    })
    expect(adviseIndicator({ type: 'ipv4', value: '999.1.1.1' })).toEqual({
      value: 'This does not look like an IPv4 address.',
    })
    expect(adviseIndicator({ type: 'domain', value: 'not a domain' })).toEqual({
      value: 'This does not look like a domain.',
    })
    expect(adviseIndicator({ type: 'url', value: 'example.invalid/a' })).toEqual({
      value: 'This does not look like a URL.',
    })
  })

  /**
   * **A bare address is not a domain**, and the final label is what decides
   * it. Without that rule `203.0.113.24` satisfies the domain shape - dotted
   * labels - and an analyst who picked the wrong kind is told nothing.
   */
  it('does not read an address as a domain', () => {
    expect(adviseIndicator({ type: 'domain', value: '203.0.113.24' })).toEqual({
      value: 'This does not look like a domain.',
    })
  })

  /**
   * **A homograph domain is evidence, and it is written in its own script.**
   * An analyst investigating one copies what the victim saw - the Unicode
   * form, out of a browser or an alert - and telling them it does not look
   * like a domain is a false complaint in the one case where the domain's
   * shape is the entire finding.
   */
  it.each([
    ['Cyrillic', '\u043f\u0440\u0438\u043c\u0435\u0440.\u0440\u0444'],
    ['a German umlaut', 'b\u00fcrger.example'],
    ['a mixed-script label', 'payp\u0430l.com'],
    ['the punycode of the same name', 'xn--80ak6aa92e.com'],
  ])('says nothing about a domain written with %s', (_name, value) => {
    expect(adviseIndicator({ type: 'domain', value })).toEqual({})
  })

  /**
   * **Widening to letters must not widen to digits**, or the rule that keeps a
   * bare address out of the domain box goes with it.
   */
  it('still refuses a numeric final label after allowing other scripts', () => {
    expect(adviseIndicator({ type: 'domain', value: '203.0.113.24' })).toEqual({
      value: 'This does not look like a domain.',
    })
    expect(adviseIndicator({ type: 'domain', value: 'example.123' })).toEqual({
      value: 'This does not look like a domain.',
    })
  })

  /**
   * **A character nobody can see is not a malformed value.** The column strips
   * these before storing, so advice that fired on them would be a complaint
   * about something the analyst cannot find and the store is about to remove.
   */
  it('says nothing about a value carrying an invisible character', () => {
    expect(adviseIndicator({ type: 'ipv4', value: '203.0.113\u200b.24' })).toEqual({})
    expect(adviseIndicator({ type: 'domain', value: 'evil.example.invalid\u200b' })).toEqual({})
    expect(adviseIndicator({ type: 'ipv4', value: '203.0.113.24', port: '44\u200b3' })).toEqual({})
  })

  /**
   * **A host and port pasted into one box is a domain, not a mistake.** The
   * row has a port field, so this could be advice to split them - but the
   * value *is* a domain, and telling an analyst it is not is the kind of wrong
   * sentence that trains them to stop reading.
   */
  it('says nothing about a domain carrying a port', () => {
    expect(adviseIndicator({ type: 'domain', value: 'evil.example.invalid:8080' })).toEqual({})
  })

  /**
   * **Defanged is the ordinary case, not a mistake.** An analyst pastes
   * `hxxps://evil[.]example` out of a report or a ticket precisely so it
   * cannot be clicked, and telling them it is malformed is telling them off
   * for the safe habit. `defang` is a whole area of this product.
   */
  it('says nothing about a defanged value', () => {
    expect(adviseIndicator({ type: 'domain', value: 'evil[.]example' })).toEqual({})
    expect(adviseIndicator({ type: 'url', value: 'hxxps://evil[.]example/a' })).toEqual({})
    expect(adviseIndicator({ type: 'ipv4', value: '203.0.113[.]24' })).toEqual({})
  })

  /**
   * **Markers this product does not write are still recognised.** A value
   * arrives pasted from somebody else's console or ticketing system, and
   * `(.)` and `[:]` are the two other spellings in common use. Silence costs
   * nothing here; a false complaint costs the analyst's attention.
   */
  it('says nothing about a value defanged in the spelling another tool uses', () => {
    expect(adviseIndicator({ type: 'domain', value: 'evil(.)example' })).toEqual({})
    expect(adviseIndicator({ type: 'url', value: 'https[:]//evil.example/a' })).toEqual({})
  })

  /**
   * A field being filled in is not yet wrong. Advice on every keystroke of
   * `2001:` would fire on the way to a correct value, which trains the analyst
   * to ignore it.
   */
  it('says nothing about an empty value', () => {
    expect(adviseIndicator({ type: 'ipv6', value: '' })).toEqual({})
    expect(adviseIndicator({ type: 'ipv6', value: '   ' })).toEqual({})
  })

  it('says nothing when no kind is chosen yet', () => {
    expect(adviseIndicator({ type: '', value: 'asdfasdf' })).toEqual({})
    expect(adviseIndicator({ value: 'asdfasdf' })).toEqual({})
  })

  /**
   * **The IPv6 forms that are real and look wrong.** A compressed run, a
   * loopback, an IPv4-mapped address and a zone index are all ordinary in an
   * incident record, and each one fails a naive "hex groups and colons" rule.
   * Every entry here is a value that must draw silence.
   */
  it.each([
    '2001:db8::1',
    '::1',
    '::',
    'fe80::1%eth0',
    '::ffff:192.0.2.1',
    '2001:0db8:0000:0000:0000:0000:0000:0001',
  ])('says nothing about the IPv6 address %s', (value) => {
    expect(adviseIndicator({ type: 'ipv6', value })).toEqual({})
  })

  /** A port is a number in a range, and the column is a string. */
  it('advises on a port that is not a port', () => {
    expect(adviseIndicator({ type: 'ipv4', value: '203.0.113.24', port: 'asdfasdf' })).toEqual({
      port: 'A port is a number from 1 to 65535.',
    })
    expect(adviseIndicator({ type: 'ipv4', value: '203.0.113.24', port: '70000' })).toEqual({
      port: 'A port is a number from 1 to 65535.',
    })
    expect(adviseIndicator({ type: 'ipv4', value: '203.0.113.24', port: '0' })).toEqual({
      port: 'A port is a number from 1 to 65535.',
    })
    expect(adviseIndicator({ type: 'ipv4', value: '203.0.113.24', port: '-1' })).toEqual({
      port: 'A port is a number from 1 to 65535.',
    })
    expect(adviseIndicator({ type: 'ipv4', value: '203.0.113.24', port: '44 3' })).toEqual({
      port: 'A port is a number from 1 to 65535.',
    })
  })

  /**
   * **`Number` is not the test, and this is the case that says why.** `443e2`
   * and ` 443 ` both survive `Number()` as finite numbers in range; a port is
   * digits, so the digits are what is checked.
   */
  it('advises on a port that only numbers like one', () => {
    expect(adviseIndicator({ type: 'ipv4', value: '203.0.113.24', port: '443e2' })).toEqual({
      port: 'A port is a number from 1 to 65535.',
    })
    expect(adviseIndicator({ type: 'ipv4', value: '203.0.113.24', port: '0x1bb' })).toEqual({
      port: 'A port is a number from 1 to 65535.',
    })
  })

  it('says nothing about a port that is one', () => {
    expect(adviseIndicator({ type: 'ipv4', value: '203.0.113.24', port: '443' })).toEqual({})
    expect(adviseIndicator({ type: 'ipv4', value: '203.0.113.24', port: '1' })).toEqual({})
    expect(adviseIndicator({ type: 'ipv4', value: '203.0.113.24', port: '65535' })).toEqual({})
    expect(adviseIndicator({ type: 'ipv4', value: '203.0.113.24', port: '' })).toEqual({})
  })

  /** Both at once, because a form shows every field's advice at the same time. */
  it('advises on the value and the port together', () => {
    expect(adviseIndicator({ type: 'ipv6', value: 'nonsense', port: 'nonsense' })).toEqual({
      value: 'This does not look like an IPv6 address.',
      port: 'A port is a number from 1 to 65535.',
    })
  })

  /**
   * **The kinds are a closed vocabulary, and the advice covers all of it.**
   * A kind added to `INDICATOR_TYPE` with no shape beside it is silent
   * forever, which reads exactly like a value that is always correct.
   */
  it('has a sentence for every kind the vocabulary declares', async () => {
    const { INDICATOR_TYPE } = await import('./vocabularies.lists.js')

    for (const kind of INDICATOR_TYPE) {
      expect(adviseIndicator({ type: kind, value: 'definitely not one of these' })).toEqual({
        value: expect.stringContaining('does not look like'),
      })
    }
  })
})

/**
 * **The pair that must not drift**, bound rather than described.
 *
 * The advice above stays silent on a defanged value, and what "defanged" means
 * is decided by `report/document/defang.ts` - it is the thing that writes
 * them. A marker added there and not here would start advising analysts that
 * this product's own output is malformed.
 *
 * A domain module may not import from `report/`, and does not: this is a test,
 * and `architecture.test.ts` puts tests outside the layering rule because
 * nothing imports one, so none can cycle.
 *
 * **Only the `ipv4` and `domain` rows bind anything, and that is measured
 * rather than assumed.** Deleting the defanged check leaves both `url` rows
 * green: a defanged URL still carries a scheme, so the URL shape calls it
 * plausible and the advice is silent for a reason that has nothing to do with
 * defanging. They are kept because the outcome is what an analyst sees, and
 * named here so nobody reads them as cover for the marker vocabulary.
 */
describe('whatever the defanger writes, the advice recognises', () => {
  it.each([
    ['ipv4' as const, '203.0.113.24'],
    ['domain' as const, 'evil.example.com'],
    ['url' as const, 'http://evil.example.com/a'],
    ['url' as const, 'HTTPS://EVIL.COM/x'],
  ])('says nothing about a defanged %s', async (kind, live) => {
    const { defangIndicator } = await import('../report/document/defang.js')

    // The live value is advised on or not on its own merits; what matters is
    // that defanging it never produces a complaint.
    expect(adviseIndicator({ type: kind, value: defangIndicator(live) })).toEqual({})
  })
})
