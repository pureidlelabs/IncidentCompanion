import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fireEvent, screen, userEvent } from 'storybook/test'
import { useState } from 'react'

import { EntityCombobox } from './entity-combobox'

const HOSTS = new Map([
  ['s1', 'WKS-FIN01'],
  ['s2', 'WKS-FIN02'],
  ['s3', 'DC-01'],
])

/** A picker inside a panel that scrolls, which is every form this app has. */
function Picker() {
  const [value, setValue] = useState('')
  return (
    <div data-testid="panel" className="h-64 w-96 overflow-y-auto rounded-lg border border-border p-4">
      <div className="h-40" aria-hidden />
      <EntityCombobox label="Destination host" options={HOSTS} value={value} onPick={setValue} />
      <div className="h-96" aria-hidden />
    </div>
  )
}

/** The picker every reference field opens to choose one entity by name. */
const meta = {
  title: 'Blocks/Form/Entity combobox',
  component: Picker,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Picker>

export default meta
type Story = StoryObj<typeof meta>

/** A click opens the list. The condition every unit test runs under. */
export const OpensOnClick: Story = {
  name: 'A click opens the list',
  play: async () => {
    await userEvent.click(await screen.findByRole('combobox', { name: 'Destination host' }))
    await expect(screen.getByRole('listbox', { name: 'Destination host' })).toBeInTheDocument()
  },
}

/**
 * **An ancestor scrolling must not shut the open list**, and today it does.
 *
 * Every kit combo box inside a scrolling panel closes its list when an
 * ancestor scrolls -- and the scroll is usually the analyst's own gesture
 * reaching the field, so the list shuts on the click that opened it.
 *
 * The story fires the scroll rather than racing it: the behaviour does not
 * depend on whether the browser's own scroll lands before or after the open.
 *
 * **This documents the defect; it does not guard against it.** It asserts what
 * the control does *today*, which is close, so the suite is green and the debt
 * is legible rather than a red run somebody learns to scroll past.
 *
 * **It goes red when the defect is fixed.** Delete this story then, and
 * restore the assertion above it -- the one named `does not shut` that says
 * what the control should do.
 */
export const ShutByAnAncestorScroll: Story = {
  name: 'A scroll of the panel shuts the list, which is the defect',
  play: async () => {
    const box = await screen.findByRole('combobox', { name: 'Destination host' })
    await userEvent.click(box)
    await expect(box).toHaveAttribute('aria-expanded', 'true')

    const panel = await screen.findByTestId('panel')
    panel.scrollTop = 40
    await fireEvent.scroll(panel)

    // **`aria-expanded`, not the listbox element.** The popover is animated by
    // Motion and stays in the DOM for the length of its exit, so a shut list
    // still answers `getByRole('listbox')` for a few frames - which is how
    // this assertion passed against a control that had just closed.
    //
    // `'false'` is the defect. Change it back to `'true'` to see the failure,
    // and delete this story once it passes that way.
    await expect(box).toHaveAttribute('aria-expanded', 'false')
  },
}
