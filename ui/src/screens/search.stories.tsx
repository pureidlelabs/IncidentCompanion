import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import type { Case } from '@/api/model'
import { campaignCase } from '@/fixtures/campaign'
import { msOf } from '@/lib/case-time'

import { SearchScreen } from './search'
import { inACase } from '@/fixtures/in-a-case'

/** A case created and not yet worked, so a search of it can find nothing. */
const BLANK: Case = {
  ...campaignCase,
  timeline: [],
  systems: [],
  accounts: [],
  networkIndicators: [],
  malware: [],
  cloudApps: [],
  impact: [],
  evidence: [],
  actions: [],
  casenotes: [],
}

/**
 * Case-wide search, over the values an analyst can see.
 *
 * The section headings carry the count, and each hit says which fields matched
 * - so a result explains itself without opening the row.
 */
const meta = {
  title: 'Screens/Anywhere/Search',
  component: SearchScreen,
  decorators: [inACase('search')],
  parameters: { layout: 'fullscreen' },
  args: { kase: campaignCase },
} satisfies Meta<typeof SearchScreen>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The box empty, which is what the screen opens on.
 *
 * An empty query matches nothing rather than everything: "the screen just
 * opened" and "a query matched the whole case" must not look the same.
 */
export const Unsearched: Story = { name: 'Nothing searched yet' }

/**
 * A hostname, which is the query an analyst types most.
 *
 * `DC-01` matches in four tables at once - the asset row, the two timeline
 * entries naming it, the evidence taken from it and the action taken on it -
 * which is the whole reason this screen exists beside the per-table filters.
 */
export const Populated: Story = {
  name: 'A hostname across four tables',
  args: { query: 'dc-01' },
}

/**
 * A group's own door, pressed on a query that found four tables.
 *
 * Every group draws the same control, so the door has to lead to the heading
 * it sits under and not to the first one on the screen. What leaves is the
 * case field key the group reads from, not its analyst-facing heading -- so a
 * caller opens the section without translating a display label back into an
 * identifier.
 */
export const SectionOpened: Story = {
  name: 'A section opened from its group',
  args: { query: 'dc-01', onOpenSection: fn() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    // Not the first group on the screen: opening every group at the top of
    // the page is the failure this is here for.
    const doors = await canvas.findAllByRole('button', { name: /^Open / })
    await expect(doors.length).toBeGreaterThan(1)
    await userEvent.click(await canvas.findByRole('button', { name: 'Open Evidence' }))
    await expect(args.onOpenSection).toHaveBeenCalledOnce()
    await expect(args.onOpenSection).toHaveBeenCalledWith('evidence')
  },
}

/**
 * Two terms, which narrow rather than widen.
 *
 * Every whitespace-separated term must match, so this is a smaller answer than
 * either word alone.
 */
export const TwoTerms: Story = {
  name: 'Two terms, matched together',
  args: { query: 'backup encrypt' },
  play: async ({ canvas, step }) => {
    await step('both terms are what was searched for', async () => {
      await expect(canvas.getByDisplayValue('backup encrypt')).toBeInTheDocument()
    })
    await step('and something matched both, so the AND path is exercised', async () => {
      // *Smaller than either word alone* needs two renders to compare, which a
      // story cannot do. What it can hold is that requiring both still finds
      // something -- a fixture where it found nothing would leave the narrowing
      // untested and look identical to one where it worked.
      await expect(canvas.queryByText('No matches')).toBeNull()
    })
  },
}

/** A query nothing in the case mentions, with the way back offered. */
export const NoMatch: Story = {
  name: 'A query matching nothing',
  args: { query: 'no row in this case says this' },
  play: async ({ canvas, step }) => {
    await step('the miss is named', async () => {
      await expect(canvas.getByText('No matches')).toBeVisible()
    })
    await step('and it is not confused with having searched nothing yet', async () => {
      await expect(canvas.queryByText('Nothing searched yet')).toBeNull()
    })
  },
}

/**
 * A case with nothing in it: the search is answered honestly rather than
 * differently.
 *
 * The words are the same as any other miss, because the analyst's next move is
 * the same either way.
 */
export const EmptyCase: Story = {
  play: async ({ canvas, step }) => {
    await step('an empty case answers a search the same way any miss does', async () => {
      // The analyst's next move is the same either way, so a different
      // sentence here would be a distinction that changes nothing.
      await expect(canvas.getByText('No matches')).toBeVisible()
    })
  },
  name: 'A case with nothing in it',
  args: { kase: BLANK, query: 'anything' },
}

/**
 * A 420px pane.
 *
 * A hit's title and its matched fields each truncate on their own line rather
 * than wrapping into a paragraph.
 */
export const Narrow: Story = {
  name: 'A narrow pane',
  render: (args) => (
    <div className="w-[420px] border border-dashed border-border p-2">
      <SearchScreen {...args} />
    </div>
  ),
  args: { query: 'dc-01' },
}

/**
 * A term that matches a long note.
 *
 * The value is collapsed to one line at 90 characters, so a paragraph-length
 * note does not take the whole card.
 */
export const Overlong: Story = {
  name: 'A match inside a long value',
  args: {
    kase: {
      ...campaignCase,
      casenotes: campaignCase.casenotes.map((note, at) =>
        at === 0
          ? {
              ...note,
              note: 'Handover to the day shift: rclone was staged on wks-finance01 under a scheduled task named MicrosoftEdgeUpdateTaskMachineCore, and the destination bucket has been reported to the provider but not yet taken down, so exfiltration may still be reachable from any host we have not isolated.',
            }
          : note,
      ),
    },
    query: 'rclone',
  },
}

/**
 * A term that matches across a quarter of a case rather than a week.
 *
 * Every group is past the height it has, so this is where the section headings
 * and their counts are judged rather than the shape of one hit.
 */
export const Dense: Story = {
  name: 'A query over a quarter of a case',
  args: { kase: manyWeeks(), query: 'dc-01' },
  // The heading's count is the claim. A group that capped its own list and
  // counted what it drew reports a smaller case than the one searched.
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const heading = await canvas.findByRole('heading', { name: /^Timeline/ })
    const count = /(\d+)\s*$/.exec(heading.textContent)?.[1]
    await expect(Number(count)).toBeGreaterThan(20)
  },
}

/** The campaign's week repeated over ten, each copy a week further on. */
function manyWeeks(): Case {
  const week = 7 * 24 * 60 * 60 * 1000
  return {
    ...campaignCase,
    timeline: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap((step) =>
      campaignCase.timeline.map((entry) => {
        const at = msOf(entry.time)
        return {
          ...entry,
          id: `${entry.id}-week-${String(step)}`,
          time: at === null ? entry.time : new Date(at + step * week).toISOString(),
        }
      }),
    ),
  }
}
