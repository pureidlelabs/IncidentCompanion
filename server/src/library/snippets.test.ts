/**
 * Written from an attack on the snippet schema, not from its intention.
 */
import { describe, expect, it } from 'vitest'

import { BUILTIN_REPORT_SNIPPETS } from './builtins/report-snippets.js'
import { SNIPPET_SLOTS, reportSnippetSchema } from './kinds.js'

const valid = {
  slot: 'exec_summary',
  hint: 'Opens a customer RCA where the operator was hands-on-keyboard.',
  body: 'A macro-enabled phishing email led to a human-operated ransomware incident.',
}

describe('a report snippet', () => {
  it('accepts a filled entry', () => {
    expect(reportSnippetSchema.safeParse(valid).success).toBe(true)
  })

  /**
   * A blank entry is a draft, not a defect. This does not cover the rule that
   * an empty entry must not be *offered*, which lives where the offer is made.
   */
  it('lets a brand-new entry be blank, because that is what New writes', () => {
    const blank = reportSnippetSchema.parse({})
    expect(blank).toEqual({ slot: '', hint: '', body: '', translations: [] })
  })

  it('carries all its languages on one entry', () => {
    // **One entry, not one row per language.** It keeps a translation paired
    // with its original and makes "which languages does this have" answerable
    // without a join.
    const parsed = reportSnippetSchema.parse({
      ...valid,
      translations: [
        { language: 'nl', body: 'Een phishingmail met macro leidde tot een ransomware-incident.' },
      ],
    })
    expect(parsed.translations.map((one) => one.language)).toEqual(['nl'])
  })

  it('defaults to no translations rather than requiring the key', () => {
    // The common entry is English-only; demanding an empty list would make
    // every hand-written one wrong in the same way.
    expect(reportSnippetSchema.parse(valid).translations).toEqual([])
  })

  it('refuses a translation whose body is empty', () => {
    // This is the one that lies: the entry advertises Dutch, the picker offers
    // it in a Dutch report, and inserting it produces nothing.
    const refused = reportSnippetSchema.safeParse({
      ...valid,
      translations: [{ language: 'nl', body: '' }],
    })
    expect(refused.success).toBe(false)
  })

  /**
   * A list can hold one language twice where a map could not, so the property
   * the map gave for free has to be asserted: two Dutch rows means whichever
   * the reader reaches first wins, silently.
   */
  it('refuses the same language twice', () => {
    const refused = reportSnippetSchema.safeParse({
      ...valid,
      translations: [
        { language: 'nl', body: 'Eerste' },
        { language: 'nl', body: 'Tweede' },
      ],
    })
    expect(refused.success).toBe(false)
  })

  it.each(['nl-NL', 'fr-BE', 'sr-Latn-RS'])('accepts %s, a real language tag', (tag) => {
    const parsed = reportSnippetSchema.safeParse({
      ...valid,
      translations: [{ language: tag, body: 'x' }],
    })
    expect(parsed.success).toBe(true)
  })

  it.each(['dutch', 'n', 'nl_NL', '../etc', 'nl NL'])(
    'refuses %s, which is not one',
    (tag) => {
      // A tag that matches no pack can never be selected, so the entry silently
      // has one fewer language than its author believes.
      const refused = reportSnippetSchema.safeParse({
        ...valid,
        translations: [{ language: tag, body: 'x' }],
      })
      expect(refused.success).toBe(false)
    },
  )
})

describe('the slot an entry is filed under', () => {
  /**
   * **The picker groups on it, so a slot nobody groups on is a snippet nobody is
   * offered.**
   */
  it.each(['exec summary', 'Exec_Summary', 'exec_opener', 'containment'])(
    'refuses %s, which is not one of the eight',
    (slot) => {
      expect(reportSnippetSchema.safeParse({ ...valid, slot }).success).toBe(false)
    },
  )

  it('still accepts the empty slot a blank entry starts with', () => {
    expect(reportSnippetSchema.safeParse({ ...valid, slot: '' }).success).toBe(true)
  })

  /**
   * The generated file and the vocabulary are written apart, which is exactly
   * how the two spellings above got in.
   */
  it('is one the vocabulary carries, for every entry shipped', () => {
    const strange = [...new Set(BUILTIN_REPORT_SNIPPETS.map((one) => one.payload.slot))]
      .filter((slot) => !(SNIPPET_SLOTS as readonly string[]).includes(slot))
    expect(strange).toEqual([])
  })
})
