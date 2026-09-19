import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { campaignCase } from '@/fixtures/campaign'

import { CaseSearchBox } from './case-search-box'

/**
 * **Written against the four decisions the box carries in comments**, each of
 * which fails silently: a list that opens on a field holding spaces, one that
 * will not reopen after it was dismissed, an Escape that traps the caret in
 * the field, and a list that commits when the caller asked for one that does
 * not.
 *
 * A field that swallows Escape is a keyboard trap, and it reads exactly like
 * a field that does not.
 *
 * **An outside press is the box's own.** React Aria wires none for a
 * non-modal popover, so the dismissal below is hand-rolled, and what these
 * assert is each guard it carries rather than that some listener exists.
 * -> #908
 */
function Controlled({ initial, onAction }: { initial: string; onAction?: (id: string) => void }) {
  const [query, setQuery] = useState(initial)
  return (
    <CaseSearchBox
      kase={campaignCase}
      query={query}
      onQueryChange={setQuery}
      {...(onAction === undefined ? {} : { onAction })}
    />
  )
}

const FIELD = 'Search this case, or run a command'

/**
 * The list is still there once an exit would have finished.
 *
 * The surface animates out, so it is in the document for the frames after a
 * press that dismissed it -- asserting presence straight away passes whether
 * the press was ignored or acted on.
 */
async function staysOpen(why: string) {
  await new Promise((resolve) => setTimeout(resolve, 400))
  expect(screen.queryByRole('listbox'), why).toBeInTheDocument()
}

describe('the case omnibox', () => {
  it('keeps the list closed for a query that is only spaces', async () => {
    const user = userEvent.setup()
    render(<Controlled initial="" />)

    await user.type(screen.getByRole('searchbox', { name: FIELD }), '   ')

    expect(screen.queryByRole('listbox')).toBeNull()
  })

  /**
   * An outside press closes the list, and each guard is asserted apart.
   *
   * The press on plain chrome is the case React Aria's own blur route could
   * never have covered: virtual focus keeps the caret in the field, which is
   * outside the surface, so focus is never within it to leave.
   */
  it('closes the list on a press outside it', async () => {
    const user = userEvent.setup()
    render(
      <>
        <Controlled initial="" />
        <div data-testid="elsewhere">elsewhere</div>
      </>,
    )
    await user.type(screen.getByRole('searchbox', { name: FIELD }), 'a')
    expect(await screen.findByRole('listbox')).toBeInTheDocument()

    await user.click(screen.getByTestId('elsewhere'))

    // `waitFor`, because the surface animates out: it is still in the document
    // for the frame after the press.
    await waitFor(() => {
      expect(
        screen.queryByRole('listbox'),
        'the list stays open over the case after the analyst pressed away from it',
      ).toBeNull()
    })
  })

  it('leaves the list open for a press on the field that opened it', async () => {
    const user = userEvent.setup()
    render(<Controlled initial="" />)
    const field = screen.getByRole('searchbox', { name: FIELD })
    await user.type(field, 'a')
    expect(await screen.findByRole('listbox')).toBeInTheDocument()

    await user.click(field)

    await staysOpen('pressing the field closed the list it opens')
  })

  it('leaves the list open for a press on a row', async () => {
    const user = userEvent.setup()
    render(<Controlled initial="" />)
    await user.type(screen.getByRole('searchbox', { name: FIELD }), 'a')
    const rows = await screen.findAllByRole('option')

    await user.click(rows[0]!)

    // The guard that keeps the surface out of "outside": without it the row
    // is taken away by the same press that is choosing it.
    await staysOpen('a press on a row closed the list under it')
  })

  it('leaves the list open for a press that is not the primary button', async () => {
    const user = userEvent.setup()
    render(
      <>
        <Controlled initial="" />
        <div data-testid="elsewhere">elsewhere</div>
      </>,
    )
    await user.type(screen.getByRole('searchbox', { name: FIELD }), 'a')
    expect(await screen.findByRole('listbox')).toBeInTheDocument()

    // Raw, because `userEvent` sends no click for a secondary press. A menu
    // opening over the case is not the analyst leaving the list.
    screen
      .getByTestId('elsewhere')
      .dispatchEvent(new MouseEvent('click', { bubbles: true, button: 2 }))

    await staysOpen('a right-click anywhere on the page closed the list')
  })

  it('opens the list once the query holds something', async () => {
    const user = userEvent.setup()
    render(<Controlled initial="" />)

    await user.type(screen.getByRole('searchbox', { name: FIELD }), 'a')

    expect(await screen.findByRole('listbox')).toBeInTheDocument()
  })

  it('releases the caret when Escape is pressed on a field already empty', async () => {
    const user = userEvent.setup()
    render(<Controlled initial="" />)
    const field = screen.getByRole('searchbox', { name: FIELD })

    await user.click(field)
    expect(field).toHaveFocus()
    await user.keyboard('{Escape}')

    expect(
      field,
      'Escape on an empty field trapped the caret instead of releasing it',
    ).not.toHaveFocus()
  })

  it('keeps the caret when Escape is pressed on a field with something in it', async () => {
    const user = userEvent.setup()
    render(<Controlled initial="" />)
    const field = screen.getByRole('searchbox', { name: FIELD })

    await user.type(field, 'ransom')
    await user.keyboard('{Escape}')

    expect(field, 'Escape emptied the field and released the caret in one press').toHaveFocus()
  })

  it('draws a list that commits to nothing when no onAction is given', async () => {
    const user = userEvent.setup()
    render(<Controlled initial="" />)

    await user.type(screen.getByRole('searchbox', { name: FIELD }), 'a')
    const rows = await screen.findAllByRole('option')
    await user.click(rows[0]!)

    expect(screen.getByRole('searchbox', { name: FIELD })).toBeInTheDocument()
  })

  it('commits the row that was pressed when onAction is given', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    render(<Controlled initial="" onAction={onAction} />)

    await user.type(screen.getByRole('searchbox', { name: FIELD }), 'a')
    const rows = await screen.findAllByRole('option')
    await user.click(rows[0]!)

    expect(onAction).toHaveBeenCalledOnce()
  })
})
