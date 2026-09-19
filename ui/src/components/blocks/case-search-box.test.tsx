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
 * **The fourth decision, that typing reopens a dismissed list, is not asserted
 * anywhere.** `dismissed` is only ever set by the popover reporting itself
 * closed, and an outside press does not do that -- measured in jsdom and again
 * in chromium, where the listbox is still in the document after pressing a
 * button beside the field. Escape closes it, and empties the field in the same
 * stroke, so the list would have closed for the empty query alone. Whether
 * `dismissed` is reachable at all is the open question. -> #906
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

describe('the case omnibox', () => {
  it('keeps the list closed for a query that is only spaces', async () => {
    const user = userEvent.setup()
    render(<Controlled initial="" />)

    await user.type(screen.getByRole('searchbox', { name: FIELD }), '   ')

    expect(screen.queryByRole('listbox')).toBeNull()
  })

  /**
   * An outside press closes the list.
   *
   * Both shapes, because React Aria takes them down different paths: a press
   * on something focusable leaves a `relatedTarget`, and one on plain chrome
   * leaves none, which is the case its blur handler returns early on. -> #908
   */
  it.each([
    ['a button beside the field', 'button'],
    ['plain chrome with nothing to focus', 'chrome'],
  ])('closes the list on a press outside it: %s', async (_what, kind) => {
    const user = userEvent.setup()
    render(
      <>
        <Controlled initial="" />
        {kind === 'button' ? (
          <button type="button">elsewhere</button>
        ) : (
          <div data-testid="elsewhere">elsewhere</div>
        )}
      </>,
    )
    await user.type(screen.getByRole('searchbox', { name: FIELD }), 'a')
    expect(await screen.findByRole('listbox')).toBeInTheDocument()

    await user.click(
      kind === 'button'
        ? screen.getByRole('button', { name: 'elsewhere' })
        : screen.getByTestId('elsewhere'),
    )

    // `waitFor`, because the surface animates out: it is still in the document
    // for the frame after the press, and asserting synchronously reads that
    // frame rather than the outcome.
    await waitFor(() => {
      expect(
        screen.queryByRole('listbox'),
        'the list stays open over the case after the analyst pressed away from it',
      ).toBeNull()
    })
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
