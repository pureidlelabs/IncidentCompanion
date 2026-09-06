import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, screen } from 'storybook/test'

import { ActivityLog } from '@/components/blocks/activity-log'
import { PICKER_AUDIT } from '@/components/blocks/picker-rows'

/**
 * Fixed, and just after the newest line in the fixture, so every preset
 * resolves to the same bound on every run.
 */
const NOW = Date.parse('2026-08-24T15:00:00.000Z')

/**
 * An installation's own log: a search-and-filter toolbar, the table, and a run
 * of identical events drawn as one line with a count.
 *
 * **The search reads the Activity column and nothing else**, which is what its
 * label promises and is asserted in `activity-log.test.ts` as a predicate. The
 * stories below assert the half a predicate cannot: that typing in the box
 * moves the table.
 *
 * **The range is a preset or a pair of bounds**, and either way it filters:
 * a preset is `now` less its own span, and `Custom` reveals two datetime
 * inputs and takes whichever of them is filled.
 */
const meta = {
  title: 'Blocks/System/Activity log',
  component: ActivityLog,
  parameters: { layout: 'padded' },
  args: { now: NOW },
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
 * A preset reads the log back to its own bound and no further.
 *
 * `now` is fixed at 15:00 on the 24th, so **1 hour** keeps only the two lines
 * from 14:29 and 14:32 and drops the 13:58 one immediately before them.
 */
export const APresetNarrowsTheRange: Story = {
  name: 'A preset reads the log back to its own bound',
  args: { audit: PICKER_AUDIT },
  play: async ({ canvas, step, userEvent }) => {
    await expect(canvas.getByText('Account locked')).toBeVisible()
    await expect(canvas.getByText('Installation started')).toBeVisible()

    await step('read back only the last hour', async () => {
      await userEvent.click(canvas.getByRole('button', { name: /7 days/ }))
      await userEvent.click(await screen.findByRole('option', { name: '1 hour' }))
    })

    await expect(await canvas.findByText('Sign-in failed')).toBeVisible()
    // 13:58, half an hour outside the window, and everything older with it.
    await expect(canvas.queryByText('Account locked')).not.toBeInTheDocument()
    await expect(canvas.queryByText('Installation started')).not.toBeInTheDocument()
  },
}

/**
 * `All` applies no lower bound, which is the only way to reach the oldest
 * lines once a preset has been chosen.
 */
export const EveryLine: Story = {
  name: 'All, which applies no bound at all',
  args: { audit: PICKER_AUDIT },
  play: async ({ canvas, step, userEvent }) => {
    await step('narrow to the last hour first', async () => {
      await userEvent.click(canvas.getByRole('button', { name: /7 days/ }))
      await userEvent.click(await screen.findByRole('option', { name: '1 hour' }))
    })
    await expect(canvas.queryByText('Installation started')).not.toBeInTheDocument()

    await step('then drop the bound entirely', async () => {
      await userEvent.click(canvas.getByRole('button', { name: /1 hour/ }))
      await userEvent.click(await screen.findByRole('option', { name: 'All' }))
    })

    await expect(await canvas.findByText('Installation started')).toBeVisible()
  },
}

/**
 * `Custom` reveals a pair of bounds on the toolbar's own row.
 *
 * They are drawn only under `Custom`: two datetime pairs are the widest thing
 * on the toolbar, and they mean nothing while a preset is setting the bound.
 */
export const ACustomRange: Story = {
  name: 'A custom range reveals its two bounds',
  args: { audit: PICKER_AUDIT },
  play: async ({ canvas, step, userEvent }) => {
    // Each half names itself; the pair draws no visible label on this row.
    await expect(canvas.queryByRole('textbox', { name: 'From date' })).not.toBeInTheDocument()

    await step('reveal the pair', async () => {
      await userEvent.click(canvas.getByRole('button', { name: /7 days/ }))
      await userEvent.click(await screen.findByRole('option', { name: 'Custom' }))
    })

    await expect(await canvas.findByRole('textbox', { name: 'From date' })).toBeVisible()
    await expect(canvas.getByRole('textbox', { name: 'To date' })).toBeVisible()
  },
}

/**
 * Both bounds together cut a window out of the middle of the log.
 *
 * The upper bound is the half a preset never sets, and it is the one an
 * analyst reaches for when the question is what happened *before* something.
 * 13:58 survives; 14:29 and 14:32 are above the ceiling and 11:04 is below the
 * floor.
 */
export const ACustomWindow: Story = {
  name: 'A custom range, bounded on both sides',
  args: { audit: PICKER_AUDIT },
  play: async ({ canvas, step, userEvent }) => {
    await step('reveal the pair', async () => {
      await userEvent.click(canvas.getByRole('button', { name: /7 days/ }))
      await userEvent.click(await screen.findByRole('option', { name: 'Custom' }))
    })

    await step('floor it at midday and cap it at two', async () => {
      await userEvent.type(await canvas.findByRole('textbox', { name: 'From date' }), '2026-08-24')
      await userEvent.type(canvas.getByRole('textbox', { name: 'From time' }), '12:00')
      await userEvent.type(canvas.getByRole('textbox', { name: 'To date' }), '2026-08-24')
      await userEvent.type(canvas.getByRole('textbox', { name: 'To time' }), '14:00')
    })

    await expect(await canvas.findByText('Account locked')).toBeVisible()
    await expect(canvas.queryByText('Sign-in failed')).not.toBeInTheDocument()
    await expect(canvas.queryByText('Case opened')).not.toBeInTheDocument()
  },
}

/**
 * A range that matches nothing is a narrowing like any other, so it says which
 * empty it is and one control undoes it.
 *
 * The range was the one narrowing control this block did not count, which left
 * an emptied table claiming nothing had ever been recorded.
 */
export const ARangeThatMatchesNothing: Story = {
  name: 'A range with nothing in it',
  args: { audit: PICKER_AUDIT.slice(0, 3) },
  play: async ({ canvas, step, userEvent }) => {
    await step('read back an hour, from a log whose newest line is older', async () => {
      await userEvent.click(canvas.getByRole('button', { name: /7 days/ }))
      await userEvent.click(await screen.findByRole('option', { name: 'Custom' }))
      await userEvent.type(await canvas.findByRole('textbox', { name: 'From date' }), '2026-08-25')
      await userEvent.type(canvas.getByRole('textbox', { name: 'From time' }), '00:00')
    })

    await expect(await canvas.findByText('Nothing matches those filters')).toBeVisible()
    await expect(canvas.queryByText('Nothing recorded yet')).not.toBeInTheDocument()

    await step('one control undoes it, the range included', async () => {
      await userEvent.click(canvas.getByRole('button', { name: /clear filters/i }))
    })

    await expect(await canvas.findByText('Sign-in failed')).toBeVisible()
    await expect(canvas.getByRole('button', { name: /7 days/ })).toBeVisible()
  },
}

/**
 * The page size decides how many pages there are, and the pager walks them.
 *
 * Ten lines at twenty-five a page is one page with nowhere to go in either
 * direction; the pager says so by disabling both.
 */
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
 * Far more of a log than anybody reads, which is the state a running install
 * is in and the one nobody looks at.
 *
 * Six hundred lines at twenty-five a page is twenty-four pages. The pager
 * walks them, the size control changes how many there are, and narrowing under
 * a reader standing on a later page puts them back on one that exists.
 */
export const TooMuchData: Story = {
  name: 'Six hundred lines',
  args: {
    audit: Array.from({ length: 600 }, (_, i) => ({
      ...PICKER_AUDIT[i % PICKER_AUDIT.length]!,
      id: `bulk-${String(i)}`,
      // Spread back through the window an hour at a time, so the range still
      // has something to cut.
      at: new Date(NOW - i * 3_600_000).toISOString(),
    })),
  },
  play: async ({ canvas, step, userEvent }) => {
    await expect(canvas.getByText(/Page 1 \u00b7 1\u201325 of \d+/)).toBeVisible()
    await expect(canvas.getByRole('button', { name: /previous/i })).toBeDisabled()

    await step('walk to the second page', async () => {
      await userEvent.click(canvas.getByRole('button', { name: /next/i }))
    })
    // Which twenty-five, not just how many: the second page says 26-50, so a
    // reader who looked away knows where they are.
    await expect(await canvas.findByText(/Page 2 \u00b7 26\u201350 of \d+/)).toBeVisible()
    await expect(canvas.getByRole('button', { name: /previous/i })).toBeEnabled()

    await step('take a hundred at a time instead', async () => {
      await userEvent.click(canvas.getByRole('button', { name: /25 per page/ }))
      await userEvent.click(await screen.findByRole('option', { name: '100 per page' }))
    })

    // The size change returns the reader to the first page rather than to a
    // page number that means something different now.
    await expect(await canvas.findByText(/Page 1 \u00b7 1\u2013100 of \d+/)).toBeVisible()

    await step('walk out again, then narrow from under it', async () => {
      await userEvent.click(canvas.getByRole('button', { name: /next/i }))
      await expect(await canvas.findByText(/Page 2/)).toBeVisible()
      await userEvent.type(canvas.getByRole('textbox', { name: 'Activity contains' }), 'installation')
    })

    // Narrowing under a reader standing on page 2 puts them on a page that
    // exists, rather than on an empty one that reads as no matches.
    await expect(await canvas.findByText(/Page 1/)).toBeVisible()
    // The generated log repeats the fixture, so the match is many rows rather
    // than one; that it is on page 1 at all is the assertion.
    await expect(canvas.getAllByText('Installation started').length).toBeGreaterThan(0)
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
