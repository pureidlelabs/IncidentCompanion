import type { Meta, StoryObj } from '@storybook/react-vite'

import { PaletteResults } from './palette-results'

/**
 * The omnibox's rows: grouped hits, each with a chord or a hint chip at its end.
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
 */
export const NothingMatched: Story = { args: { groups: [] } }
