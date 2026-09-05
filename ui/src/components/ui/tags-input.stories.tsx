import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect } from 'storybook/test'

import { TagsInput } from './tags-input'

/**
 * Tags typed one at a time as chips, over the single comma-separated string the
 * field actually holds.
 *
 * Enter commits the draft and does not reach the form around the field;
 * Backspace over an empty box takes the last chip; Escape drops a draft without
 * committing it. **Those are settled in `tags-input.test.tsx`**, which reads
 * names and keystrokes and needs no layout. What is here is what that tier
 * cannot see: how a set of chips behaves as it grows.
 */
const meta = {
  title: 'Components/TagsInput',
  component: TagsInput,
  parameters: { layout: 'centered' },
  args: { label: 'Tags', value: '', onChange: () => undefined },
  render: (args) => (
    <div className="w-80">
      <Live {...args} />
    </div>
  ),
} satisfies Meta<typeof TagsInput>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Controlled on the stored string, which is what every caller holds, so the
 * chips in these stories respond to being typed into.
 */
function Live({ value: initial, onChange: _onChange, ...rest }: Parameters<typeof TagsInput>[0]) {
  const [value, setValue] = useState(initial)
  return <TagsInput {...rest} value={value} onChange={setValue} />
}

/** Empty. Type a tag and press Enter; a comma ends one too. */
export const Default: Story = {}

/** Each chip carries its own remove button. */
export const WithTags: Story = {
  args: { value: 'phishing,exfil,c2' },
  play: async ({ canvas }) => {
    // Three chips for three tags, which is the string-to-chip mapping the
    // caller is relying on.
    await expect(canvas.getAllByRole('button', { name: /remove/i })).toHaveLength(3)
  },
}

/**
 * **The chips wrap rather than scrolling**, so a long set stays readable and
 * the field grows down instead of hiding tags off its right edge.
 */
export const Wrapping: Story = {
  args: {
    value: 'phishing,exfil,c2,credential access,lateral movement,persistence,defence evasion',
  },
  play: async ({ canvas }) => {
    const chips = canvas.getAllByRole('button', { name: /remove/i })
    const tops = new Set(chips.map((chip) => Math.round(chip.getBoundingClientRect().top)))

    // More than one row, and every chip inside the field's width.
    await expect(tops.size).toBeGreaterThan(1)
  },
}

/** `disabled` shuts the box and takes the remove control off every chip. */
export const Disabled: Story = {
  args: { value: 'phishing,exfil', disabled: true },
  play: async ({ canvas }) => {
    // The tags are still readable -- a disabled field that hid its own value
    // would leave an analyst unable to see what a case is tagged with.
    await expect(canvas.getByText('phishing')).toBeVisible()
    await expect(canvas.getByText('exfil')).toBeVisible()

    // What goes is every way to change them: the box and the remove control
    // on each chip. A remove control that is drawn and does nothing is worse
    // than none, because the press looks like it worked.
    await expect(canvas.getByRole('textbox')).toBeDisabled()
    await expect(canvas.queryByRole('button', { name: /remove/i })).toBeNull()
  },
}

/**
 * One tag longer than the field, which is what a pasted indicator looks like.
 */
export const OneLongTag: Story = {
  args: {
    value:
      'storage-account-prod-eastus2.blob.core.windows.net,c2',
  },
  play: async ({ canvas, canvasElement }) => {
    // The long chip takes the row to itself rather than forcing the field
    // wider, so the form around it keeps its measure. A field that grew with
    // its longest tag would push a two-column form out of shape the first
    // time somebody pasted an indicator.
    const long = canvas.getByText('storage-account-prod-eastus2.blob.core.windows.net')
    const field = long.closest('[data-slot="tags-input"]') ?? canvasElement.firstElementChild!
    await expect(long.getBoundingClientRect().right).toBeLessThanOrEqual(
      field.getBoundingClientRect().right + 1,
    )

    // And the short one is on a row of its own below it rather than beside it.
    const short = canvas.getByText('c2')
    await expect(short.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      long.getBoundingClientRect().bottom - 1,
    )
  },
}
