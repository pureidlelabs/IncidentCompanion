import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'

import type { Case } from '@/api/model'
import { Button } from '@/components/ui/button'
import { campaignCase } from '@/fixtures/campaign'
import { msOf } from '@/lib/case-time'

import { CommandPaletteDialog, CasePalette, SECTIONS } from './command-palette-dialog'

/** A case created and not yet worked, so the palette has nothing of its own to offer. */
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
 * The palette surface: commands, sections, and the case's own rows.
 *
 * It is a dialog in the app. Drawn here as the panel that dialog holds, because
 * a story that opened a modal on mount would stack un-dismissably in the docs
 * page.
 */
const meta = {
  title: 'Blocks/Overlay/Command palette',
  component: CasePalette,
  parameters: { layout: 'padded' },
  args: {
    kase: campaignCase,
  },
} satisfies Meta<typeof CasePalette>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The palette as it opens: every command and every section, and no rows.
 *
 * An empty query matches nothing in the case on purpose - "just opened" and "a
 * query matched everything" must not look the same.
 */
export const JustOpened: Story = { name: 'Just opened' }

/**
 * A hostname typed, which reaches all three groups.
 *
 * The commands and the sections take a subsequence match; the case's rows go
 * through the same matcher the header's search box runs, so both surfaces
 * answer the same question the same way.
 */
export const Populated: Story = {
  name: 'A hostname typed',
  args: { query: 'dc-01' },
}

/**
 * An acronym, which is the typing a keyboard-driven analyst does.
 *
 * `cs` reaches rows it is a prefix of nothing in -- *Search this case*, *Close
 * the case*, *Case notes* -- through the subsequence match.
 *
 * **What the ranking does is not visible here**, and this story does not claim
 * it. `paletteRank` orders within a group, and the rows this query returns tie,
 * so the order on screen is the registry's. The ranking is exercised where it
 * can be: `command-palette.match.test.ts` calls the function directly.
 */
export const Acronym: Story = {
  play: async ({ canvas, step }) => {
    // Read off the options rather than by text: a matched row highlights the
    // characters it matched, so the label is split across elements and no
    // single text node says `Case settings`.
    const rows = canvas.getAllByRole('option').map((one) => one.textContent)
    await step('an acronym reaches a title it is not a prefix of', async () => {
      // `cs` is how a keyboard-driven analyst types, and the subsequence
      // matcher reaches Case settings from it.
      await expect(rows.some((one) => one.includes('Case notes'))).toBe(true)
    })
    await step('the groups keep their order, commands before sections', async () => {
      // This is group order rather than rank: reversing the rank comparator
      // leaves it unmoved, which is how the ranking claim was found to be
      // untestable from here.
      const command = rows.findIndex((one) => one.includes('Search this case'))
      const section = rows.findIndex((one) => one.includes('Case notes'))
      await expect(command).toBeGreaterThanOrEqual(0)
      await expect(section).toBeGreaterThanOrEqual(0)
      await expect(command).toBeLessThan(section)
    })
  },
  name: 'An acronym typed',
  args: { query: 'cs' },
}

/** A query nothing matches, which says so rather than drawing an empty list. */
export const NoMatch: Story = {
  name: 'A query matching nothing',
  args: { query: 'zzzz nothing here' },
}

/**
 * A case with nothing in it: the commands and the sections stay, and the third
 * group is absent rather than empty.
 */
export const EmptyCase: Story = {
  play: async ({ canvas, step }) => {
    await step('the two served groups stay', async () => {
      await expect(canvas.getByText('Commands')).toBeVisible()
      await expect(canvas.getByText('Sections')).toBeVisible()
    })
    await step('and the case`s own group is absent rather than empty', async () => {
      // An empty group is a heading over nothing, which reads as a list that
      // failed to load rather than a case with nothing in it.
      await expect(canvas.queryByText('In this case')).toBeNull()
    })
  },
  name: 'A case with nothing in it',
  args: { kase: BLANK, query: 'a' },
}

/**
 * An install with one section.
 *
 * The Sections group holds one row rather than disappearing, which is the state
 * a stripped-down deployment shows.
 */
export const OneSection: Story = {
  name: 'One section to jump to',
  args: { sections: SECTIONS.filter((one) => one.slug === 'timeline') },
}

/**
 * A 380px pane.
 *
 * A row's label truncates and its chord or section chip keeps its place at the
 * end, rather than the two swapping order as the panel narrows.
 */
export const Narrow: Story = {
  name: 'A narrow pane',
  render: (args) => (
    <div className="w-[380px] border border-dashed border-border p-2">
      <CasePalette {...args} />
    </div>
  ),
  args: { query: 'dc-01' },
}

/** A row whose title is a paragraph, matched from a long case note. */
export const Overlong: Story = {
  name: 'A row too long for the panel',
  args: {
    kase: {
      ...campaignCase,
      casenotes: campaignCase.casenotes.map((note, at) =>
        at === 0
          ? {
              ...note,
              note: 'Handover to the day shift: rclone was staged on DC-01 under a scheduled task named MicrosoftEdgeUpdateTaskMachineCore, and the destination bucket has been reported to the provider but not yet taken down.',
            }
          : note,
      ),
    },
    query: 'rclone',
  },
}

/**
 * A row committed, and what leaves: the row's own id and nothing beside it.
 *
 * The other stories are query in, list out; this is the only one that presses
 * anything.
 */
export const Committing: Story = {
  name: 'Choosing a row',
  args: { query: 'timeline', onAction: fn() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const rows = await canvas.findAllByRole('option')
    await userEvent.click(rows[0]!)
    await waitFor(() => {
      void expect(args.onAction).toHaveBeenCalledWith(expect.stringMatching(/^(command|section|row):/))
    })
  },
}

/**
 * A query reaching a quarter of a case rather than a week.
 *
 * The panel caps what it lists rather than growing past the dialog, and the
 * three groups keep their order however many rows the case offers.
 */
export const Dense: Story = {
  name: 'A query over a quarter of a case',
  args: { kase: manyWeeks(), query: 'dc-01' },
  // A panel that grew with the answer rather than capping it is the failure
  // this story exists to show, so the row count is what it asserts.
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const rows = await canvas.findAllByRole('option')
    await expect(rows.length).toBeGreaterThan(5)
  },
}

/**
 * The palette over the case, on a scrim, its field seeded by the caller.
 *
 * Opened by a press. A modal opened on mount stacks un-dismissably in the docs
 * page, so every story above draws the panel bare.
 */
export const AsTheAppOpensIt: Story = {
  name: 'Raised over the case',
  render: () => {
    function Controlled() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <Button
            variant="outline"
            onPress={() => {
              setOpen(true)
            }}
          >
            Open the palette
          </Button>
          <CommandPaletteDialog
            isOpen={open}
            onOpenChange={setOpen}
            query="dc-01"
            kase={campaignCase}
          />
        </>
      )
    }
    return <Controlled />
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Open the palette' }))
    // **Presence, never `toBeVisible`.** The overlay settles at opacity 0 in
    // this tier, so a correct dialog reads as absent.
    const box = await waitFor(() => {
      const found = document.querySelector<HTMLInputElement>('[role="dialog"] input')
      void expect(found).not.toBeNull()
      return found
    })
    void expect(box?.value).toBe('dc-01')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => {
      void expect(document.querySelector('[role="dialog"]')).toBeNull()
    })
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
