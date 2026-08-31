import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { ReportBlock } from '@/api/model'
import { campaignCase } from '@/fixtures/campaign'

import { DEMO_BLOCKS, DEMO_PROSE, blocksOf, demoReport, headingOf } from './report-shape'
import { ReportWorkspace } from './report-workspace'

/**
 * Rearranging a report's sections: what leaves the screen, and what the drag
 * nearly took with it.
 *
 * **The gesture is geometry and this tier has none**, so nothing here claims a
 * section moved on screen - jsdom gives every element a zero box and a pointer
 * drag resolves to no target. What is readable is the keyboard route, which
 * React Aria drives from the collection's keys rather than from rectangles,
 * and the id list that leaves. Where a section lands *visually* is the browser
 * tier's question.
 *
 * The attacks are on the payload rather than on the gesture: the route
 * renumbers `position` from the list it is posted, so a scope half named or an
 * order reported stale is a silent renumber of somebody's document, and every
 * one of those still looks like a list of ids.
 */
const FIRST = demoReport(0)
const SECOND = demoReport(1)
const OWN = blocksOf(DEMO_BLOCKS, FIRST.id)

/** A drop target is announced rather than drawn, so it is found by its name. */
const GAPS = /^Insert (before|between|after)/

function draw(props: Partial<Parameters<typeof ReportWorkspace>[0]> = {}) {
  return render(
    <ReportWorkspace
      report={FIRST}
      blocks={DEMO_BLOCKS}
      kase={campaignCase}
      prose={DEMO_PROSE}
      {...props}
    />,
  )
}

/** The grip of the section named, which is what a keyboard drag starts from. */
function gripFor(block: ReportBlock): HTMLElement {
  return screen.getByRole('button', { name: `Drag ${headingOf(block)}` })
}

/**
 * Pick a section up, step past `gaps` drop targets, and drop it.
 *
 * Enter picks up and Enter drops; between them the arrow keys walk the gaps
 * React Aria announces. Nothing here touches a coordinate.
 */
async function dragDown(block: ReportBlock, gaps: number) {
  const user = userEvent.setup()
  gripFor(block).focus()
  await user.keyboard('{Enter}')
  // **Waited for, and without it the drag is a coin toss.** The gaps are
  // registered a turn after the pickup, and an ArrowDown arriving first is
  // swallowed - so the drop lands where the section already was, announces
  // *Drop complete*, and reports nothing. Measured: the same test passed with
  // one extra assertion in front of the arrow key and failed without it.
  await waitFor(() => {
    expect(document.activeElement?.getAttribute('aria-label') ?? '').toMatch(GAPS)
  })
  for (let step = 0; step < gaps; step += 1) await user.keyboard('{ArrowDown}')
  await user.keyboard('{Enter}')
}

describe('the order that leaves the screen', () => {
  /**
   * **The scope is this report's sections, and the whole of them.** The block
   * table holds every report of the case, and the route reads the scope off the
   * ids it is posted: a list spanning two reports is refused outright, and one
   * missing a row of its own scope is refused too. Handing it `blocks` rather
   * than this report's own passes every render assertion and 422s on the wire.
   */
  it('sends every section of this report and no other report of the case', async () => {
    const onReorder = vi.fn()
    draw({ onReorder })

    const moved = OWN[0]
    expect(moved).toBeDefined()
    if (moved === undefined) return
    await dragDown(moved, 1)

    // **Awaited, because the drop settles a turn after the key.** React Aria
    // resolves the dragged items' data before it reports the reorder, so an
    // assertion made straight after Enter reads zero calls - and it passes
    // whenever anything else yields first, which is a flake rather than a
    // failure.
    await waitFor(() => {
      expect(onReorder).toHaveBeenCalledTimes(1)
    })
    const sent = onReorder.mock.calls[0]?.[0] as string[]
    expect([...sent].sort()).toEqual(OWN.map((block) => block.id).sort())
    // The other report's sections are in `blocks` and must not be in the body.
    for (const other of blocksOf(DEMO_BLOCKS, SECOND.id)) {
      expect(sent).not.toContain(other.id)
    }
  })

  /**
   * **The order sent is the order the drop produced.** A seam reporting the
   * moved id, or the order the list had before the drop, renders identically
   * and writes the document back exactly as it was - so the screen shows the
   * move, the refetch undoes it, and nothing anywhere is red.
   */
  it('sends the order the drop produced, not the order before it', async () => {
    const onReorder = vi.fn()
    draw({ onReorder })

    const moved = OWN[0]
    expect(moved).toBeDefined()
    if (moved === undefined) return
    await dragDown(moved, 1)

    const before = OWN.map((block) => block.id)
    const expected = [before[1], before[0], ...before.slice(2)]
    await waitFor(() => {
      expect(onReorder).toHaveBeenCalledWith(expected)
    })
  })

  /**
   * A drop onto the gap the section already occupies, which is how a drag ends
   * whenever somebody thinks better of it. Posting it spends a version check
   * and a change-feed row on an order the case already has.
   */
  it('sends nothing when the section is dropped where it already was', async () => {
    const onReorder = vi.fn()
    draw({ onReorder })

    const moved = OWN[0]
    expect(moved).toBeDefined()
    if (moved === undefined) return
    await dragDown(moved, 0)
    // A negative cannot be awaited into existence, so it is given the same
    // turn the positives need before it is believed.
    await waitFor(() => {
      expect(screen.queryAllByRole('button', { name: /^Insert / })).toHaveLength(0)
    })
    expect(onReorder).not.toHaveBeenCalled()
  })
})

