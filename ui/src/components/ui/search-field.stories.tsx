import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, waitFor } from 'storybook/test'

import { SearchField } from './search-field'

/**
 * A text field for a filter, with a clear button that appears once there is a
 * value to clear.
 *
 * **It clears itself.** The button is part of the field rather than something a
 * caller adds, so a screen holding one owns the query and not the control that
 * empties it. Escape clears it from the keyboard.
 *
 * Reach for this wherever a value narrows a list rather than being submitted as
 * data. The narrowing is the screen's own: this reports the query and nothing
 * else, so a screen ORs it with whatever filters it holds and clears both.
 */
const meta = {
  title: 'Components/SearchField',
  component: SearchField,
  parameters: { layout: 'centered' },
  args: { label: 'Search entities', placeholder: 'Host, account, hash', size: 'md' },
  render: (args) => <SearchField {...args} />,
} satisfies Meta<typeof SearchField>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Empty, so no clear button is offered: a cross beside an empty field is an
 * action that does nothing.
 *
 * The button is rendered and hidden rather than removed, which keeps the box
 * from resizing as the first character lands. Hidden this way it leaves the
 * accessibility tree too, so it is not announced and not reachable -- which is
 * what the `play` asserts, and what a merely transparent button would fail.
 */
export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('button')).not.toBeInTheDocument()
  },
}

/**
 * With a value, so the clear button is there.
 *
 * The `play` walks the whole cycle: the button appears with the value, empties
 * the field, and goes with it.
 */
export const WithValue: Story = {
  args: { defaultValue: 'DESKTOP-4F2A' },
  play: async ({ canvas, step, userEvent }) => {
    const box = canvas.getByRole('searchbox', { name: 'Search entities' })

    await step('The button is offered because there is something to clear', async () => {
      await expect(canvas.getByRole('button')).toBeInTheDocument()
    })

    await step('Pressing it empties the field', async () => {
      await userEvent.click(canvas.getByRole('button'))
      await expect(box).toHaveValue('')
    })

    await step('And the button goes with the value', async () => {
      await waitFor(() => {
        void expect(canvas.queryByRole('button')).not.toBeInTheDocument()
      })
    })
  },
}

/**
 * Escape clears the field from the keyboard, so an analyst filtering a list
 * never has to reach for the cross.
 */
export const EscapeClears: Story = {
  args: { defaultValue: 'DESKTOP-4F2A' },
  play: async ({ canvas, userEvent }) => {
    const box = canvas.getByRole('searchbox', { name: 'Search entities' })
    box.focus()
    await userEvent.keyboard('{Escape}')
    await expect(box).toHaveValue('')
  },
}

/** One line under the box, announced with the field. */
export const WithDescription: Story = {
  args: {
    defaultValue: 'DESKTOP-4F2A',
    description: 'Matches names and identifiers in this case only.',
  },
  play: async ({ canvas, canvasElement }) => {
    const describedBy = canvas
      .getByRole('searchbox', { name: 'Search entities' })
      .getAttribute('aria-describedby')
    await expect(
      canvasElement.querySelector('#' + CSS.escape(describedBy ?? '')),
    ).toHaveTextContent('Matches names and identifiers in this case only.')
  },
}

/** The size ladder: 28, 32 and 40px. */
export const Sizes: Story = {
  render: ({ label: _label, size: _size, ...args }) => (
    <div className="flex flex-col gap-4">
      <SearchField {...args} label="Small" size="sm" defaultValue="Small" />
      <SearchField {...args} label="Medium" size="md" defaultValue="Medium" />
      <SearchField {...args} label="Large" size="lg" defaultValue="Large" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    // **The group carries the height, not the input.** The `input` inside is
    // the same box at every size and only the field group grows, so measuring
    // the searchbox compares three identical numbers and passes whatever the
    // size does.
    const heights = [...canvasElement.querySelectorAll('[data-slot="field-group"]')].map(
      (group) => group.getBoundingClientRect().height,
    )
    await expect(heights).toHaveLength(3)
    for (let index = 1; index < heights.length; index += 1) {
      await expect(heights[index]!).toBeGreaterThan(heights[index - 1]!)
    }
  },
}

/**
 * `isDisabled` greys the box and the clear button with it.
 *
 * A live cross beside a field that cannot be typed in is the version of this
 * that gets reported: the analyst presses it, the value goes, and the field
 * they could not edit is now empty.
 */
export const Disabled: Story = {
  args: { defaultValue: 'DESKTOP-4F2A', isDisabled: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('searchbox', { name: 'Search entities' })).toBeDisabled()
    const clear = canvas.queryByRole('button')
    if (clear !== null) await expect(clear).toBeDisabled()
  },
}

/** `isInvalid` plus `errorMessage`, bound to the box. */
export const Invalid: Story = {
  args: {
    defaultValue: '**',
    isInvalid: true,
    errorMessage: 'A query needs at least one letter or digit.',
  },
  play: async ({ canvas, canvasElement }) => {
    const box = canvas.getByRole('searchbox', { name: 'Search entities' })
    await expect(box).toHaveAttribute('aria-invalid', 'true')
    const describedBy = box.getAttribute('aria-describedby')
    await expect(
      canvasElement.querySelector('#' + CSS.escape(describedBy ?? '')),
    ).toHaveTextContent('A query needs at least one letter or digit.')
  },
}

/**
 * The longest query an analyst would paste, which is a full indicator rather
 * than a word.
 *
 * The box keeps its measure and the value scrolls inside it, so the clear
 * button stays where it was rather than being pushed out of the field.
 */
export const LongQuery: Story = {
  args: {
    defaultValue:
      'hxxps://storage-account-prod-eastus2.blob.core.windows.net/exfil/finance-master-export.7z',
  },
}
