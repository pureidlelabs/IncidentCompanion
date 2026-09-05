import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'

import { ArchivePassphraseFields } from '@/components/blocks/archive-passphrase-fields'

/**
 * The archive export's passphrase and its confirm.
 */
const meta = {
  title: 'Blocks/Form/Archive passphrase fields',
  component: ArchivePassphraseFields,
  parameters: { layout: 'padded' },
  args: {
    secret: '',
    repeat: '',
    mismatch: false,
    onSecret: fn(),
    onRepeat: fn(),
  },
} satisfies Meta<typeof ArchivePassphraseFields>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Empty, which is a legitimate answer rather than an unfilled form: leaving
 * both blank exports the archive unencrypted, and the first box says so.
 */
export const Empty: Story = {
  name: 'Both fields empty',
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Leave blank to export unencrypted.')).toBeVisible()
    await expect(canvas.queryByText('The passphrases do not match')).not.toBeInTheDocument()
  },
}

/**
 * A confirm that disagrees marks the second box rather than the first.
 */
export const Mismatched: Story = {
  name: 'A confirm that does not match',
  args: { secret: 'correct horse', repeat: 'battery staple', mismatch: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('The passphrases do not match')).toBeVisible()
    await expect(canvas.getByLabelText('Confirm passphrase', { selector: 'input' })).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    await expect(canvas.getByLabelText('Passphrase', { selector: 'input' })).not.toHaveAttribute('aria-invalid', 'true')
  },
}

/**
 * Both filled and agreeing, which is the state the export runs from.
 */
export const Matching: Story = {
  name: 'Both fields agree',
  args: { secret: 'correct horse battery staple', repeat: 'correct horse battery staple' },
  play: async ({ canvas }) => {
    await expect(canvas.queryByText('The passphrases do not match')).not.toBeInTheDocument()

    for (const name of ['Passphrase', 'Confirm passphrase']) {
      const box = canvas.getByLabelText(name, { selector: 'input' })
      await expect(box).toHaveAttribute('type', 'password')
      await expect(box).toHaveAttribute('autocomplete', 'new-password')
    }
  },
}

/**
 * Typing reports upward rather than being held here.
 */
export const Typing: Story = {
  name: 'Typing reports to the caller',
  play: async ({ canvas, args, userEvent }) => {
    await userEvent.type(canvas.getByLabelText('Passphrase', { selector: 'input' }), 'a')
    await expect(args.onSecret).toHaveBeenCalledWith('a')

    await userEvent.type(canvas.getByLabelText('Confirm passphrase', { selector: 'input' }), 'b')
    await expect(args.onRepeat).toHaveBeenCalledWith('b')
  },
}
