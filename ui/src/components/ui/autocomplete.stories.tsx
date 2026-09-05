import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'

import { Autocomplete } from './autocomplete'
import { ListBox, ListBoxItem } from './list-box'
import { SearchField } from './search-field'

/**
 * A field and a list that share one keyboard.
 */
const meta = {
  title: 'Components/Autocomplete',
  component: Autocomplete,
  parameters: { layout: 'centered' },
  // `children` is required on the component and every story renders its own
  // pair, so the meta carries an empty one rather than each story restating it.
  args: { children: null },
} satisfies Meta<typeof Autocomplete>

export default meta
type Story = StoryObj<typeof meta>

const ROWS = ['Timeline', 'Entities', 'Evidence', 'Impact', 'Actions']

/**
 * The pair as a caller assembles it. Type, then arrow: the caret does not move.
 */
export const Typed: Story = {
  render: () => (
    <div className="w-80">
      <Autocomplete>
        <SearchField aria-label="Jump to a section" placeholder="Jump to a section" />
        <ListBox aria-label="Sections" selectionMode="single" className="mt-2">
          {ROWS.map((row) => (
            <ListBoxItem key={row} id={row}>
              {row}
            </ListBoxItem>
          ))}
        </ListBox>
      </Autocomplete>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const field = canvas.getByRole('searchbox')
    await userEvent.click(field)
    await userEvent.keyboard('{ArrowDown}')

    // **The caret stayed put and the list moved.** That pair is the whole
    // contract: an assertion on either alone passes with the other broken.
    await expect(field).toHaveFocus()
    await expect(field).toHaveAttribute('aria-activedescendant')
  },
}
