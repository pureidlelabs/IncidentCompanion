import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent } from 'storybook/test'

import { PaletteResults } from './palette-results'

/**
 * The omnibox's rows: grouped hits, each with a chord or a hint chip at its end.
 *
 * **The list, never the field.** Whatever owns the query owns the box it is
 * typed into -- the case omnibox in the header, and anything else that grows
 * one later -- so this draws what a query found and nothing that produces it.
 *
 * A `ListBox` rather than a `Menu`: the rows are a selection the arrow keys
 * walk while the caret stays in the field beside it, and a menu item is a `div`
 * whose press never fires from the keyboard. `Autocomplete` is what joins the
 * two.
 */
const meta = {
  title: 'Blocks/App shell/Palette results',
  component: PaletteResults,
  parameters: { layout: 'padded' },
  args: { emptyLabel: 'Nothing in this case matches.', groups: [] },
} satisfies Meta<typeof PaletteResults>

export default meta
type Story = StoryObj<typeof meta>

/** Commands carry their chord; a hit carries the section it was found in. */
export const Grouped: Story = {
  args: {
    groups: [
      {
        label: 'Commands',
        items: [
          { id: 'command:new-entry', label: 'New timeline entry', chord: [{ key: 'n' }] },
          { id: 'command:palette', label: 'Open the command palette', chord: [{ key: 'k', mod: true }] },
        ],
      },
      {
        label: 'Sections',
        items: [
          { id: 'section:timeline', label: 'Timeline' },
          { id: 'section:entities', label: 'Entities' },
        ],
      },
      {
        label: 'In this case',
        items: [
          { id: 'row:entities:1', label: 'WKS-FIN01', hint: 'Assets' },
          { id: 'row:evidence:2', label: 'proxy.log', hint: 'Evidence' },
        ],
      },
    ],
  },
}

/**
 * An arrow key moves onto a row, and Enter runs that row.
 *
 * jsdom cannot see it: which element React Aria gives the keyboard, and what
 * a press does once it is there, are facts about a browser. -> #963
 */
export const KeyboardRunsARow: Story = {
  args: { ...Grouped.args, onAction: fn() },
  play: async ({ args, canvas, step }) => {
    await step('the arrow keys walk the rows', async () => {
      const rows = await canvas.findAllByRole('option')
      await expect(rows.length, 'no rows to walk').toBeGreaterThan(1)

      rows[0]?.focus()
      await userEvent.keyboard('{ArrowDown}')

      await expect(
        canvas.getByRole('option', { name: /Open the command palette/ }),
        'the arrow key did not move the focus onto the second row',
      ).toHaveFocus()
    })

    await step('Enter runs the row the keyboard is on', async () => {
      await userEvent.keyboard('{Enter}')

      // The id, not merely that something fired: a list reporting the first
      // row whatever is focused is the failure this cannot afford.
      await expect(args.onAction).toHaveBeenCalledWith('command:palette')
    })
  },
}

/**
 * Nothing matched.
 *
 * **A sentence, not an empty list.** A box that draws nothing after a query
 * reads as one that has not answered yet.
 */
export const NothingMatched: Story = { args: { groups: [] } }
