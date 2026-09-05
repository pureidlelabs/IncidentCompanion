import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

import { Input, controlBase } from './input'

/**
 * A single-line text box that draws its own border, ground and height.
 */
const meta = {
  title: 'Components/Input',
  component: Input,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="w-72">
        <Story />
      </div>
    ),
  ],
  args: { 'aria-label': 'Case title', placeholder: 'Mailbox read in bulk' },
  render: (args) => <Input {...args} />,
} satisfies Meta<typeof Input>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The default, drawing its own box.
 */
export const Default: Story = {
  play: async ({ canvas }) => {
    const box = canvas.getByLabelText('Case title')
    await expect(parseFloat(getComputedStyle(box).borderTopWidth)).toBeGreaterThan(0)
  },
}

/**
 * Inside something that already draws a box, where the field must not add a
 * second one.
 */
export const InsideAnotherBox: Story = {
  args: {
    'aria-label': 'Ticket reference',
    className: 'border-0 bg-transparent',
    defaultValue: 'INC-4471',
  },
  render: (args) => (
    <div className="flex items-center gap-2 rounded-sm border border-input bg-background px-2">
      <span aria-hidden className="text-2xs text-ink-muted">
        INC
      </span>
      <Input {...args} />
    </div>
  ),
  play: async ({ canvas }) => {
    const box = canvas.getByLabelText('Ticket reference')
    await expect(parseFloat(getComputedStyle(box).borderTopWidth)).toBe(0)
  },
}

/**
 * Refused: the destructive border and a ring, because a 1px edge is not a
 * signal on its own.
 */
export const Refused: Story = {
  args: {
    'aria-label': 'Analyst email',
    className: controlBase,
    defaultValue: 'not-an-address',
    'aria-invalid': true,
  },
  play: async ({ canvas }) => {
    const box = canvas.getByLabelText('Analyst email')
    await expect(box).toHaveAttribute('aria-invalid', 'true')
    // The refusal is carried by more than the border colour: a ring as well, so
    // it survives being seen by somebody who cannot tell the two edges apart.
    await expect(getComputedStyle(box).boxShadow).not.toBe('none')
  },
}

/**
 * Disabled: faded, and the pointer is refused rather than merely ignored.
 */
export const Disabled: Story = {
  args: {
    'aria-label': 'Case title',
    className: controlBase,
    defaultValue: 'Read-only while the case is closed',
    disabled: true,
  },
  play: async ({ canvas }) => {
    const box = canvas.getByLabelText('Case title')
    await expect(box).toBeDisabled()
    await expect(getComputedStyle(box).cursor).not.toBe('text')
  },
}

/**
 * `type` carries through, so a credential still tells a password manager what
 * it holds.
 */
export const Types: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <Input
        aria-label="Email"
        type="email"
        className={controlBase}
        placeholder="analyst@example.org"
      />
      <Input
        aria-label="Source URL"
        type="url"
        className={controlBase}
        placeholder="https://example.org"
      />
      <Input aria-label="When" type="date" className={controlBase} />
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText('Email')).toHaveAttribute('type', 'email')
    await expect(canvas.getByLabelText('Source URL')).toHaveAttribute('type', 'url')
  },
}

/**
 * The longest value a box is likely to be given, and an empty one.
 */
export const Extremes: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <Input aria-label="Empty" className={controlBase} defaultValue="" />
      <Input
        aria-label="Long"
        className={controlBase}
        defaultValue="hxxps://storage-account-prod-eastus2.blob.core.windows.net/exfil/2026-08-29T04-12-55Z/finance-master-export.7z"
      />
    </div>
  ),
}
