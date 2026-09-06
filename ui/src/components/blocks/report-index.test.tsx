import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/api/client'
import { DEMO_BLOCKS, DEMO_REPORTS } from '@/components/blocks/report-shape'

import { ReportIndexPane } from './report-index'

/**
 * The report list's own control, against the target floor the rest of the row
 * is built to.
 *
 * **jsdom gives every element a zero box**, so what is asserted is the height
 * class rather than the rendered height. The number itself is measured by the
 * Storybook probe, which is what reported this: `small-target: target is
 * 151x21px` on eight `Blocks/Report/*` stories, one per report in the table.
 */
describe('the control that opens a report', () => {
  const draw = () =>
    render(
      <ReportIndexPane
        reports={DEMO_REPORTS}
        blocks={DEMO_BLOCKS}
        onOpen={() => undefined}
        onNew={() => undefined}
      />,
    )

  /**
   * **A row's controls sit on a 24px floor**, set by the control the row's
   * actions use and the reason the table row is what it is rather than less.
   * The title is the row's primary door, and `h-auto` on it drops the kit's
   * `h-6` and leaves the button the height of one line of `text-sm`. It is not
   * the WCAG 2.5.8 in-sentence exception either: a table cell is not a run of
   * prose, and the `owing` line above the table is the place that exception is
   * actually claimed.
   */
  it('keeps the 24px floor rather than collapsing to its line box', () => {
    draw()
    // Exact, not a pattern: the `owing` line above the table draws a second
    // control on the same report, named `Open Customer RCA` apart from this
    // one - and that one is in a run of prose, where the floor does not apply.
    const door = screen.getByRole('button', { name: 'Customer RCA' })

    expect(door.className).toMatch(/\bh-6\b/)
    expect(door.className).not.toMatch(/\bh-auto\b/)
  })
})

/**
 * Deleting a report: the bin only exists where a caller can act on it, and
 * confirming names the row that was pressed rather than whichever the caller
 * last saw.
 */
