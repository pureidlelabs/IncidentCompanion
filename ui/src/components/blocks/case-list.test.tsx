import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/api/client'

import type { CaseSummary } from '@/api/case'

import { CaseList } from './case-list'
import { PICKER_CASES } from './picker-rows'

/**
 * **Written to make the case list show the wrong cases, or open the wrong
 * one.**
 *
 * Those are the two failures that matter on this block and neither is loud:
 * a narrowing that reads a word instead of a field draws a plausible table,
 * and a door built from the roster's first row rather than from the row it
 * sits in opens a case the analyst did not press. Both render perfectly.
 *
 * ## What this tier cannot see
 *
 * jsdom gives every element a zero box, so nothing here judges the table's
 * geometry, the truncation, or whether the row's controls clear the 24px
 * target floor. That is the story tier and `visual-check`.
 */

/** One case, spelled so a test can put the value it is attacking in one field. */
function one(over: Partial<CaseSummary> & { id: string }): CaseSummary {
  return {
    title: 'A case',
    customer: 'A customer',
    reference: null,
    summary: null,
    status: 'open',
    openedAt: '2026-08-01T00:00:00.000Z',
    closedAt: null,
    isDemo: false,
    version: 1,
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...over,
  }
}

/**
 * Turn one filter chip on, and shut the popover behind it.
 *
 * The chips live in a React Aria popover, which marks the rest of the page
 * `aria-hidden` while it is open -- so a role query for a table row finds
 * nothing until it is dismissed, and the failure reads as an unfiltered table.
 */
async function pickFilter(
  user: ReturnType<typeof userEvent.setup>,
  chip: RegExp,
): Promise<void> {
  await user.click(screen.getByRole('button', { name: 'Filters' }))
  await user.click(await screen.findByRole('button', { name: chip }))
  await user.keyboard('{Escape}')
}

/** The demo the default roster carries, which is what most of these push on. */
const DEMO = PICKER_CASES.find((row) => row.isDemo)
if (!DEMO) throw new Error('the roster must carry a demo case for these tests to attack')

