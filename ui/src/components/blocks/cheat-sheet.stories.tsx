import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import { Button } from '@/components/ui/button'

import { CheatSheetDialog, CheatSheet } from './cheat-sheet'
import { COMMANDS } from '@/lib/shortcut-registry'

/**
 * The shortcut list, generated from the registry rather than written out.
 *
 * The sheet is a dialog in the app. It is drawn here as the surface the dialog
 * holds, because a story that opened a modal on mount would stack
 * un-dismissably in the docs page.
 */
const meta = {
  title: 'Blocks/Overlay/Cheat sheet',
  component: CheatSheet,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof CheatSheet>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Every command the registry holds, in its two groups.
 *
 * New report has no chord: `n` is Timeline's, and a second command claiming it
 * would make the keypress ambiguous rather than section-scoped. The row says
 * where the control is instead of printing a key that does nothing.
 */
export const Populated: Story = {
  name: 'Every shortcut',
  play: async ({ canvas, step }) => {
    await step('nothing is marked away on a screen where everything runs', async () => {
      await expect(canvas.queryByText('not here')).toBeNull()
      await expect(canvas.queryByText('not built')).toBeNull()
    })
  },
}

/**
 * The sheet opened from a screen where three of the commands cannot run.
 *
 * Marked rather than dropped: a shortcut that is absent from the list reads as
 * one the app does not have, and the analyst goes looking for it elsewhere.
 */
export const SomeUnavailable: Story = {
  name: 'Three commands unavailable here',
  args: { unavailable: ['new-entry', 'new-activity', 'node-list'] },
  play: async ({ canvas, step }) => {
    await step('the three are marked, not dropped', async () => {
      await expect(canvas.getAllByText('not here')).toHaveLength(3)
    })
    await step('and none of them is called unbuilt', async () => {
      await expect(canvas.queryByText('not built')).toBeNull()
    })
  },
}

/**
 * A command declared for the sheet and never dispatched.
 *
 * A chord with no honest surface is marked `not built`, which is a different
 * claim from a command that exists and is unreachable from this screen.
 */
export const Parked: Story = {
  name: 'A command with no surface yet',
  args: {
    commands: COMMANDS.map((one) =>
      one.id === 'node-list' ? { ...one, parked: true } : one,
    ),
  },
  play: async ({ canvas, step }) => {
    await step('it is marked unbuilt rather than unreachable', async () => {
      // Two different claims: *this app has not built it* against *you cannot
      // reach it from here*. Only the second is worth changing screen for.
      await expect(canvas.getAllByText('not built')).toHaveLength(1)
      await expect(canvas.queryByText('not here')).toBeNull()
    })
  },
}

/** One group with one command, which is what a sheet looks like before it grows. */
export const Sparse: Story = {
  name: 'A registry with one command',
  args: { commands: COMMANDS.filter((one) => one.id === 'palette') },
}

/**
 * A 420px pane.
 *
 * The title and the caps sit on one line at every width the sheet is drawn at;
 * a long title wraps rather than pushing the caps off the end.
 */
export const Narrow: Story = {
  name: 'A narrow pane',
  render: (args) => (
    <div className="w-[420px] border border-dashed border-border p-2">
      <CheatSheet {...args} />
    </div>
  ),
}

/**
 * The sheet as the app raises it: over the case, dismissable, nothing to
 * answer.
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
            Show the shortcuts
          </Button>
          <CheatSheetDialog isOpen={open} onOpenChange={setOpen} />
        </>
      )
    }
    return <Controlled />
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Show the shortcuts' }))
    // **Presence, never `toBeVisible`.** The overlay settles at opacity 0 in
    // this tier, so a correct dialog reads as absent.
    await waitFor(() => {
      void expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    })
    await userEvent.keyboard('{Escape}')
    await waitFor(() => {
      void expect(document.querySelector('[role="dialog"]')).toBeNull()
    })
  },
}

/** A title long enough to wrap beside its caps. */
export const Overlong: Story = {
  name: 'A title too long for its row',
  args: {
    commands: COMMANDS.map((one) =>
      one.id === 'node-list'
        ? {
            ...one,
            title:
              'Toggle the investigation graph entity list, which names every node the canvas is drawing and the ones it has hidden',
          }
        : one,
    ),
  },
}
