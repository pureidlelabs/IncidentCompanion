import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, fn, userEvent, within } from 'storybook/test'

import { TablePager } from '@/components/ui/table-pager'

/**
 * `TablePager` on the React Aria kit, at each end of a table and in flight.
 */
const meta = {
  title: 'Components/Table pager',
  component: TablePager,
  parameters: { layout: 'padded' },
  args: {
    pageNumber: 2,
    firstRow: 26,
    showing: 25,
    total: 137,
    hasPrevious: true,
    hasNext: true,
    onPrevious: () => undefined,
    onNext: () => undefined,
  },
} satisfies Meta<typeof TablePager>

export default meta
type Story = StoryObj<typeof meta>

/** Both ends open, which is every page but the first and the last. */
export const Middle: Story = {
  name: 'Mid-table \u2014 both directions open',
}

/**
 * The first page: one end is closed and the other is open, which is the state a
 * table opens in and the one an analyst sees most.
 */
export const FirstPage: Story = {
  name: 'First page \u2014 Previous disabled',
  args: { pageNumber: 1, firstRow: 1, hasPrevious: false, onPrevious: fn() },
  play: async ({ args, canvas, step }) => {
    const previous = canvas.getByRole('button', { name: /Previous/ })

    await step('The closed end refuses, and the open one does not', async () => {
      await expect(previous).toBeDisabled()
      await expect(canvas.getByRole('button', { name: /Next/ })).toBeEnabled()
    })

    await step('A press on it lands nowhere', async () => {
      await userEvent.click(previous, { pointerEventsCheck: 0 })
      await expect(args.onPrevious).not.toHaveBeenCalled()
    })
  },
}

/** The last page, where the row count is a partial one rather than the page size. */
export const LastPage: Story = {
  name: 'Last page \u2014 Next disabled',
  args: { pageNumber: 6, firstRow: 126, showing: 12, hasNext: false },
  play: async ({ canvas }) => {
    // The range says which twelve, which a bare count never did.
    await expect(canvas.getByText('Page 6 \u00B7 126\u2013137 of 137')).toBeVisible()
  },
}

/**
 * No total, which is what a cursor-ordered table has before anything counts it.
 * The line says the page and the rows on it, and claims nothing more.
 */
export const CountUnknown: Story = {
  name: 'No total \u2014 a cursor that cannot count',
  args: { total: undefined },
}

/**
 * `busy` closes both ends without touching `hasPrevious` or `hasNext`, so the
 * pager reopens where it was when the page arrives rather than at whichever end
 * the caller last described.
 */
export const Busy: Story = {
  name: 'A page in flight \u2014 both disabled',
  args: { busy: true, onPrevious: fn(), onNext: fn() },
  play: async ({ args, canvas, step }) => {
    const next = canvas.getByRole('button', { name: /Next/ })

    await step('Both refuse, though a page waits each way', async () => {
      await expect(canvas.getByRole('button', { name: /Previous/ })).toBeDisabled()
      await expect(next).toBeDisabled()
    })

    await step('So a second press cannot outrun the page in flight', async () => {
      await userEvent.click(next, { pointerEventsCheck: 0 })
      await expect(args.onNext).not.toHaveBeenCalled()
    })
  },
}

/** One row, and the count is singular rather than reading `1 rows`. */
export const OneRow: Story = {
  name: 'One row \u2014 singular',
  args: { pageNumber: 6, firstRow: 137, showing: 1, hasNext: false },
}

/** A filter emptied the page. The pager stays, so there is a way back. */
export const NoRows: Story = {
  name: 'Nothing on this page',
  args: { pageNumber: 4, firstRow: 76, showing: 0, hasNext: false },
}

/** A table nobody would page to the end of, and the widest the count line gets. */
export const LargeCount: Story = {
  name: 'A five-figure total',
  args: { pageNumber: 118, firstRow: 29_251, showing: 250, total: 29_402 },
}

/**
 * The row count is `aria-live`, so paging announces itself without a focus
 * move.
 */
export const Announcing: Story = {
  name: 'The count announces a page change',
  render: function Announcing(args) {
    const [page, setPage] = useState(2)
    return (
      <TablePager
        {...args}
        pageNumber={page}
        firstRow={(page - 1) * 25 + 1}
        showing={page === 6 ? 12 : 25}
        hasPrevious={page > 1}
        hasNext={page < 6}
        onPrevious={() => {
          setPage((at) => Math.max(1, at - 1))
        }}
        onNext={() => {
          setPage((at) => Math.min(6, at + 1))
        }}
      />
    )
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const count = canvas.getByText(/^Page 2\b/)

    // The count is what carries the change: no focus moves and no button
    // appears or leaves, so without the live region the page turn is silent.
    await expect(count).toHaveAttribute('aria-live', 'polite')
    await userEvent.click(canvas.getByRole('button', { name: /Next/ }))
    await expect(count).toHaveTextContent(/^Page 3\b/)
  },
}
