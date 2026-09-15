import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen } from 'storybook/test'

import { ActivityLog, type ActivityReading } from '@/components/blocks/activity-log'
import { PICKER_AUDIT } from '@/components/blocks/picker-rows'

/** A reading whose controls do nothing, which is what a story wants. */
const reading: ActivityReading = {
  range: '7d',
  onRange: fn(),
  filters: {
    selection: {},
    chosen: () => [],
    one: () => undefined,
    narrowed: false,
    applied: [],
    clear: fn(),
    controls: { dimensions: [], selection: {}, onChange: fn() },
  },
  pageNumber: 1,
  hasPrevious: false,
  hasNext: false,
  onPrevious: fn(),
  onNext: fn(),
}

/**
 * An installation's own log: a search-and-filter toolbar, the table, and a run
 * of identical events drawn as one line with a count.
 *
 * **The search reads the Activity column and nothing else**, which is what its
 * label promises and is asserted in `activity-log.test.ts` as a predicate. The
 * stories below assert the half a predicate cannot: that typing in the box
 * moves the table.
 *
 * **The range, the chips and the page are the pane's questions**, so this block
 * draws them and reports a press rather than filtering what it was handed.
 */
const meta = {
  title: 'Blocks/System/Activity log',
  component: ActivityLog,
  parameters: { layout: 'padded' },
  args: { reading },
} satisfies Meta<typeof ActivityLog>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The whole log, including the two runs.
 *
 * A repeated event is one line carrying how many times it happened - 44
 * refused requests from one address is a line to act on, and 44 lines of it is
 * a log nobody reads to the bottom of.
 */
export const Log: Story = {
  name: "The installation's own log",
  args: { audit: PICKER_AUDIT },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Sign-in failed')).toBeVisible()
    await expect(canvas.getByText('\u00d76')).toBeVisible()
    await expect(canvas.getByText('\u00d744')).toBeVisible()
    // A single occurrence carries no count at all.
    await expect(canvas.queryByText('\u00d71')).not.toBeInTheDocument()
  },
}

/**
 * A fresh install has recorded nothing, which is a different sentence from
 * nothing matching: there is no filter to drop.
 */
export const Fresh: Story = {
  name: 'A log with nothing recorded yet',
  args: { audit: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Nothing recorded yet')).toBeVisible()
  },
}

/**
 * Typing in the box moves the table.
 *
 * The predicate is tested next door; what this asserts is the wiring, which no
 * predicate test can see - the box is bound to the filter, and the filter to
 * the rows.
 */
export const SearchNarrowsTheTable: Story = {
  name: 'The search moves the table',
  args: { audit: PICKER_AUDIT },
  play: async ({ canvas, step, userEvent }) => {
    await expect(canvas.getByText('Case opened')).toBeVisible()

    await step('search the Activity column', async () => {
      await userEvent.type(canvas.getByRole('textbox', { name: 'Activity contains' }), 'sign-in')
    })

    await expect(await canvas.findByText('Sign-in failed')).toBeVisible()
    await expect(canvas.queryByText('Case opened')).not.toBeInTheDocument()
  },
}

/**
 * The range is the pane's question, so pressing a preset reports it rather than
 * filtering the rows on screen. -> #663
 */
export const APresetIsReported: Story = {
  name: 'Choosing a range asks the pane for it',
  args: { audit: PICKER_AUDIT },
  play: async ({ args, canvas, step, userEvent }) => {
    await step('choose a wider range', async () => {
      await userEvent.click(canvas.getByRole('button', { name: /7 days/ }))
      await userEvent.click(await screen.findByRole('option', { name: '30 days' }))
    })

    await expect(args.reading.onRange).toHaveBeenCalledWith('30d')
    // The rows are whatever the pane was handed; this block no longer cuts them.
    await expect(canvas.getByText('Account locked')).toBeVisible()
  },
}

/** Fewer lines than a page holds, so the pager has nowhere to go. */
export const OnePage: Story = {
  name: 'Fewer lines than a page holds',
  args: { audit: PICKER_AUDIT },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: /next/i })).toBeDisabled()
    await expect(canvas.getByRole('button', { name: /previous/i })).toBeDisabled()
    await expect(canvas.getByText(/Page 1/)).toBeVisible()
  },
}

/**
 * A page in the middle of a walk.
 *
 * The rows are one page of many and the counts are the table's, so the pager
 * says where the reader is and asks the pane to move. It cannot cut the rows
 * itself: the page after this one is a request. -> #663
 */
export const APageInTheMiddle: Story = {
  name: 'One page of many',
  args: {
    audit: PICKER_AUDIT,
    reading: { ...reading, pageNumber: 2, hasPrevious: true, hasNext: true },
  },
  play: async ({ args, canvas, step, userEvent }) => {
    await expect(canvas.getByText(/Page 2/)).toBeVisible()
    await expect(canvas.getByRole('button', { name: /previous/i })).toBeEnabled()

    await step('ask for the next page', async () => {
      await userEvent.click(canvas.getByRole('button', { name: /next/i }))
    })
    await expect(args.reading.onNext).toHaveBeenCalled()
  },
}

/**
 * A search matching nothing says which of the two empties it is, and offers
 * the way back.
 *
 * Pairs with `Fresh`: the same table, the same absence of rows, and a
 * different sentence because something was narrowed.
 */
export const NothingMatches: Story = {
  name: 'A search that matches nothing',
  args: { audit: PICKER_AUDIT },
  play: async ({ canvas, step, userEvent }) => {
    await step('search for something the log never recorded', async () => {
      await userEvent.type(canvas.getByRole('textbox', { name: 'Activity contains' }), 'zzz')
    })

    await expect(await canvas.findByText('Nothing matches those filters')).toBeVisible()
    await expect(canvas.queryByText('Nothing recorded yet')).not.toBeInTheDocument()

    await step('take the way back', async () => {
      await userEvent.click(canvas.getByRole('button', { name: /clear filters/i }))
    })

    await expect(await canvas.findByText('Case opened')).toBeVisible()
  },
}

/**
 * The longest activity, actor and target a line would carry.
 *
 * The eight columns are a fixed frame: a line saying more than the others does
 * not widen the table, because a log is read by scanning one column down
 * rather than one row across.
 */
export const TheLongestText: Story = {
  name: 'A line saying far more than the others',
  args: {
    audit: [
      {
        ...PICKER_AUDIT[0]!,
        id: 'long',
        activity: 'Federation provider group mapping changed for the contractor tenancy',
        actor: 'margot.delacroix-vandenberghe@partner.example.corp',
        target: 'Meridian Logistics ransomware engagement, incident response contractors',
        source: '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
      },
      ...PICKER_AUDIT.slice(1, 3),
    ],
  },
  play: async ({ canvasElement }) => {
    const table = canvasElement.querySelector('table')!.getBoundingClientRect()
    for (const cell of canvasElement.querySelectorAll('td')) {
      await expect(cell.getBoundingClientRect().right).toBeLessThanOrEqual(table.right + 1)
    }
  },
}
