import type { Meta, StoryObj } from '@storybook/react-vite'

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
 * Nothing matched.
 *
 * **A sentence, not an empty list.** A box that draws nothing after a query
 * reads as one that has not answered yet.
 */
export const NothingMatched: Story = { args: { groups: [] } }
