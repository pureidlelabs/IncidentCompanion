import { describe, expect, it } from 'vitest'

import { BLANK_LAYOUT } from './block-kinds.js'
import { offeredLayouts, type LayoutSource } from './offered-layouts.js'

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

  it('marks the regulatory one and nothing else', () => {
    const offered = offeredLayouts(
      [plain, regulatory],
      (key) => key,
      () => true,
    )

    expect(offered.filter((one) => one.nis2).map((one) => one.name)).toEqual(['nis2-early'])
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

  it('numbers a layout`s blocks in the order it declares them', () => {
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
