import { describe, expect, it } from 'vitest'

import { BLANK_LAYOUT } from './block-kinds.js'
import { offeredLayouts, shippedAssesses, type LayoutSource } from './offered-layouts.js'

/**
 * Which layouts an install offers, and which it must not.
 *
 * `library`'s specification states the withholding as a MUST: an install that
 * does not assess against a regime must not offer the layouts that exist to
 * report under it. -> #200
 *
 * The demo publishes this same function against the shipped fallbacks, so a
 * capture cannot answer differently from the route it stands in for. -> #884
 */
const plain: LayoutSource = {
  name: 'standard',
  label: 'Customer RCA',
  summary: 'The full account.',
  builtin: true,
  blocks: [{ kind: 'exec_summary', headingKey: 'heading.exec_summary' }],
}

const regulatory: LayoutSource = {
  name: 'nis2-early',
  label: 'NIS2 early warning',
  summary: 'The first of the three.',
  builtin: true,
  requiresFeature: 'nis2',
  blocks: [{ kind: 'exec_summary', heading: 'Early warning' }],
}

/** A layout an analyst dropped in, and one under a regime that is not NIS2. */
const dropped: LayoutSource = {
  name: 'house-style',
  label: 'House style',
  summary: 'What this team writes.',
  builtin: false,
  blocks: [],
}

const otherRegime: LayoutSource = {
  name: 'dora-incident',
  label: 'DORA incident report',
  summary: 'The one DORA asks for.',
  builtin: true,
  requiresFeature: 'dora',
  blocks: [],
}

describe('the layouts an install offers', () => {
  it('withholds a layout whose feature the install does not assess', () => {
    const offered = offeredLayouts(
      [plain, regulatory],
      (key) => key,
      () => false,
    )

    expect(offered.map((one) => one.name)).toEqual(['standard', BLANK_LAYOUT])
  })

  it('offers it where the install does assess that feature', () => {
    const offered = offeredLayouts(
      [plain, regulatory],
      (key) => key,
      () => true,
    )

    expect(offered.map((one) => one.name)).toEqual(['standard', 'nis2-early', BLANK_LAYOUT])
  })

  it('asks about the feature the layout names, not about a list it keeps', () => {
    // Nothing here enumerates regimes: a fifth regulatory layout is covered
    // the day somebody drops it in.
    const asked: string[] = []
    offeredLayouts(
      [regulatory],
      (key) => key,
      (feature) => {
        asked.push(feature)
        return true
      },
    )

    expect(asked).toEqual(['nis2'])
  })

  it('marks the NIS2 one and not another regime\u2019s', () => {
    // `dora-incident` names a feature too, so a mapping asking whether a
    // feature exists rather than which one would mark it as well.
    const offered = offeredLayouts(
      [plain, regulatory, otherRegime],
      (key) => key,
      () => true,
    )

    expect(offered.filter((one) => one.nis2).map((one) => one.name)).toEqual(['nis2-early'])
  })

  it('says which layouts the install ships and which an analyst wrote', () => {
    const offered = offeredLayouts(
      [plain, dropped],
      (key) => key,
      () => true,
    )

    expect(offered.map((one) => [one.name, one.builtin])).toEqual([
      ['standard', true],
      ['house-style', false],
      ['__blank__', true],
    ])
  })

  it('carries every field the route answers with', () => {
    // The shape, not only the names: each of these was unasserted, so a
    // mapping that dropped a summary or flattened a heading read as correct.
    const [offered] = offeredLayouts(
      [regulatory],
      (key) => key,
      () => true,
    )

    expect(offered).toEqual({
      name: 'nis2-early',
      label: 'NIS2 early warning',
      summary: 'The first of the three.',
      builtin: true,
      nis2: true,
      blocks: [
        {
          kind: 'exec_summary',
          position: 0,
          heading: 'Early warning',
          headingKey: '',
          label: 'Early warning',
        },
      ],
    })
  })

  it.each([
    [
      'the block`s own heading, over everything',
      { kind: 'k', heading: 'Written', headingKey: 'heading.k' },
      'Written',
    ],
    [
      'its heading key through the pack',
      { kind: 'k', headingKey: 'heading.named' },
      'Named in the pack',
    ],
    ['its kind through the pack, where nothing else names it', { kind: 'known' }, 'Known by kind'],
    ['the kind prettified, where the pack does not know it', { kind: 'un_named' }, 'Un named'],
  ] as const)('labels a block by %s', (_what, block, expected) => {
    const pack: Record<string, string> = {
      'heading.named': 'Named in the pack',
      'heading.known': 'Known by kind',
    }
    const [offered] = offeredLayouts(
      [{ ...plain, blocks: [block] }],
      (key) => pack[key] ?? key,
      () => true,
    )

    expect(offered?.blocks[0]?.label).toBe(expected)
  })

  it('always ends with the blank layout, so a form has something to land on', () => {
    expect(
      offeredLayouts(
        [],
        (key) => key,
        () => true,
      ).map((one) => one.name),
    ).toEqual([BLANK_LAYOUT])
  })

  it('numbers a layout\u2019s blocks in the order it declares them', () => {
    const offered = offeredLayouts(
      [{ ...plain, blocks: [{ kind: 'one' }, { kind: 'two' }] }],
      (key) => key,
      () => true,
    )

    expect(offered[0]?.blocks.map((block) => [block.kind, block.position])).toEqual([
      ['one', 0],
      ['two', 1],
    ])
  })
})

describe('what a shipped install assesses', () => {
  it.each(['nis2', 'gdpr', 'dora'])('assesses %s, which every fallback turns on', (feature) => {
    expect(shippedAssesses(feature)).toBe(true)
  })

  it('assesses a feature it has never heard of not at all', () => {
    // The cast makes the optional chain look unnecessary to the compiler, so
    // this is what keeps it: without it an unknown feature is a TypeError
    // rather than a refusal, and the route answers `false` here too.
    expect(shippedAssesses('ccpa')).toBe(false)
  })
})