describe('what the column offers to operate', () => {
  /**
   * **A report nobody may edit offers no grip and no drop target.** A control
   * that answers a press with nothing reads worse than an absent one, and a
   * disabled grip on every row leaves a gutter down the column.
   */
  it('offers no grip on a report that has been sent', () => {
    draw({
      report: { ...FIRST, status: 'final', sentAt: '2026-08-19T09:00:00.000Z' },
      onReorder: vi.fn(),
    })
    expect(screen.queryAllByRole('button', { name: /^Drag / })).toHaveLength(0)
  })

  /** A caller that fills no reorder seam gets the document and no grips. */
  it('offers no grip when nothing is listening for a new order', () => {
    draw()
    expect(screen.queryAllByRole('button', { name: /^Drag / })).toHaveLength(0)
    expect(screen.getAllByRole('listitem')).toHaveLength(OWN.length)
  })

  /**
   * **Every section is still one countable row of one named list.** The tier
   * this replaces had to put `role="listitem"` back by hand, because dnd-kit
   * stamped `role="button"` over the `li` and the outline stopped being a list
   * of nine sections. Nothing is stamped here - a `Sortable` row is a grid row
   * by construction - so what this holds is the property rather than the
   * attribute: one row per section of *this* report, under a list that names
   * itself, and the grip is the only button in the row.
   */
  it('keeps every section one row of the named section list', () => {
    draw({ onReorder: vi.fn() })
    const list = screen.getByRole('grid', { name: 'Report sections' })
    expect(screen.getAllByRole('row')).toHaveLength(OWN.length)
    const first = screen.getAllByRole('row')[0]
    expect(first).toBeDefined()
    expect(list.contains(first ?? null)).toBe(true)
  })
})

describe('the keys a section owns', () => {
  /**
   * **ArrowDown in a section's body moves the caret, not the focus.** The
   * column is a grid while the report may be rearranged, and a grid owns the
   * arrow keys - so without stopping them at the field the analyst types a
   * paragraph, presses down for the next line, and lands in the next section.
   *
   * Measured against the kit's `Sortable` before this was written: focus left
   * the textarea on the first press, and the row it arrived at was the one
   * below. jsdom moves no caret, so this reads where the focus is; the caret
   * is the browser tier's.
   */
  it('leaves the caret in the section when an arrow key is pressed in it', async () => {
    const user = userEvent.setup()
    draw({ onReorder: vi.fn() })

    const written = OWN.find((block) => block.kind === 'written')
    expect(written).toBeDefined()
    if (written === undefined) return

    const body = screen.getByRole('textbox', { name: headingOf(written) })
    await user.click(body)
    await user.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(body)
    await user.keyboard('{ArrowUp}')
    expect(document.activeElement).toBe(body)
  })

  /**
   * The converse, so the fix is not "the grid never hears an arrow key": a
   * drag in progress is driven by exactly those keys, and stopping them at the
   * row rather than at the field would leave the grip inert.
   */
  it('still walks the drop targets when the arrow key comes from the grip', async () => {
    const user = userEvent.setup()
    draw({ onReorder: vi.fn() })

    const moved = OWN[0]
    expect(moved).toBeDefined()
    if (moved === undefined) return

    gripFor(moved).focus()
    await user.keyboard('{Enter}')
    // The gaps are registered a turn after the pickup, so the first one is
    // waited for rather than read: an arrow key sent ahead of them is
    // swallowed, and the test then reads a drag that never started.
    let first = ''
    await waitFor(() => {
      first = document.activeElement?.getAttribute('aria-label') ?? ''
      expect(first).toMatch(GAPS)
    })
    await user.keyboard('{ArrowDown}')
    await waitFor(() => {
      expect(document.activeElement?.getAttribute('aria-label') ?? '').not.toBe(first)
    })
    expect(document.activeElement?.getAttribute('aria-label') ?? '').toMatch(GAPS)
  })
})
