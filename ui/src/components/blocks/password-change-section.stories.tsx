import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent } from 'storybook/test'

import { PasswordChangeSection } from '@/components/blocks/password-change-section'

/**
 * Replace your own password: a settings section carrying its own three
 * fields, since a value in one only means anything once all three agree.
 */
const meta = {
  title: 'Blocks/Form/Password change section',
  component: PasswordChangeSection,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof PasswordChangeSection>

export default meta
type Story = StoryObj<typeof meta>

/** Nothing typed yet, and the submit button waits for all three fields. */
export const Fresh: Story = {
  name: 'Nothing typed yet',
  play: async ({ canvas, step }) => {
    const submit = canvas.getByRole('button', { name: /Change password/ })

    await step('the submit waits for all three fields', async () => {
      // A value in one field means nothing until all three agree, so this is
      // one of the few controls that is refused before anything is sent.
      await expect(submit).toBeDisabled()
      await userEvent.type(canvas.getByLabelText('Current password'), 'old-one')
      await expect(submit).toBeDisabled()
      await userEvent.type(canvas.getByLabelText('New password'), 'correct-horse')
      await expect(submit).toBeDisabled()
    })

    await step('and takes them once they agree', async () => {
      await userEvent.type(canvas.getByLabelText('Repeat the new password'), 'correct-horse')
      await expect(submit).toBeEnabled()
    })
  },
}

/**
 * The password refused, in the server's own words.
 */
export const Refused: Story = {
  name: 'A password change refused',
  args: {
    refusal: 'A password on this install is at least 14 characters.',
  },
  play: async ({ canvas }) => {
    // The shortest password is a server constant that never reaches the
    // client, so this message is the only place the number is ever stated.
    await expect(
      canvas.getByText('A password on this install is at least 14 characters.'),
    ).toBeVisible()
    await expect(canvas.getByText('The password was not changed')).toBeVisible()
  },
}

/** The change went through, and the other sessions are still running. */
export const Changed: Story = {
  name: 'A password just changed',
  args: { changed: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Your password is replaced')).toBeVisible()

    // What happened to the other sessions is the question a changed password
    // raises, and the one thing the screen cannot leave the analyst to guess.
    await expect(canvas.getByText('Your other sessions keep running.')).toBeVisible()
  },
}
