import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import type { Case, MethodEntry } from '@/api/model'
import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

import { MethodsScreen, type MethodWrites } from './methods'

/**
 * The Methods screen, attacked at the four places its own honesty lives: the
 * stated zero, the half window, the verbatim query, and a write nobody has
 * answered yet.
 */

const draw = (props: Partial<Parameters<typeof MethodsScreen>[0]> = {}) =>
  render(
    <MemoryRouter>
      <MethodsScreen kase={campaignCase} specs={specsFixture} {...props} />
    </MemoryRouter>,
  )

/** The demo with its methods replaced, so a case can be built for one attack. */
const withMethods = (methods: MethodEntry[]): Case => ({ ...campaignCase, methods })

/**
 * The table row a cell's contents sit in.
 */
function rowHolding(node: HTMLElement): HTMLElement {
  const row = node.closest('[role="row"]')
  expect(row, 'the value is not inside a table row').not.toBeNull()
  return row as HTMLElement
}

const one = (over: Partial<MethodEntry> = {}): MethodEntry => ({
  ...campaignCase.methods[0]!,
  ...over,
})

/** A container that never answers, so a write stays in flight forever. */
const NEVER: MethodWrites = {
  save: () => new Promise(() => undefined),
  patch: () => new Promise(() => undefined),
  remove: () => new Promise(() => undefined),
}

describe('what the table says about a count', () => {
  /**
   * The distinction the whole collection turns on.
   */
  it('draws a stated zero as zero and an unstated count as absent', async () => {
    draw({
      kase: withMethods([
        one({ id: 'm-zero', name: 'Nothing came back', rowsReturned: 0 }),
        one({ id: 'm-null', name: 'Nobody counted', rowsReturned: null }),
      ]),
    })

    const zero = rowHolding(await screen.findByText('Nothing came back'))
    expect(within(zero).getByText('0')).toBeInTheDocument()

    const unstated = rowHolding(screen.getByText('Nobody counted'))
    expect(within(unstated).queryByText('0')).toBeNull()
    expect(within(unstated).getAllByText('\u2014').length).toBeGreaterThan(0)
  })
})

describe('what the table says about a window', () => {
  it('draws the stated half and marks the other absent', async () => {
    draw({
      kase: withMethods([
        one({
          id: 'm-half',
          name: 'Half a window',
          windowFrom: '2026-08-13T16:00:00.000Z',
          windowTo: null,
        }),
      ]),
    })

    const row = rowHolding(await screen.findByText('Half a window'))
    expect(within(row).getByText('2026-08-13 16:00 \u2192 \u2014')).toBeInTheDocument()
  })
})

describe('the expanded row', () => {
  /**
   * **A query is the field this collection exists to hold, and it is the one
   * field a stored-facts grid cannot draw.**
   */
  it('keeps the query out of the facts grid and draws its lines', async () => {
    const query = 'SecurityEvent\n| where EventID == 7045\n| summarize by Computer'
    const { container } = draw({
      kase: withMethods([one({ id: 'm-q', name: 'Service creation sweep', query })]),
    })

    await userEvent.click((await screen.findAllByRole('button', { name: /^Show detail$/ }))[0]!)

    // `spaced('query')` is what the facts grid would have labelled it.
    expect(screen.queryByText('query')).toBeNull()

    const blocks = [...container.querySelectorAll('[data-slot="code-block"]')]
    expect(blocks.length).toBeGreaterThan(0)
    const shown = blocks.map((block) => block.textContent)
    // Each line is its own element, so the middle line survives as a line
    // rather than as a run inside a flattened sentence.
    expect(shown.some((text) => text.includes('| where EventID == 7045'))).toBe(true)
  })

  /** Most acts have no transcript, and a block labelled with nothing in it is
   *  a control that says the case is missing something it is not. */
  it('draws no result block for a method that recorded no transcript', async () => {
    const { container } = draw({
      kase: withMethods([
        one({ id: 'm-noex', name: 'Console read', query: '', resultExcerpt: '' }),
      ]),
    })

    await userEvent.click((await screen.findAllByRole('button', { name: /^Show detail$/ }))[0]!)
    expect(container.querySelectorAll('[data-slot="code-block"]')).toHaveLength(0)
  })
})

describe('deleting a method', () => {
  it('asks before anything leaves, and sends only what was confirmed', async () => {
    const remove = vi.fn((_ids: readonly string[]) => Promise.resolve())
    draw({
      kase: withMethods([
        one({ id: 'm-1', name: 'Sweep one' }),
        one({ id: 'm-2', name: 'Sweep two' }),
      ]),
      writes: { ...NEVER, remove },
    })

    await userEvent.click((await screen.findAllByRole('button', { name: /^Delete / }))[0]!)
    expect(remove).not.toHaveBeenCalled()

    const confirm = await screen.findByRole('alertdialog')
    await userEvent.click(within(confirm).getByRole('button', { name: /delete/i }))

    await waitFor(() => {
      expect(remove).toHaveBeenCalledTimes(1)
    })
    expect(remove.mock.calls[0]?.[0]).toEqual(['m-1'])
  })
})

describe('a write nobody has answered', () => {
  /**
   * **The case does not hold the row until the server says it does.**
   */
  it('adds no row while the container is still thinking', async () => {
    draw({ kase: withMethods([one({ id: 'm-1', name: 'Sweep one' })]), writes: NEVER })

    const before = (await screen.findAllByRole('row')).length
    await userEvent.click(screen.getByRole('button', { name: 'Add method' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add method' })
    await userEvent.type(within(dialog).getByLabelText(/^Name/), 'mailbox rule audit')
    await userEvent.click(within(dialog).getByRole('button', { name: /create|save/i }))

    // **The dialog stays, and that is the point.** It used to close the moment
    // it handed the fields over, so a write nobody answered -- refused, or
    // still out -- took the draft with it. What the analyst typed is theirs
    // until the server has said something about it.
    expect(screen.getByRole('dialog', { name: 'Add method' })).toBeInTheDocument()
    expect(within(screen.getByRole('dialog')).getByLabelText(/^Name/)).toHaveValue(
      'mailbox rule audit',
    )
    // And still no row. The rows sit behind a modal and are out of the
    // accessibility tree while it is open, so the dialog is dismissed first --
    // which also says the analyst can leave, having been told nothing.
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Add method' })).toBeNull()
    })
    expect(screen.getAllByRole('row')).toHaveLength(before)
  })
})

describe('the empty state', () => {
  it('offers the way in on a case with no methods', async () => {
    draw({ kase: withMethods([]) })
    expect(await screen.findByText('No methods recorded')).toBeInTheDocument()
    // The add door in the head, and the one in the empty state.
    expect(screen.getAllByRole('button', { name: /Add method/ }).length).toBeGreaterThan(1)
  })

  /**
   * **A search that found nothing is not an invitation to create the row it
   * failed to find.**
   */
  it('offers no way in when a search is what emptied the table', async () => {
    draw({ search: 'no method says this' })
    expect(await screen.findByText('Nothing matches')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Add method/ })).toHaveLength(1)
  })
})
