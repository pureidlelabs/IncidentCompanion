import type { Meta, StoryObj } from '@storybook/react-vite'

import { expect, fn } from 'storybook/test'

import { ENTRA } from '@/components/blocks/sso-sign-in'

import { SignInScreen } from './sign-in'

/**
 * The screen an analyst meets every morning.
 *
 * Full screen rather than padded: the layout is `min-h-screen` and a padded
 * canvas reports the wrong split between the atmosphere pane and the form.
 */
const meta = {
  title: 'Screens/Auth/Sign in',
  component: SignInScreen,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof SignInScreen>

export default meta
type Story = StoryObj<typeof meta>

/** Nothing typed, nothing refused. */
export const Empty: Story = {
  name: 'Waiting for a credential',
  play: async ({ canvas, step }) => {
    await step('both credentials are asked for', async () => {
      await expect(canvas.getByLabelText('Email')).toBeVisible()
      await expect(canvas.getByLabelText('Password')).toBeVisible()
    })
    await step('and nothing is refused before anything is typed', async () => {
      await expect(canvas.queryByText('That sign-in was refused')).toBeNull()
    })
  },
}

/** An install that accepts a directory as well as a password. */
export const WithSso: Story = {
  name: 'With a directory to sign in through',
  args: { providers: [{ ...ENTRA, onChoose: fn() }] },
}

/** The install with no local passwords: the providers are the whole door. */
export const SsoOnly: Story = {
  name: 'Only through the directory',
  args: { providers: [{ ...ENTRA, onChoose: fn() }], soleMeans: true },
  play: async ({ canvas, step }) => {
    await step('the directory is offered', async () => {
      await expect(canvas.getByRole('button', { name: /Microsoft Entra|Entra/i })).toBeVisible()
    })
    await step('and there is no password box to type into', async () => {
      // An install that turned local passwords off must not still accept one:
      // a form left behind the rule is a door on the far side of a divider.
      await expect(canvas.queryByLabelText('Password')).toBeNull()
      await expect(canvas.queryByRole('button', { name: 'Sign in' })).toBeNull()
    })
  },
}

/** An address remembered by the browser, and the password still to type. */
export const Populated: Story = {
  name: 'An address already filled',
  args: { email: 'r.okonkwo@meridian-logistics.example' },
}

/**
 * A refused sign-in, in the server's own words.
 *
 * One answer covers unknown, wrong, disabled and locked out, so the screen
 * cannot be used to find out who works here - which is why the alert sits over
 * the form rather than under the password.
 */
export const Refused: Story = {
  name: 'A sign-in refused',
  args: {
    email: 'r.okonkwo@meridian-logistics.example',
    refusal: 'That username and password do not match an account on this install.',
  },
  play: async ({ canvas, step }) => {
    await step('the refusal names neither field', async () => {
      // The whole point: one answer covers unknown, wrong, disabled and locked
      // out. A refusal attached to the email would answer *does this address
      // exist*, which is the question this screen must not answer.
      await expect(
        canvas.getByText('That username and password do not match an account on this install.'),
      ).toBeVisible()
      await expect(canvas.getByLabelText('Email')).not.toHaveAttribute('aria-invalid', 'true')
      await expect(canvas.getByLabelText('Password')).not.toHaveAttribute(
        'aria-invalid',
        'true',
      )
    })
    await step('and what was typed is kept, so it need not be typed again', async () => {
      await expect(canvas.getByLabelText('Email')).toHaveValue(
        'r.okonkwo@meridian-logistics.example',
      )
    })
  },
}

/** The submit in flight: the label is swapped and the control keeps its width. */
export const Busy: Story = {
  name: 'Signing in',
  args: { email: 'r.okonkwo@meridian-logistics.example', busy: true },
  play: async ({ canvas, step }) => {
    await step('the submit still has a name while it is pending', async () => {
      // A pending control that loses its accessible name is announced as
      // "button", with nothing saying which control it is.
      await expect(canvas.getByRole('button', { name: /Signing in/ })).toBeInTheDocument()
    })
    await step('and is marked unavailable rather than merely styled', async () => {
      // React Aria leaves a pending control focusable and writes no `disabled`
      // attribute -- it says so with `aria-disabled`, which is the trap
      // `ui-design` records about keying variants on `disabled:`.
      await expect(canvas.getByRole('button', { name: /Signing in/ })).toHaveAttribute(
        'aria-disabled',
        'true',
      )
    })
  },
}

/** Below 1024px the atmosphere pane is not drawn and the form fills the viewport. */
export const Narrow: Story = {
  name: 'A narrow viewport',
  globals: { viewport: { value: 'mobile2' } },
}

/** A service address past the field's measure. It wraps inside the pane. */
export const Overlong: Story = {
  name: 'An address too long for its field',
  args: {
    email: 'soc-duty-analyst-rotation-weekend@meridian-logistics-group.example.internal',
    refusal:
      'That username and password do not match an account on this install. Three more attempts before this account is locked for 30 minutes.',
  },
}
