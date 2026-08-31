import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

import { FirstRunScreen } from './first-run'

/**
 * The claim screen, and the tallest form the auth frame carries.
 *
 * Four fields and two hints against the sign-in's two fields, so this is what
 * decides whether the masthead still fits above the form.
 */
const meta = {
  title: 'Screens/System/First run',
  component: FirstRunScreen,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof FirstRunScreen>

export default meta
type Story = StoryObj<typeof meta>

/** An unclaimed install, nothing typed. */
export const Empty: Story = {
  name: 'An unclaimed install',
  play: async ({ canvas, step }) => {
    await step('the token is asked for alongside the account', async () => {
      await expect(canvas.getByLabelText('Setup token')).toBeVisible()
      await expect(canvas.getByLabelText('Username')).toBeVisible()
    })
    await step('and nothing is refused before anything is typed', async () => {
      await expect(canvas.queryByText(/is not the one this install printed/)).toBeNull()
    })
  },
}

/** The token pasted from the console, the rest still to fill. */
export const Populated: Story = {
  name: 'A token pasted in',
  args: { token: '4f1c-9ae2-77b0-d3e6' },
}

/**
 * The token refused.
 *
 * The server judges it before it judges a password, so a caller who cannot
 * prove they reach the volume is never told their password is too short.
 */
export const Refused: Story = {
  name: 'A setup token refused',
  args: {
    token: '4f1c-9ae2-77b0-d3e6',
    refusal: 'That setup token is not the one this install printed.',
  },
  play: async ({ canvas, step }) => {
    await step('the refusal is about the token and nothing else', async () => {
      // The server judges the token first, so somebody who cannot prove they
      // reach the volume is never told anything about the password they chose.
      await expect(
        canvas.getByText('That setup token is not the one this install printed.'),
      ).toBeVisible()
      await expect(canvas.queryByText(/too short|too weak|too common/i)).toBeNull()
    })
    await step('and the token typed is kept, so it can be compared rather than retyped', async () => {
      await expect(canvas.getByLabelText('Setup token')).toHaveValue('4f1c-9ae2-77b0-d3e6')
    })
  },
}

/** The claim in flight. */
export const Busy: Story = {
  name: 'Creating the first account',
  args: { token: '4f1c-9ae2-77b0-d3e6', busy: true },
  play: async ({ canvas, step }) => {
    await step('the submit keeps a name while pending', async () => {
      await expect(canvas.getByRole('button', { name: /Creating account/ })).toBeInTheDocument()
    })
    await step('and cannot claim the install twice', async () => {
      await expect(canvas.getByRole('button', { name: /Creating account/ })).toHaveAttribute(
        'aria-disabled',
        'true',
      )
    })
  },
}

/** Below 1024px the atmosphere pane is gone and the four fields are alone. */
export const Narrow: Story = {
  name: 'A narrow viewport',
  globals: { viewport: { value: 'mobile2' } },
}

/** A refusal long enough to wrap to three lines above the form. */
export const Overlong: Story = {
  name: 'A refusal too long for one line',
  args: {
    token: 'this-is-not-the-token-that-was-printed-to-the-console-at-startup',
    refusal:
      'That setup token is not the one this install printed. The token is written to the console the first time the server starts and is stored in the app folder until it is used.',
  },
}
