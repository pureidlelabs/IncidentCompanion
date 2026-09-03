import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, screen, userEvent, within } from 'storybook/test'

import { ApiError } from '@/api/client'
import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

import { EntitiesScreen } from './entities'
import { EMPTY_CASE } from '@/components/blocks/entity-scope'
import { inACase } from '@/fixtures/in-a-case'

/**
 * Every entity in the case, and each kind on its own, as one screen.
 *
 * The scope row is the screen's own state here rather than the router's, so a
 * story can be pressed through all six scopes without leaving the page.
 */
const meta = {
  title: 'Screens/Collect/All entities',
  component: EntitiesScreen,
  parameters: { layout: 'fullscreen' },
  /**
   * The scope an entity reference needs, and the router the link it becomes
   * needs after that. Without the provider these screens draw plain text where
   * the app draws a link with a hover card -- and a link and a span are
   * identical at rest here, so the difference is navigability rather than
   * anything a capture can show.
   *
   * **At meta level, so `Inside the shell` does not nest a second router**,
   * which react-router throws on.
   */
  decorators: [inACase('entities')],
  args: {
    kase: campaignCase,
    specs: specsFixture,
  },
} satisfies Meta<typeof EntitiesScreen>

export default meta
type Story = StoryObj<typeof meta>

/** 78 rows over five kinds: 30 systems, 18 accounts, 16 network, 12 malware, 2 cloud apps. */
export const Populated: Story = {
  play: async ({ canvas, step }) => {
    await step('unscoped, the Kind facet is offered', async () => {
      // The other half: asserting only that it disappears passes just as well
      // if it were never offered at all.
      await userEvent.click(canvas.getByRole('button', { name: /Filters/ }))
      const picker = within(await screen.findByRole('dialog'))
      await expect(await picker.findByText('Kind')).toBeInTheDocument()
    })
  },
  name: 'Every kind at once',
}

/**
 * The screen in the frame it renders in.
 *
 * Composition is what a gallery cannot otherwise show: parts each correct and
 * the page wrong.
 */
export const InTheShell: Story = {
  name: 'Inside the shell',
  parameters: { layout: 'fullscreen' },
  play: async ({ canvasElement, step }) => {
    /**
     * **One shell, so one `main`.** The meta decorator puts every story in
     * this file inside `CaseFrame`, which is a shell; a story mounting a
     * second one gave the page two `main` landmarks and two banners, and axe
     * said so on three rules at once. A gallery showing a composition wrong is
     * the thing this story exists to rule out.
     */
    await step('the page has one main landmark, not two', async () => {
      const mains = canvasElement.ownerDocument.querySelectorAll('main, [role="main"]')
      await expect(mains.length).toBe(1)
    })
  },
  // **No shell of its own.** The meta decorator already wraps every story
  // here in `CaseFrame`, which is the shell -- and `CaseFrame` exists so a
  // case's rail is composed in one place. This story built a second one with
  // four hand-written rows beside the twenty the registry draws, and the page
  // came out with two `main` landmarks.
}

/**
 * Scoped to one kind, which swaps the columns and leaves the chrome alone.
 *
 * The Kind facet is gone: the row above names it, and every other chip would
 * read zero.
 */
export const Scoped: Story = {
  play: async ({ canvas, step }) => {
    await step('the Kind facet is not offered once a kind is chosen', async () => {
      // The facets sit behind the Filters picker, so this has to be opened:
      // asserting on the closed bar finds no chip at any scope and passes
      // whatever the screen does.
      await userEvent.click(canvas.getByRole('button', { name: /Filters/ }))
      const picker = within(await screen.findByRole('dialog'))
      // The row above already names the kind, and every other option would
      // read zero -- a Kind filter disagreeing with the scope row in silence
      // is what this removal exists to prevent.
      // `find`, not `get` plus a box assertion: the popover animates in, so
      // the option exists a frame before it paints.
      await expect(await picker.findByText('Attention')).toBeInTheDocument()
      await expect(picker.queryByText('Kind')).toBeNull()
    })
  },
  name: 'Scoped to malware',
  args: { scope: 'malware' },
}

/**
 * A search the scope row answers.
 *
 * The search spans every kind at every scope, so the counts say which kind the
 * string is in - the lookup no single-kind screen can do.
 */
export const Searching: Story = {
  name: 'A search across every kind',
  args: { search: 'meridian' },
  // The claim the scope row exists for, asserted on what rendered: one string
  // reaches more than one kind. A story that only mounts cannot see this, and
  // the search was switched off entirely without either tier noticing.
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const grid = await canvas.findByRole('grid', { name: 'Every entity in this case' })
    const kinds = new Set(
      within(grid)
        .getAllByRole('row')
        .slice(1)
        .map((row) => row.querySelectorAll('[role="gridcell"]')[1]?.textContent.trim() ?? ''),
    )
    kinds.delete('')
    await expect(kinds.size).toBeGreaterThan(1)
  },
}

