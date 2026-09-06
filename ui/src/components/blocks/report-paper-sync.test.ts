import { describe, expect, it } from 'vitest'

import { bandsOf, paperScrollTop, scrollerOf, type Band } from './report-paper-sync'

/**
 * Keeping the page level with the section being written, attacked.
 *
 * The claim worth defeating is that this is **anchored on the section rather
 * than on a ratio of the whole**. A proportional sync agrees with a
 * section-anchored one on a document whose two columns run at the same rate,
 * so every fixture here makes them disagree - which is what a real report does,
 * a written body running long in the editor and short on the page.
 */

/** Editor bands: a long written section, then two short generated rows. */
const EDITOR: readonly Band[] = [
  { id: 'a', top: 0, height: 400 },
  { id: 'b', top: 400, height: 100 },
  { id: 'c', top: 500, height: 800 },
]

/** The same three on the page, at print size and in the other proportion. */
const PAPER: readonly Band[] = [
  { id: 'a', top: 0, height: 120 },
  { id: 'b', top: 120, height: 300 },
  { id: 'c', top: 420, height: 200 },
]

const pane = (scrollTop: number) => ({ scrollTop, scrollHeight: 1300, clientHeight: 400 })

/** What a ratio of the whole would answer, for the comparisons below. */
function proportional(scrollTop: number): number {
  return (scrollTop / 1300) * 620
}

describe('where the page sits', () => {
  /**
   * The section is the anchor. At the top of the third section the page shows
   * the top of its third section - a proportional sync puts it 190px away, and
   * the drift is worst at the bottom, which is where the analyst is finishing.
   */
  it('lands on the section rather than on a fraction of the document', () => {
    expect(paperScrollTop(pane(500), EDITOR, PAPER)).toBe(420)
    expect(paperScrollTop(pane(500), EDITOR, PAPER)).not.toBe(proportional(500))
  })

  /**
   * The last section that has *started*, not the first that is visible. Three
   * are on screen at 900px and only one holds the caret.
   */
  it('takes the last section that has started', () => {
    // Half way down the third: 420 + 0.5 * 200.
    expect(paperScrollTop(pane(900), EDITOR, PAPER)).toBe(520)
  })

  /**
   * At rest the first section's top is exactly the scroll position, and a
   * strict comparison picks nothing there - which reads as the page refusing
   * to move until you have scrolled past the first heading.
   */
  it('answers at rest, where the top and the scroll are the same number', () => {
    expect(paperScrollTop(pane(0), EDITOR, PAPER)).toBe(0)
  })

  /**
   * The same comparison one section down, where it is actually observable.
   *
   * **`<=` against `<` is invisible on a page whose sections abut**: the
   * section ending at the scroll position and the section starting there
   * resolve to the same pixel, so the strict form passed every case above.
   * Found by mutation. Here the page has a gap between the two, which is what a
   * page break is.
   */
  it('prefers the section that starts at the scroll position', () => {
    const paged: readonly Band[] = [
      { id: 'a', top: 0, height: 120 },
      { id: 'b', top: 200, height: 300 },
      { id: 'c', top: 900, height: 200 },
    ]
    expect(paperScrollTop(pane(500), EDITOR, paged)).toBe(900)
  })

  it('holds the first section for a scroll above it', () => {
    expect(paperScrollTop(pane(-40), EDITOR, PAPER)).toBe(0)
  })

  /**
   * The fraction is clamped. A section whose editor height is shorter than the
   * distance scrolled past it otherwise pushes the page beyond the next
   * section, which reads as a jump rather than as a sync.
   */
  it('never carries the page past the section it is on', () => {
    const short: readonly Band[] = [
      { id: 'a', top: 0, height: 10 },
      { id: 'b', top: 900, height: 100 },
    ]
    expect(paperScrollTop(pane(800), short, PAPER)).toBe(120)
  })

  /** A section of no height is at its own top, not at NaN. */
  it('reads a section of no height as its own top', () => {
    const flat: readonly Band[] = [{ id: 'b', top: 0, height: 0 }]
    expect(paperScrollTop(pane(50), flat, PAPER)).toBe(120)
  })
})