describe('which cases the list shows', () => {
  it('keeps the demo case out until it is asked for', () => {
    render(<CaseList cases={PICKER_CASES} />)

    expect(screen.queryByText(DEMO.title)).toBeNull()
    expect(screen.getByText('6 cases')).toBeTruthy()
  })

  it('draws the demo case once the demo filter is on', async () => {
    const user = userEvent.setup()
    render(<CaseList cases={PICKER_CASES} />)

    await pickFilter(user, /Include demo cases/)

    expect(screen.getByRole('link', { name: DEMO.title })).toBeTruthy()
  })

  /**
   * The attack: a case whose *title* carries the other state's word.
   *
   * A filter reading the row's text rather than `status` keeps this row under
   * `open` and drops the plain one, which is a table that looks filtered and
   * is not.
   */
  it('narrows on the case state, not on a word in its title', async () => {
    const user = userEvent.setup()
    render(
      <CaseList
        cases={[
          one({ id: 'a', title: 'Mailbox compromise, now closed', status: 'open' }),
          one({ id: 'b', title: 'Stolen laptop', status: 'closed' }),
        ]}
      />,
    )

    await pickFilter(user, /^closed/)

    expect(screen.getByRole('link', { name: 'Stolen laptop' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Mailbox compromise, now closed' })).toBeNull()
  })

  /**
   * The search box names the column it reads -- `Case` -- so a customer's name
   * matching must not fill the table with that customer's cases. A search
   * widened to every column would pass a test written from the intention.
   */
  it('searches the case title and not the customer beside it', () => {
    render(<CaseList cases={PICKER_CASES} search="Kestrel Health" />)

    expect(screen.queryByText('Payroll credential stuffing')).toBeNull()
    expect(screen.getByText('0 of 6 cases')).toBeTruthy()
  })

  /**
   * A hidden demo counted in the total is the count reading a different set
   * from the table: six cases before the search, seven after it.
   */
  it('counts against the set the filters draw from, so a search cannot raise the total', async () => {
    const user = userEvent.setup()
    render(<CaseList cases={PICKER_CASES} />)

    await user.type(screen.getByRole('textbox', { name: 'Case contains' }), 'ransomware')

    expect(await screen.findByText('1 of 6 cases')).toBeTruthy()
  })
})

describe('where a row leads', () => {
  /**
   * Row by row rather than on one row: a door built from the roster's head,
   * from the table's first row, or from the previous row's id all open a real
   * case and are invisible against a single assertion.
   */
  it('sends every row to its own case', () => {
    render(<CaseList cases={PICKER_CASES} />)

    for (const row of PICKER_CASES.filter((entry) => !entry.isDemo)) {
      const link = screen.getByRole('link', { name: row.title })
      expect(link.getAttribute('href')).toBe(`/cases/${row.id}/overview`)
    }
  })

  /** A case id is a server value; one carrying a slash re-spells the route. */
  it('encodes an id that would otherwise change the path', () => {
    render(<CaseList cases={[one({ id: 'a/b#c', title: 'Odd id' })]} />)

    expect(screen.getByRole('link', { name: 'Odd id' }).getAttribute('href')).toBe(
      '/cases/a%2Fb%23c/overview',
    )
  })

  it('takes the caller\u2019s own path when one is given', () => {
    render(
      <CaseList
        cases={[one({ id: 'z9', title: 'Only case' })]}
        caseHref={(kase) => `/elsewhere/${kase.id}`}
      />,
    )

    expect(screen.getByRole('link', { name: 'Only case' }).getAttribute('href')).toBe(
      '/elsewhere/z9',
    )
  })
})

describe('what the row can be asked to do', () => {
  it('deletes the case whose bin was pressed, not the first one', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn()
    const rows = [
      one({ id: 'first', title: 'First case' }),
      one({ id: 'second', title: 'Second case' }),
      one({ id: 'third', title: 'Third case' }),
    ]
    render(<CaseList cases={rows} onDelete={onDelete} />)

    await user.click(screen.getByRole('button', { name: 'Delete Third case' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

    expect(onDelete.mock.calls).toEqual([['third']])
  })

  /** Nothing is written before the analyst confirms. */
  it('deletes nothing while the confirmation is open', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn()
    render(<CaseList cases={[one({ id: 'x', title: 'A case' })]} onDelete={onDelete} />)

    await user.click(screen.getByRole('button', { name: 'Delete A case' }))
    await screen.findByRole('alertdialog')

    expect(onDelete).not.toHaveBeenCalled()
  })

  it('offers no bin when the caller cannot delete', () => {
    render(<CaseList cases={[one({ id: 'x', title: 'A case' })]} />)

    expect(screen.queryByRole('button', { name: 'Delete A case' })).toBeNull()
  })

  /**
   * The direction is the row's, not the block's: a toggle that always asks
   * for `true` leaves a pinned case pinned and reads as a dead control.
   */
  it('pins in the direction the row is drawn', async () => {
    const user = userEvent.setup()
    const onTogglePin = vi.fn()
    render(
      <CaseList
        cases={[one({ id: 'held', title: 'Pinned case' }), one({ id: 'free', title: 'Loose case' })]}
        pinnedIds={['held']}
        onTogglePin={onTogglePin}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Unpin Pinned case' }))
    await user.click(screen.getByRole('button', { name: 'Pin Loose case' }))

    expect(onTogglePin.mock.calls).toEqual([
      ['held', false],
      ['free', true],
    ])
  })

  it('offers no pin when the caller cannot pin', () => {
    render(<CaseList cases={[one({ id: 'x', title: 'A case' })]} pinnedIds={['x']} />)

    expect(screen.queryByRole('button', { name: /^Unpin/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Pin/ })).toBeNull()
  })
})

describe('the states the block owes', () => {
  it('draws no table while the read is in flight', () => {
    render(<CaseList cases={PICKER_CASES} isPending />)

    expect(screen.queryByRole('grid')).toBeNull()
    expect(screen.getByRole('status')).toBeTruthy()
  })

  it('draws the failure in the body and offers the retry it was given', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    render(<CaseList cases={PICKER_CASES} problem="The case list could not be read." onRetry={onRetry} />)

    expect(screen.queryByRole('grid')).toBeNull()
    await user.click(screen.getByRole('button', { name: /Try again/i }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  /**
   * A fresh install: the ways in take the pane, and the toolbar goes with the
   * table -- there is nothing to narrow, so a search box over no rows is a
   * control that cannot work.
   */
  it('draws the ways in and no toolbar on an install with no cases', async () => {
    const user = userEvent.setup()
    const onNewCase = vi.fn()
    render(<CaseList cases={[]} onNewCase={onNewCase} />)

    expect(screen.queryByRole('textbox', { name: 'Case contains' })).toBeNull()
    await user.click(screen.getByRole('button', { name: /New case/ }))
    expect(onNewCase).toHaveBeenCalledTimes(1)
  })

  /**
   * A roster holding only the demo is not an empty install: the ways in would
   * hide a row the analyst can reach by dropping one filter, which the
   * table's own empty offers.
   */
  it('keeps the table on a roster that is only demos', () => {
    render(<CaseList cases={PICKER_CASES.filter((row) => row.isDemo)} />)

    expect(screen.getByRole('textbox', { name: 'Case contains' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Show every case' })).toBeTruthy()
  })

  /**
   * **Each way in reaches its own door.** Pressing one offer and asserting one
   * spy leaves the other three free to be wired to the same handler, which is
   * a fresh install where three of four controls go to the wrong place --
   * measured green against every other test on this block.
   */
  it('gives each way in its own door', async () => {
    const user = userEvent.setup()
    const doors = {
      onNewCase: vi.fn(),
      onImportIncidents: vi.fn(),
      onImportArchive: vi.fn(),
      onDemoCases: vi.fn(),
    }
    render(<CaseList cases={[]} {...doors} />)

    for (const label of ['New case', 'Import incidents', 'Import archive', 'Demo cases']) {
      await user.click(screen.getByRole('button', { name: new RegExp(label) }))
    }

    expect(Object.values(doors).map((spy) => spy.mock.calls.length)).toEqual([1, 1, 1, 1])
  })

  /** An install that can do none of it draws four offers and refuses each. */
  it('refuses every way in that was given no door', () => {
    render(<CaseList cases={[]} />)

    for (const label of ['New case', 'Import incidents', 'Import archive', 'Demo cases']) {
      const offer = screen.getByRole('button', { name: new RegExp(label) })
      expect(offer.hasAttribute('disabled') || offer.getAttribute('aria-disabled') === 'true').toBe(
        true,
      )
    }
  })

  it('offers no retry on a failure it was given no retry for', () => {
    render(<CaseList cases={PICKER_CASES} problem="The case list could not be read." />)

    expect(screen.queryByRole('button', { name: /Try again/i })).toBeNull()
  })

  /**
   * The chip's count is what tells the analyst whether pressing it is worth
   * anything, and nothing else on the block draws it.
   */
  it('counts the rows behind each filter chip', async () => {
    const user = userEvent.setup()
    render(<CaseList cases={PICKER_CASES} />)

    await user.click(screen.getByRole('button', { name: 'Filters' }))

    expect(await screen.findByRole('button', { name: 'open 3' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'closed 3' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Include demo cases 1' })).toBeTruthy()
  })
})

/**
 * The row's menu, which is the second surface every verb appears on.
 *
 * `data-table` builds the `...` and the right click from one declaration,
 * so they cannot drift -- but that gate lives in a block this one does not
 * own, and a change there would take the withheld Delete with it silently.
 */
describe('the row menu carries the same verbs as the row', () => {
  const openMenu = (title: string) => {
    const cell = screen.getByRole('link', { name: title })
    const row = cell.closest('[data-row-id]')
    if (row === null) throw new Error('the link is not inside a table row')
    fireEvent.contextMenu(row)
  }

  it('offers Delete in the menu when the caller can delete', async () => {
    const onDelete = vi.fn()
    render(<CaseList cases={[one({ id: 'x', title: 'A case' })]} onDelete={onDelete} />)

    openMenu('A case')
    const items = await screen.findAllByRole('menuitem')

    expect(items.map((item) => item.textContent)).toContain('Delete')
  })

  it('offers no Delete in the menu when the caller cannot', async () => {
    render(<CaseList cases={[one({ id: 'x', title: 'A case' })]} />)

    openMenu('A case')
    const items = await screen.findAllByRole('menuitem')

    expect(items.map((item) => item.textContent)).not.toContain('Delete')
  })

  /** The title is a link, so pressing it must not also open the row's menu. */
  it('opens no menu when the case link is pressed', async () => {
    const user = userEvent.setup()
    render(<CaseList cases={[one({ id: 'x', title: 'A case' })]} onDelete={vi.fn()} />)

    await user.click(screen.getByRole('link', { name: 'A case' }))

    expect(screen.queryAllByRole('menuitem')).toEqual([])
  })
})

/**
 * The confirmation's whole lifecycle, because a delete is the one thing on
 * this block that cannot be taken back.
 *
 * `ConfirmDeleteDialog` is a block, so these hold the seam rather than the
 * block: what `onDelete` returns has to reach the analyst.
 */
describe('what a refused delete does', () => {
  const openAndConfirm = async (user: ReturnType<typeof userEvent.setup>, title: string) => {
    await user.click(screen.getByRole('button', { name: `Delete ${title}` }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    return dialog
  }

  it('closes on a delete that went through', async () => {
    const user = userEvent.setup()
    render(
      <CaseList cases={[one({ id: 'x', title: 'A case' })]} onDelete={() => Promise.resolve()} />,
    )

    await openAndConfirm(user, 'A case')

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).toBeNull()
    })
  })

  /**
   * A case another analyst holds answers 409, and the dialog has to say so
   * rather than closing on a delete that did not happen.
   */
  it('keeps the dialog open and says why when the server refuses', async () => {
    const user = userEvent.setup()
    render(
      <CaseList
        cases={[one({ id: 'x', title: 'A case' })]}
        onDelete={() => Promise.reject(new ApiError(409, 'Another analyst holds this case.', null))}
      />,
    )

    const dialog = await openAndConfirm(user, 'A case')

    expect(await within(dialog).findByText('Another analyst holds this case.')).toBeTruthy()
    expect(screen.getByRole('alertdialog')).toBeTruthy()
  })

  it('says something even when the failure is not the server\u2019s words', async () => {
    const user = userEvent.setup()
    render(
      <CaseList
        cases={[one({ id: 'x', title: 'A case' })]}
        onDelete={() => Promise.reject(new Error('socket closed'))}
      />,
    )

    const dialog = await openAndConfirm(user, 'A case')

    expect(await within(dialog).findByText('Could not delete.')).toBeTruthy()
  })

  /**
   * The attack: the second confirmation carries the first row's id, or the
   * first attempt's refusal text.
   */
  it('deletes the second case on its own terms after cancelling the first', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn()
    render(
      <CaseList
        cases={[one({ id: 'a', title: 'First case' }), one({ id: 'b', title: 'Second case' })]}
        onDelete={onDelete}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Delete First case' }))
    const first = await screen.findByRole('alertdialog')
    await user.click(within(first).getByRole('button', { name: /Cancel/i }))

    await openAndConfirm(user, 'Second case')

    expect(onDelete.mock.calls).toEqual([['b']])
  })
})

/**
 * The pin, driven by a parent that really holds the list.
 *
 * The columns are memoised on purpose -- rebuilding them when the pin list
 * arrives replaces the row's button between pointerdown and click and
 * swallows the press -- so the direction has to survive the state changing
 * underneath it, which a `vi.fn()` and a fixed prop cannot show.
 */
describe('pinning against a parent that holds the list', () => {
  function Holder({ onToggle }: { onToggle: (id: string, pinned: boolean) => void }) {
    const [pinned, setPinned] = useState<readonly string[]>([])
    return (
      <CaseList
        cases={[one({ id: 'x', title: 'A case' })]}
        pinnedIds={pinned}
        onTogglePin={(id, next) => {
          onToggle(id, next)
          setPinned(next ? [id] : [])
        }}
      />
    )
  }

  it('flips the row\u2019s pin and asks for the other direction next', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    render(<Holder onToggle={onToggle} />)

    await user.click(screen.getByRole('button', { name: 'Pin A case' }))
    await user.click(await screen.findByRole('button', { name: 'Unpin A case' }))

    expect(onToggle.mock.calls).toEqual([
      ['x', true],
      ['x', false],
    ])
  })
})