/** No rows in any collection. The offers name the kinds this screen rolls up. */
export const Empty: Story = {
  name: 'A case with nothing in it',
  args: { kase: EMPTY_CASE },
}

/** A different empty, and different words: the fix is a filter, not an entry. */
export const NoMatch: Story = {
  name: 'Filtered to nothing',
  args: { search: 'no entity says this' },
  // The table is replaced outright, not drawn empty - and the words are the
  // filtered ones. Mounting alone passed this story with the search disabled.
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('Nothing matches')).toBeVisible()
    await expect(canvas.queryByRole('grid')).toBeNull()
  },
}

/**
 * A 420px pane.
 *
 * The table keeps a `min-w` floor and scrolls sideways inside its wrapper
 * rather than crushing every column: dropping columns responsively was tried
 * and leaves the width behind.
 */
export const Narrow: Story = {
  name: 'A narrow pane',
  render: (args) => (
    <div className="w-[420px] border border-dashed border-border p-2">
      <EntitiesScreen {...args} />
    </div>
  ),
}

/**
 * A value longer than its column.
 *
 * Truncation is width-independent: the widths are percentages of a fixed-layout
 * table, so a wider window scales the truncation rather than curing it. The
 * expanded row is where the whole value is readable.
 */
export const Overlong: Story = {
  name: 'A value too long for its column',
  args: {
    kase: {
      ...campaignCase,
      systems: campaignCase.systems.map((row, at) =>
        at === 0
          ? {
              ...row,
              hostname:
                'WKS-FIN-01.corp.subsidiary.meridian-logistics-group.example.internal.lan',
            }
          : row,
      ),
    },
  },
}

/**
 * Every kind quadrupled: over three hundred rows across the five kinds at
 * once, where the pager and the sticky head have to hold together.
 */
export const Dense: Story = {
  name: 'Every kind, quadrupled',
  args: { kase: manyEntities() },
  // The claim the name makes. A roll-up that capped itself at the 78 the
  // fixture holds would render identically to the populated story.
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const grid = await canvas.findByRole('grid', { name: 'Every entity in this case' })
    const rows = within(grid).getAllByRole('row')
    await expect(rows.length).toBeGreaterThan(300)
  },
}

/** One row ticked: the bulk bar appears, offering only Delete across kinds. */
export const Selected: Story = {
  name: 'Selection: one ticked',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const rowBoxes = canvas
      .getAllByRole('checkbox')
      .filter((box) => box.getAttribute('aria-label') !== 'Select every row')
    const first = rowBoxes[0]
    if (!first) throw new Error('the demo case has no entity to tick')
    await userEvent.click(first)
    await expect(await canvas.findByText('1 selected')).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Delete 1' })).toBeVisible()
    // No bulk edit across kinds: a system and a cloud app share no field.
    await expect(canvas.queryByRole('button', { name: /^Edit \d+$/ })).toBeNull()
  },
}

/** An entity link's arrival: the row is scrolled to and flashed. */
export const Highlighted: Story = {
  name: 'Arriving on one row',
  args: { highlightId: campaignCase.malware[0]?.id ?? '', scope: 'malware' },
}

/**
 * A delete the server refuses.
 *
 * Press a row's bin, then Delete: the dialog stays open and replaces its
 * consequence line with the reason. Nothing opens on mount.
 */
export const RefusedDelete: Story = {
  name: 'A refused delete',
  args: {
    refuseDelete: () =>
      Promise.reject(
        new ApiError(409, 'Another analyst wrote to this row first.', {
          error: 'version_conflict',
        }),
      ),
  },
}

/** A write another analyst got in first with, reported above the table. */
export const RefusedWrite: Story = {
  name: 'A refused write',
  args: {
    refusal: { field: 'Verdict', row: 'DC-01', by: 'R. Okonkwo' },
    scope: 'assets',
  },
}

/** Every kind's rows, copied four times over, each copy with its own id. */
function manyEntities() {
  const copies = <T extends { id: string }>(rows: readonly T[]) =>
    Array.from({ length: 4 }, (_, copy) =>
      rows.map((row) => ({ ...row, id: `${row.id}-dense-${String(copy)}` })),
    ).flat()
  return {
    ...campaignCase,
    systems: copies(campaignCase.systems),
    accounts: copies(campaignCase.accounts),
    networkIndicators: copies(campaignCase.networkIndicators),
    malware: copies(campaignCase.malware),
    cloudApps: copies(campaignCase.cloudApps),
  }
}