describe('when there is nothing to do', () => {
  /**
   * `null` rather than `0`: a caller writing `scrollTop = 0` on these would
   * yank the page to the top every time a short report was scrolled.
   */
  it('answers nothing for a page with no sections', () => {
    expect(paperScrollTop(pane(100), EDITOR, [])).toBeNull()
  })

  it('answers nothing for an editor with no sections', () => {
    expect(paperScrollTop(pane(100), [], PAPER)).toBeNull()
  })

  /** The two lists can disagree: the page draws a section the editor has not. */
  it('answers nothing when the section is not on the page', () => {
    expect(paperScrollTop(pane(0), [{ id: 'z', top: 0, height: 10 }], PAPER)).toBeNull()
  })
})

describe('reading a column out of the DOM', () => {
  function column(ids: readonly string[]): HTMLElement {
    const box = document.createElement('div')
    for (const id of ids) {
      const child = document.createElement('div')
      child.id = `paper-${id}`
      box.append(child)
    }
    return box
  }

  /** Document order is the caller's order, whatever order the DOM is in. */
  it('reads the sections in the order it was asked for', () => {
    const box = column(['c', 'a', 'b'])
    expect(bandsOf(box, ['a', 'b', 'c'], (id) => `paper-${id}`).map((band) => band.id)).toEqual([
      'a',
      'b',
      'c',
    ])
  })

  /** A section that has not rendered is skipped rather than banded at zero. */
  it('skips a section the column has not drawn', () => {
    const box = column(['a'])
    expect(bandsOf(box, ['a', 'b'], (id) => `paper-${id}`).map((band) => band.id)).toEqual(['a'])
  })

  /**
   * An id is not a selector. A block id is a uuid today and a `.` or a `:` in
   * one would be read as a class or a pseudo-class, so the lookup throws
   * rather than missing.
   */
  it('reads an id that would otherwise parse as a selector', () => {
    const box = document.createElement('div')
    const child = document.createElement('div')
    child.id = 'paper-a.b:c'
    box.append(child)
    expect(bandsOf(box, ['a.b:c'], (id) => `paper-${id}`).map((band) => band.id)).toEqual(['a.b:c'])
  })
})

describe('which box actually scrolls', () => {
  function nest(overflows: readonly string[]): HTMLElement {
    let top = document.createElement('div')
    document.body.append(top)
    for (const overflow of overflows) {
      const child = document.createElement('div')
      child.style.overflowY = overflow
      top.append(child)
      top = child
    }
    const leaf = document.createElement('div')
    top.append(leaf)
    return leaf
  }

  /**
   * The pane scrolls, not a box inside it - so the sync has to find the pane
   * rather than assume its own parent is it.
   */
  it('finds the nearest ancestor that scrolls', () => {
    const leaf = nest(['visible', 'auto', 'visible'])
    const found = scrollerOf(leaf)
    expect(found?.style.overflowY).toBe('auto')
  })

  it('takes a box set to scroll as well as one set to auto', () => {
    const leaf = nest(['scroll'])
    expect(scrollerOf(leaf)?.style.overflowY).toBe('scroll')
  })

  /**
   * `null` rather than the body: a screen mounted in a page that scrolls as a
   * whole has no pane, and a sync writing `scrollTop` on the document would
   * move the window instead of the page.
   */
  it('answers nothing where no ancestor scrolls', () => {
    expect(scrollerOf(nest(['visible', 'visible']))).toBeNull()
  })

  it('never answers with the element it was handed', () => {
    const leaf = nest(['auto'])
    leaf.style.overflowY = 'auto'
    expect(scrollerOf(leaf)).not.toBe(leaf)
  })
})