describe('deleting a report', () => {
  it('draws no actions column at all with no onDelete - not the bin, not the chevron, not the overflow', () => {
    render(<ReportIndexPane reports={DEMO_REPORTS} blocks={DEMO_BLOCKS} onOpen={() => undefined} />)
    expect(screen.queryByRole('button', { name: /^Delete /i })).not.toBeInTheDocument()
    // The whole column, not only the bin: an unwired table gains no chevron
    // and no overflow menu either - a header naming a column that draws
    // nothing on every row is the cheaper thing to get wrong.
    expect(screen.queryByRole('columnheader', { name: 'Row actions' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Show detail$/ })).not.toBeInTheDocument()
    // Not the table's own generic pointer target (`More for Reports`, always
    // present for right-click) - a per-row one, named for a report.
    for (const report of DEMO_REPORTS) {
      const label = report.label || 'Untitled report'
      expect(screen.queryByRole('button', { name: `More for ${label}` })).not.toBeInTheDocument()
    }
  })

  it('confirming asks for the row that was pressed, not the first row in the list', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn()
    // Attack: press delete on the *second* report and confirm the id that
    // reaches `onDelete` is that report's, not the first row's - the bug a
    // stale closure or an index-based handler would produce silently.
    const second = DEMO_REPORTS[1]
    if (!second) throw new Error('fixture needs at least two reports')

    render(
      <ReportIndexPane
        reports={DEMO_REPORTS}
        blocks={DEMO_BLOCKS}
        onOpen={() => undefined}
        onDelete={onDelete}
      />,
    )

    const label = second.label || 'Untitled report'
    await user.click(screen.getByRole('button', { name: `Delete ${label}` }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: /delete/i }))

    expect(onDelete).toHaveBeenCalledExactlyOnceWith(second.id)
  })

  it('cancelling the confirmation calls onDelete for nothing', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn()
    const first = DEMO_REPORTS[0]
    if (!first) throw new Error('fixture needs at least one report')

    render(
      <ReportIndexPane
        reports={DEMO_REPORTS}
        blocks={DEMO_BLOCKS}
        onOpen={() => undefined}
        onDelete={onDelete}
      />,
    )

    const label = first.label || 'Untitled report'
    await user.click(screen.getByRole('button', { name: `Delete ${label}` }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: /cancel/i }))

    expect(onDelete).not.toHaveBeenCalled()
  })

  it('deletes the right row from the overflow menu too, not only the bin', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn()
    const second = DEMO_REPORTS[1]
    if (!second) throw new Error('fixture needs at least two reports')

    render(
      <ReportIndexPane
        reports={DEMO_REPORTS}
        blocks={DEMO_BLOCKS}
        onOpen={() => undefined}
        onDelete={onDelete}
      />,
    )

    const label = second.label || 'Untitled report'
    await user.click(screen.getByRole('button', { name: `More for ${label}` }))
    await user.click(await screen.findByRole('menuitem', { name: /delete/i }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: /delete/i }))

    expect(onDelete).toHaveBeenCalledExactlyOnceWith(second.id)
  })

  /**
   * **A dialog with nowhere to send its answer must not reopen for one.**
   * `deleting` surviving a repaint that no longer supports it -- the row gone,
   * or `onDelete` withdrawn -- lets the next repaint that restores either
   * condition reopen the confirmation on a stale id, with no button having been
   * pressed.
   */
  it('does not reopen itself once the row it was asking about is gone', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn()
    const first = DEMO_REPORTS[0]
    if (!first) throw new Error('fixture needs at least one report')

    const { rerender } = render(
      <ReportIndexPane
        reports={DEMO_REPORTS}
        blocks={DEMO_BLOCKS}
        onOpen={() => undefined}
        onDelete={onDelete}
      />,
    )

    const label = first.label || 'Untitled report'
    await user.click(screen.getByRole('button', { name: `Delete ${label}` }))
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()

    // The pressed row leaves - another analyst deleted it first - and the
    // rest of the list stays, so this is not merely "the list went empty":
    // a guard that only resets on `reports.length === 0` would leave this
    // dialog open, asking about a row that has gone.
    rerender(
      <ReportIndexPane
        reports={DEMO_REPORTS.slice(1)}
        blocks={DEMO_BLOCKS}
        onOpen={() => undefined}
        onDelete={onDelete}
      />,
    )
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()

    rerender(
      <ReportIndexPane
        reports={DEMO_REPORTS}
        blocks={DEMO_BLOCKS}
        onOpen={() => undefined}
        onDelete={onDelete}
      />,
    )
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('keeps the confirmation open across a repaint that still holds the pressed row', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn()
    const first = DEMO_REPORTS[0]
    if (!first) throw new Error('fixture needs at least one report')

    const { rerender } = render(
      <ReportIndexPane
        reports={DEMO_REPORTS}
        blocks={DEMO_BLOCKS}
        onOpen={() => undefined}
        onDelete={onDelete}
      />,
    )

    const label = first.label || 'Untitled report'
    await user.click(screen.getByRole('button', { name: `Delete ${label}` }))
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()

    // A repaint that still contains the pressed row - a stage filter, an
    // unrelated field changing elsewhere - must not drop the question the
    // analyst is mid-way through answering.
    rerender(
      <ReportIndexPane
        reports={DEMO_REPORTS}
        blocks={DEMO_BLOCKS}
        onOpen={() => undefined}
        onDelete={onDelete}
      />,
    )
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: /delete/i }))
    expect(onDelete).toHaveBeenCalledExactlyOnceWith(first.id)
  })

  it('does not reopen itself once the caller withdraws onDelete', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn()
    const first = DEMO_REPORTS[0]
    if (!first) throw new Error('fixture needs at least one report')

    const { rerender } = render(
      <ReportIndexPane
        reports={DEMO_REPORTS}
        blocks={DEMO_BLOCKS}
        onOpen={() => undefined}
        onDelete={onDelete}
      />,
    )

    const label = first.label || 'Untitled report'
    await user.click(screen.getByRole('button', { name: `Delete ${label}` }))
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()

    rerender(<ReportIndexPane reports={DEMO_REPORTS} blocks={DEMO_BLOCKS} onOpen={() => undefined} />)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()

    rerender(
      <ReportIndexPane
        reports={DEMO_REPORTS}
        blocks={DEMO_BLOCKS}
        onOpen={() => undefined}
        onDelete={onDelete}
      />,
    )
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(onDelete).not.toHaveBeenCalled()
  })

  /**
   * **Attack: a rejected `onDelete` must not read as a successful delete.**
   * The dialog only shows the server's refusal if the block threads its
   * return value through to `ConfirmDeleteDialog`'s own `onConfirm` - a loop
   * that calls `onDelete` and discards what it returns would close the
   * dialog on a delete that never happened.
   */
  it('keeps the dialog open and shows the reason when onDelete is refused', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn(() =>
      Promise.reject(new ApiError(409, 'This report is referenced elsewhere.', {})),
    )
    const first = DEMO_REPORTS[0]
    if (!first) throw new Error('fixture needs at least one report')

    render(
      <ReportIndexPane
        reports={DEMO_REPORTS}
        blocks={DEMO_BLOCKS}
        onOpen={() => undefined}
        onDelete={onDelete}
      />,
    )

    const label = first.label || 'Untitled report'
    await user.click(screen.getByRole('button', { name: `Delete ${label}` }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: /delete/i }))

    expect(await within(dialog).findByText('This report is referenced elsewhere.')).toBeInTheDocument()
    expect(dialog).toBeInTheDocument()
    expect(onDelete).toHaveBeenCalledExactlyOnceWith(first.id)
  })
})

