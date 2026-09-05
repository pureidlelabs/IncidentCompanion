import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

import { AuthNotice } from './auth-notice'

/**
 * The banner an unauthenticated screen draws above its form.
 */
const meta = {
  title: 'Blocks/Auth/Notice',
  component: AuthNotice,
} satisfies Meta<typeof AuthNotice>

export default meta
type Story = StoryObj<typeof meta>

/** A refused sign-in, in the server's own words. */
export const Refusal: Story = {
  name: "A refusal, with the server's own words under it",
  args: {
    variant: 'destructive',
    title: 'That sign-in was refused',
    description: 'That username and password do not match an account on this install.',
  },
  play: async ({ canvas }) => {
    // The title says what happened and the line under it is the server's own
    // account of why. A screen that dropped the second line would refuse
    // without ever saying which of the two was wrong.
    await expect(canvas.getByText('That sign-in was refused')).toBeVisible()
    await expect(
      canvas.getByText('That username and password do not match an account on this install.'),
    ).toBeVisible()
  },
}

/** The forced password change's refused attempt: the whole sentence is the title. */
export const TitleOnly: Story = {
  name: 'A refusal with nothing to add under it',
  args: {
    variant: 'destructive',
    title: 'Choose a password you have not used here.',
  },
  play: async ({ canvas }) => {
    // The whole sentence is the title, and nothing is drawn under it. A
    // description rendered empty leaves a gap that reads as a second line
    // which failed to arrive.
    await expect(canvas.getByText('Choose a password you have not used here.')).toBeVisible()
    await expect(canvas.getByRole('alert').textContent).toBe(
      'Choose a password you have not used here.',
    )
  },
}

/** A standing reason to act, not a refusal. */
export const Warning: Story = {
  name: 'A standing reason, not a refusal',
  args: {
    variant: 'warning',
    title: 'Your password was set by someone else',
    description: 'No case is reachable until you set your own.',
  },
}
