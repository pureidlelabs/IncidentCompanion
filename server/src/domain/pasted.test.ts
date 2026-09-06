import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { INVISIBLE, pasted } from './pasted.js'

/**
 * **Written as an attack on the normaliser**, in both directions: what real
 * evidence does it damage, and what paste artefact does it still let through?
 *
 * The stakes are silent rather than loud. A value carrying an invisible
 * character renders identically to one without, so nothing on screen ever
 * shows the difference -- and `collections/identity.ts` keys on the string, so
 * the two are two rows for ever.
 */
const schema = pasted(z.string().trim().max(255))

describe('what a pasted value is normalised of', () => {
  it.each([
    ['zero width space', '\u200b'],
    ['word joiner', '\u2060'],
    ['byte order mark', '\ufeff'],
    ['soft hyphen', '\u00ad'],
    ['left-to-right mark', '\u200e'],
    ['right-to-left mark', '\u200f'],
    ['left-to-right embedding', '\u202a'],
    ['right-to-left override', '\u202e'],
    ['pop directional formatting', '\u202c'],
    ['first strong isolate', '\u2068'],
    ['pop directional isolate', '\u2069'],
  ])('strips a trailing %s', (_name, mark) => {
    expect(schema.parse(`203.0.113.24${mark}`)).toBe('203.0.113.24')
  })

  /**
   * **Interior is the case `.trim()` cannot reach**, and the one a paste out of
   * a wrapped console line actually produces.
   */
  it('strips an invisible character from the middle of a value', () => {
    expect(schema.parse('203.0.113\u200b.24')).toBe('203.0.113.24')
    expect(schema.parse('d41d8cd98f00b204\u00ade9800998ecf8427e')).toBe(
      'd41d8cd98f00b204e9800998ecf8427e',
    )
  })

  /**
   * **A right-to-left override in an identity field is a spoof, not a typo.**
   * `evil\u202egpj.exe` renders as `evilexe.jpg` and is keyed, exported and
   * searched as the executable it is. Stripping it makes the screen agree with
   * the store.
   */
  it('makes a display-reordered filename read as what is stored', () => {
    expect(schema.parse('invoice\u202egpj.exe')).toBe('invoicegpj.exe')
  })

  /**
   * **Stripping happens before trimming, or an invisible at the edge strands
   * ordinary space behind it.** `"host \u200b"` trims to `"host \u200b"`,
   * because the last character is not whitespace.
   */
  it('trims space that an invisible character was hiding behind', () => {
    expect(schema.parse('web01 \u200b')).toBe('web01')
    expect(schema.parse('\ufeff  web01')).toBe('web01')
  })

  /**
   * **A zero-width joiner shapes a word and is left alone.** Persian and the
   * Indic scripts use `\u200c` and `\u200d` to distinguish two different
   * spellings, so removing them edits the analyst's evidence rather than
   * cleaning it -- unlike every mark above, which no reader can see and no
   * script needs.
   */
  it('leaves the two invisibles a script uses to shape a word', () => {
    expect(schema.parse('\u200cmiddle\u200d')).toBe('\u200cmiddle\u200d')
    expect(INVISIBLE.test('\u200c')).toBe(false)
    expect(INVISIBLE.test('\u200d')).toBe(false)
  })

  /**
   * **The key separator, which `identity.ts` says cannot occur.** That module
   * joins a composite key with `U+0000` on the stated grounds that nothing in a
   * hostname or an account name can be one. The column stores one happily, so
   * the strip is what makes that true and this is what holds the strip.
   */
  it('strips the NUL that a composite key is joined with', () => {
    expect(schema.parse(`web01${String.fromCharCode(0)}admin`)).toBe('web01admin')
  })

  /** No identity column is multi-line, and a paste out of a console is. */
  it('strips the control characters a paste brings along', () => {
    expect(schema.parse('web01\u0007')).toBe('web01')
    expect(schema.parse('web\n01')).toBe('web01')
    expect(schema.parse('web\u009b01')).toBe('web01')
  })

  /** Ordinary evidence passes through untouched, which is most of the traffic. */
  it.each([
    'WKS-01',
    'evil.example.invalid',
    'hxxps://evil[.]example/a',
    '::ffff:192.0.2.1',
    'd41d8cd98f00b204e9800998ecf8427e',
    'admin@corp.local',
    '\u043f\u0440\u0438\u043c\u0435\u0440.\u0440\u0444',
    '',
  ])('leaves %s exactly as written', (value) => {
    expect(schema.parse(value)).toBe(value)
  })

  /**
   * **The wrapped schema still decides everything else.** Normalising is a
   * preprocess, not a replacement: the length ceiling, the default and the
   * type refusal are the wrapped schema's answers and have to survive.
   */
  it('keeps the wrapped schema in charge of the rest', () => {
    expect(schema.safeParse('x'.repeat(256)).success).toBe(false)
    expect(pasted(z.string().trim().max(9).default('')).parse(undefined)).toBe('')
    expect(schema.safeParse(4).success).toBe(false)
  })

  /**
   * **A ceiling is counted after stripping, not before.** A value padded to
   * the limit by invisible characters is under it once they are gone, and
   * refusing it would be refusing a value the analyst can see is short.
   */
  it('measures the length of what it stores', () => {
    const padded = 'x'.repeat(255) + '\u200b'.repeat(20)
    expect(schema.parse(padded)).toBe('x'.repeat(255))
  })
})
