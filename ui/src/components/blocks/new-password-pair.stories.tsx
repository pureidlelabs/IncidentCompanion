import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent } from 'storybook/test'

import { NewPasswordPair, type NewPasswordPairProps } from './new-password-pair'

/**
 * Two `PasswordField`s asking for the same secret twice.
 *
 * First run and the forced password change each wrote this pair out with an
 * identical `isInvalid` and an identical `errorMessage`, differing only in
 * their labels and whether a floor is stated underneath.
 */

/** The pair holding its own state, the way each screen holds it. */
function Wired(props: Omit<NewPasswordPairProps, 'secret' | 'onSecretChange' | 'repeat' | 'onRepeatChange'>) {
  const [secret, setSecret] = useState('')
  const [repeat, setRepeat] = useState('')
  return (
    <NewPasswordPair
      {...props}
      secret={secret}
      onSecretChange={setSecret}
      repeat={repeat}
      onRepeatChange={setRepeat}
    />
  )
}

/** The two password fields first run and a forced change both ask through, checked against each other. */
const meta = {
  title: 'Blocks/Form/New password pair',
  component: Wired,
} satisfies Meta<typeof Wired>

export default meta
type Story = StoryObj<typeof meta>

/** First run's labels, with no floor stated. */
export const Bare: Story = {
  name: 'No stated floor',
  args: { newLabel: 'Password', repeatLabel: 'Repeat password' },
  play: async ({ canvas, step }) => {
    await step('a blank repeat is not marked wrong', async () => {
      // With a password typed and the repeat still empty the two do differ,
      // and this is the moment the check has to hold its tongue: the analyst
      // is on their way to the second box, not wrong yet.
      await userEvent.type(canvas.getByLabelText('Password'), 'correct-horse')
      await expect(canvas.queryByText('The passwords do not match')).toBeNull()
    })

    await step('and neither is a repeat that agrees', async () => {
      await userEvent.type(canvas.getByLabelText('Repeat password'), 'correct-horse')
      await expect(canvas.queryByText('The passwords do not match')).toBeNull()
    })

    await step('one that disagrees is', async () => {
      await userEvent.type(canvas.getByLabelText('Repeat password'), 'x')
      await expect(await canvas.findByText('The passwords do not match')).toBeVisible()
    })
  },
}

/** First run's own shape: a floor stated under the repeat box. */
export const WithFloor: Story = {
  name: 'A stated floor',
  args: {
    newLabel: 'Password',
    repeatLabel: 'Repeat password',
    repeatDescription: 'At least 12 characters.',
  },
  play: async ({ canvas }) => {
    // The floor is a server constant that never reaches the client, so a
    // screen that does not state it leaves the analyst to find the number by
    // being refused.
    await expect(canvas.getByText('At least 12 characters.')).toBeVisible()
  },
}

/** The forced password change's labels. */
export const ChangeLabels: Story = {
  name: 'The change-password labels',
  args: { newLabel: 'New password', repeatLabel: 'Repeat new password' },
  play: async ({ canvas }) => {
    // The labels are the whole difference between the two screens that ask
    // through this pair. A pair that hard-coded them would put "Password" in
    // front of somebody who already has one.
    await expect(canvas.getByLabelText('New password')).toBeVisible()
    await expect(canvas.getByLabelText('Repeat new password')).toBeVisible()
    await expect(canvas.queryByLabelText('Password')).toBeNull()
  },
}
