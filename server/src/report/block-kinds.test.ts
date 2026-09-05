/**
 * The Add-section menu's vocabulary.
 */
import { describe, expect, it } from 'vitest'

import {
  UNDRAWABLE_KINDS,
  WRITTEN_BLOCK,
  blockKindGroups,
  kindsWithoutAGroup,
} from './block-kinds.js'
import { BLOCK_KINDS } from '../domain/entities/report.js'
import { EN_KEYS } from './document/packs.js'
import { EN } from './document/labels.en.js'
import { RESOLVERS } from './document/resolve.js'

describe('the sections a report can hold', () => {
  it('offers every kind the model has', () => {
    expect(kindsWithoutAGroup(), 'these kinds exist and no menu offers them').toEqual([])
  })

  it('offers each kind exactly once', () => {
    // A kind in two groups is one an analyst meets twice and picks at random.
    const offered = blockKindGroups().flatMap((group) => group.kinds.map((one) => one.kind))
    expect(offered.length).toBe(new Set(offered).size)
    expect(offered.length).toBe(BLOCK_KINDS.length - UNDRAWABLE_KINDS.length)
  })

  /**
   * **The third agreement.**
   */
  it('offers only kinds this build can actually draw', () => {
    const undrawable = blockKindGroups()
      .flatMap((group) => group.kinds.map((one) => one.kind))
      .filter((kind) => kind !== WRITTEN_BLOCK && !(kind in RESOLVERS))
    expect(undrawable, 'the menu offers a section every export refuses').toEqual([])
  })

  /**
   * **And the exception list may not become where a kind gets hidden.**
   */
  it('excuses only kinds that genuinely have no resolver', () => {
    const drawable = UNDRAWABLE_KINDS.filter(
      (kind) => kind === WRITTEN_BLOCK || kind in RESOLVERS,
    )
    expect(drawable, 'this kind can be drawn, so the menu owes it a group').toEqual([])
  })

  it('names only kinds the model has as undrawable', () => {
    // An excused kind that is not in the vocabulary is a stale entry silently
    // widening `kindsWithoutAGroup`'s exemption.
    const strangers = UNDRAWABLE_KINDS.filter((kind) => !BLOCK_KINDS.includes(kind as never))
    expect(strangers).toEqual([])
  })

  it('names a written block in the menu, and hands out no words for it', () => {
    // **The one kind the menu has to name for itself.** Every other label is
    // the pack's English heading; a written section has none, because the
    // analyst titles it - so a menu built from headings alone offers a
    // nameless item.
    const written = blockKindGroups()
      .flatMap((group) => group.kinds)
      .find((one) => one.kind === 'written')

    expect(written?.label).toBe('Written section')
    // Re-anchored from `heading === ''`: the menu carries no heading for any
    // kind now. Posting the English words is what made a section added here
    // print English in a Dutch report for ever.
    expect(written).not.toHaveProperty('heading')
  })

  it('offers every other kind under the heading the report prints', () => {
    const kinds = blockKindGroups().flatMap((group) => group.kinds)
    for (const one of kinds) {
      if (one.kind === WRITTEN_BLOCK) continue
      // The label *is* the pack's English heading, read from the one place it
      // is written down - so a copy edit cannot land on the menu and miss the
      // document, which it could while these were two lists.
      expect(one.label, `${one.kind} is offered as something else`).toBe(
        EN[`heading.${one.kind}`],
      )
    }
  })

  it('says what the report calls a technique table, not what the slug does', () => {
    // Prettifying the slug gives "Technique table"; the document says
    // "Techniques observed". The headings are copy, which is why they are
    // stated rather than derived - and they are stated once, in the pack, so
    // the menu and the document cannot drift apart.
    const table = blockKindGroups()
      .flatMap((group) => group.kinds)
      .find((one) => one.kind === 'technique_table')
    expect(table?.label).toBe('Techniques observed')
  })

  it('gives every drawable kind the heading key the document looks up', () => {
    const drawable = BLOCK_KINDS.filter(
      (kind) => kind !== WRITTEN_BLOCK && !UNDRAWABLE_KINDS.includes(kind),
    )
    expect(drawable.length).toBeGreaterThan(10)
    const missing = drawable
      .filter((kind) => !EN_KEYS.includes(`heading.${kind}`))
      .map((kind) => `${kind} -> heading.${kind}`)
    expect(missing, 'add the key to labels.en.ts, which is the pack schema').toEqual([])
  })

  it('leaves the written block with no key of its own', () => {
    expect(EN_KEYS).not.toContain(`heading.${WRITTEN_BLOCK}`)
  })

  it('draws the groups in the order the story runs', () => {
    expect(blockKindGroups().map((group) => group.heading)).toEqual([
      'Write your own',
      'The case in short',
      'What happened',
      'What we found',
      'What we did',
      'Reference',
    ])
  })
})