/**
 * Copying a report: the door only exists where a caller can act on it, and
 * pressing it names the row that was pressed rather than whichever row the
 * caller last saw.
 */
describe('duplicating a report', () => {
  it('draws no Duplicate row with no onDuplicate', async () => {
    const user = userEvent.setup()
    const first = DEMO_REPORTS[0]
    if (!first) throw new Error('fixture needs at least one report')
    render(
      <ReportIndexPane
        reports={DEMO_REPORTS}
        blocks={DEMO_BLOCKS}
        onOpen={() => undefined}
        onDelete={() => undefined}
      />,
    )
    const label = first.label || 'Untitled report'
    await user.click(screen.getByRole('button', { name: `More for ${label}` }))
    expect(screen.queryByRole('menuitem', { name: /duplicate/i })).not.toBeInTheDocument()
  })

  it('duplicates the row that was pressed, not the first row in the list', async () => {
    const user = userEvent.setup()
    const onDuplicate = vi.fn()
    const second = DEMO_REPORTS[1]
    if (!second) throw new Error('fixture needs at least two reports')

    render(
      <ReportIndexPane
        reports={DEMO_REPORTS}
        blocks={DEMO_BLOCKS}
        onOpen={() => undefined}
        onDuplicate={onDuplicate}
      />,
    )

    const label = second.label || 'Untitled report'
    await user.click(screen.getByRole('button', { name: `More for ${label}` }))
    await user.click(await screen.findByRole('menuitem', { name: /duplicate/i }))

    expect(onDuplicate).toHaveBeenCalledExactlyOnceWith(second.id)
  })

  /**
   * **Attack: a copy in flight must mark its own row and not every row.** The
   * busy set is table-wide state; a handler that put every row's id in it
   * instead of only the one pressed would pass a shallower assertion that
   * just checked *a* title went dim.
   */
  it('dims only the row being copied, and offers no second press until it settles', async () => {
    const user = userEvent.setup()
    let release: () => void = () => undefined
    const onDuplicate = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    const first = DEMO_REPORTS[0]
    const second = DEMO_REPORTS[1]
    if (!first || !second) throw new Error('fixture needs at least two reports')

    render(
      <ReportIndexPane
        reports={DEMO_REPORTS}
        blocks={DEMO_BLOCKS}
        onOpen={() => undefined}
        onDuplicate={onDuplicate}
      />,
    )

    const pressedLabel = first.label || 'Untitled report'
    const otherLabel = second.label || 'Untitled report'
    await user.click(screen.getByRole('button', { name: `More for ${pressedLabel}` }))
    await user.click(await screen.findByRole('menuitem', { name: /duplicate/i }))

    // The pressed row's own title dims - the only signal drawn,
    // since duplicating has no dialog of its own.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: pressedLabel }).className).toMatch(/opacity-60/)
    })
    expect(screen.getByRole('button', { name: otherLabel }).className).not.toMatch(/opacity-60/)

    // The overflow, reopened on a busy row, offers a disabled item rather
    // than a second `Duplicate` that would fire onDuplicate again.
    await user.click(screen.getByRole('button', { name: `More for ${pressedLabel}` }))
    expect(await screen.findByRole('menuitem', { name: 'Duplicating\u2026' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(screen.queryByRole('menuitem', { name: 'Duplicate' })).not.toBeInTheDocument()
    // Closes the overflow, which is what unhides the rest of the table for
    // the query below - React Aria marks it `aria-hidden` while open.
    await user.keyboard('{Escape}')

    release()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: pressedLabel }).className).not.toMatch(/opacity-60/)
    })
  })
})
