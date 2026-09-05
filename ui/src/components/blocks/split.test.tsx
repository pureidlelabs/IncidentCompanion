import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Split } from './split'
import { listTrack, resolveTrack, type SplitMeasure } from './split.measures'

/**
 * Which of the two panes draws what, when a detail is open and when none is.
 *
 * The measures and the two scrollers are geometry and belong to the story
 * tier: jsdom gives every element a zero box, so `w-80` and `overflow-y-auto`
 * are both invisible here and a test asserting them would pass over nothing.
 */

const rows = <ul><li>one</li><li>two</li></ul>

describe('the detail pane', () => {
  it('draws the placeholder when nothing is open', () => {
    render(
      <Split list={rows} placeholder={<p>Pick an entry from the list.</p>} />,
    )
    expect(screen.getByText('Pick an entry from the list.')).toBeInTheDocument()
  })

  it('draws the detail when one is open, and not the placeholder', () => {
    render(
      <Split
        list={rows}
        detail={<p>Cobalt Strike beacon check-in to C2</p>}
        placeholder={<p>Pick an entry from the list.</p>}
      />,
    )
    expect(screen.getByText('Cobalt Strike beacon check-in to C2')).toBeInTheDocument()
    expect(screen.queryByText('Pick an entry from the list.')).toBeNull()
  })

  it('keeps the list rows either way', () => {
    const { rerender } = render(<Split list={rows} placeholder={<p>empty</p>} />)
    expect(screen.getByText('one')).toBeInTheDocument()
    rerender(<Split list={rows} detail={<p>open</p>} placeholder={<p>empty</p>} />)
    expect(screen.getByText('one')).toBeInTheDocument()
  })

  it('draws the placeholder for a null detail, not only an absent one', () => {
    render(<Split list={rows} detail={null} placeholder={<p>empty</p>} />)
    expect(screen.getByText('empty')).toBeInTheDocument()
  })
})

/**
 * The heads are grid cells beside the panes, not children of them.
 */
describe('the optional heads and footers', () => {
  it('draws no head row at all when neither head is passed', () => {
    const { container } = render(<Split list={rows} />)
    expect(container.querySelector('[data-slot="split-list-head"]')).toBeNull()
    expect(container.querySelector('[data-slot="split-detail-head"]')).toBeNull()
    // The list pane holds the scroller alone: no footer, and no head either.
    expect(container.querySelector('[data-slot="split-list"]')?.children).toHaveLength(1)
  })

  it('draws the list head in its own cell, and the footer inside the pane', () => {
    const { container } = render(
      <Split list={rows} listHead={<span>search</span>} listFooter={<span>add</span>} />,
    )
    const head = container.querySelector('[data-slot="split-list-head"]')
    expect(head).not.toBeNull()
    expect(head).toHaveTextContent('search')
    // The footer is a third row on the list side only, so it stays in the
    // pane rather than becoming a cell: the detail has nothing to pair it with.
    expect(container.querySelector('[data-slot="split-list"]')?.children).toHaveLength(2)
    expect(container.querySelector('[data-slot="split-list"]')).toHaveTextContent('add')
  })

  it('draws no detail head cell when none is passed', () => {
    const { container } = render(<Split list={rows} detail={<p>open</p>} />)
    expect(container.querySelector('[data-slot="split-detail-head"]')).toBeNull()
  })

  /**
   * One head passed still draws two cells, and that is what keeps the columns
   * paired.
   */
  it('draws both head cells when only one head is passed', () => {
    for (const props of [{ listHead: <span>search</span> }, { detailHead: <span>who</span> }]) {
      const { container } = render(<Split list={rows} {...props} />)
      expect(container.querySelector('[data-slot="split-list-head"]')).not.toBeNull()
      expect(container.querySelector('[data-slot="split-detail-head"]')).not.toBeNull()
    }
  })
})

/**
 * What the list pane is given, and what it therefore leaves the detail.
 */
const MEASURES: SplitMeasure[] = ['narrow', 'default', 'wide']

/** Narrower than this and the index starts giving way. */
const FULL_MEASURE_AT = 800

/**
 * What a note needs to read at all.
 */
const READABLE = 280

describe('the list track', () => {
  it.each(MEASURES)('leaves the detail readable at 480px for %s', (measure) => {
    const index = resolveTrack(listTrack(measure), 480)
    expect(480 - index).toBeGreaterThanOrEqual(READABLE)
  })

  /**
   * `default` is the only measure a screen ships, so it is the one the desktop
   * promise is made about.
   */
  it('is exactly its own measure once the container reaches its cap', () => {
    // The caps, written out rather than read back off the track: a cap
    // compared against itself agrees with any number somebody puts there.
    const caps: Record<SplitMeasure, number> = { narrow: 16 * 16, default: 20 * 16, wide: 24 * 16 }
    for (const measure of MEASURES) {
      for (const width of [FULL_MEASURE_AT, 900, 1024, 1280, 1440, 1920]) {
        const at = resolveTrack(listTrack(measure), width)
        if (width * 0.4 >= caps[measure]) expect(at).toBe(caps[measure])
        else expect(at).toBeLessThan(caps[measure])
      }
    }
    // The one a screen ships, at the width it ships at.
    expect(resolveTrack(listTrack('default'), 1280)).toBe(320)
    expect(resolveTrack(listTrack('default'), FULL_MEASURE_AT)).toBe(320)
  })

  /**
   * Ordering is a claim about the measure, not about every width.
   */
  it('keeps the three measures in the order their names claim', () => {
    for (const width of [320, 480, 640, 800, 1280]) {
      const [narrow, plain, wide] = MEASURES.map((one) => resolveTrack(listTrack(one), width))
      expect(narrow).toBeLessThanOrEqual(plain!)
      expect(plain!).toBeLessThanOrEqual(wide!)
    }
    const [narrow, plain, wide] = MEASURES.map((one) => resolveTrack(listTrack(one), 1280))
    expect(narrow!).toBeLessThan(plain!)
    expect(plain!).toBeLessThan(wide!)
  })

  it('never gives the index the whole container, however narrow', () => {
    for (const measure of MEASURES) {
      for (const width of [240, 300, 360, 420]) {
        expect(resolveTrack(listTrack(measure), width)).toBeLessThan(width)
      }
    }
  })

  /** Both forms, so the fixed branch is not carried untested. */
  it('resolves a fixed track and a clamped one', () => {
    expect(resolveTrack('20rem', 480)).toBe(320)
    expect(resolveTrack('20rem', 4000)).toBe(320)
    expect(resolveTrack('clamp(9rem,40%,20rem)', 480)).toBe(192)
    expect(resolveTrack('clamp(9rem,40%,20rem)', 300)).toBe(144)
    expect(resolveTrack('clamp(9rem,40%,20rem)', 4000)).toBe(320)
  })

  it('refuses a track it has no arithmetic for', () => {
    expect(() => resolveTrack('minmax(0,1fr)', 480)).toThrow(/no arithmetic/)
  })
})
