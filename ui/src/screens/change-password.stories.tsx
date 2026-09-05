import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent } from 'storybook/test'

import { ChangePasswordScreen } from './change-password'

/**
 * The hold an account sits in until it picks its own password.
 *
 * Two things share the frame here that do not share it anywhere else: a
 * standing reason and a refusal. The reason is why the screen is up; the
 * refusal is why the last submit did not clear it.
 */
const meta = {
  title: 'Screens/Auth/Change password',
  component: ChangePasswordScreen,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ChangePasswordScreen>

export default meta
type Story = StoryObj<typeof meta>

/** The forced change, as an analyst arrives on it. */
export const Forced: Story = {
  name: 'A password change forced',
  play: async ({ canvas, step }) => {
    await step('the standing reason says why the screen is up', async () => {
      await expect(canvas.getByText('Your password was set by someone else')).toBeVisible()
      await expect(canvas.getByText('No case is reachable until you set your own.')).toBeVisible()
    })
    await step('and nothing is refused, because nothing has been submitted', async () => {
      // The reason is a warning; a refusal would say the analyst had already
      // done something wrong on a screen they have only just arrived at.
      await expect(canvas.queryByText(/is not right|cannot be used/)).toBeNull()
    })
  },
}

/**
 * The same screen reached from the account pane, where nothing is forcing it.
 *
 * Only the standing reason goes; the three fields are the same three, because
 * one function replaces a credential either way.
 */
export const SelfService: Story = {
  name: 'Changing it because you want to',
  args: { forced: false },
  play: async ({ canvas, step }) => {
    await step('the standing reason is gone', async () => {
      await expect(canvas.queryByText('Your password was set by someone else')).toBeNull()
    })
    await step('and the three fields are the same three', async () => {
      // One function replaces a credential either way, so only the reason
      // differs between this and the forced flow.
      await expect(canvas.getByLabelText('Current password')).toBeVisible()
      await expect(canvas.getByLabelText('New password')).toBeVisible()
      await expect(canvas.getByLabelText('Repeat new password')).toBeVisible()
    })
  },
}

/** The current password wrong, which the server names rather than the screen. */
export const Refused: Story = {
  name: 'A change refused',
  args: { refusal: 'The current password is not right.' },
  play: async ({ canvas, step }) => {
    await step('the refusal and the reason are both drawn, and are different things', async () => {
      // The reason is why the screen is up; the refusal is why the last submit
      // did not clear it. This is the only screen where both stand at once.
      await expect(canvas.getByText('The current password is not right.')).toBeVisible()
      await expect(canvas.getByText('Your password was set by someone else')).toBeVisible()
    })
  },
}

/** The submit in flight. */
export const Busy: Story = {
  name: 'Changing the password',
  args: { busy: true },
  play: async ({ canvas, step }) => {
    await step('the submit keeps a name while pending and says it is unavailable', async () => {
      // Named, not searched: a `find` that matched nothing would leave this
      // passing on an absent button.
      const submit = canvas.getByRole('button', { name: /Changing password/ })
      await expect(submit).toHaveAttribute('aria-disabled', 'true')
    })
  },
}

/**
 * The repeat not matching, which the screen refuses itself.
 *
 * **A mismatch never reaches the server.** Sending it would spend a round trip
 * to be told what the screen already knows, and the answer would come back as
 * a refusal of the whole change rather than of the field that is wrong.
 */
export const RepeatDoesNotMatch: Story = {
  name: 'The repeat does not match',
  args: { onSubmit: fn() },
  play: async ({ args, canvas, step }) => {
    await step('a new password typed twice, differently', async () => {
      await userEvent.type(canvas.getByLabelText('Current password'), 'old-one')
      await userEvent.type(canvas.getByLabelText('New password'), 'a-long-new-password')
      await userEvent.type(canvas.getByLabelText('Repeat new password'), 'a-long-new-passwerd')
    })
    await step('is not sent', async () => {
      await userEvent.click(canvas.getByRole('button', { name: 'Change password' }))
      await expect(args.onSubmit).not.toHaveBeenCalled()
    })
  },
}

/**
 * Below 1024px the atmosphere pane is gone, and the alert plus three fields is
 * the whole viewport.
 */
export const Narrow: Story = {
  name: 'A narrow viewport',
  globals: { viewport: { value: 'mobile2' } },
}

/** A refusal long enough to wrap under the standing reason. */
export const Overlong: Story = {
  name: 'A refusal too long for one line',
  args: {
    refusal:
      'The new password is one of the ten thousand most common passwords in the breach corpus this install checks against, and cannot be used here.',
  },
}
