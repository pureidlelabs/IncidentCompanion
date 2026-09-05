import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent } from 'storybook/test'

import { AuthForm } from './auth-form'
import { ENTRA, SsoSignIn, type SsoProvider } from './sso-sign-in'
import { PasswordField } from '@/components/ui/password-field'
import { TextField } from '@/components/ui/text-field'

/**
 * What an install accepts a sign-in from, above the password form.
 */
const meta = {
  title: 'Blocks/Auth/SSO sign in',
  component: SsoSignIn,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div className="w-[380px]">
        <Story />
      </div>
    ),
  ],
  args: { providers: [{ ...ENTRA, onChoose: fn() }] },
} satisfies Meta<typeof SsoSignIn>

export default meta
type Story = StoryObj<typeof meta>

/** One provider, which is the install this product is asked for. */
export const Entra: Story = {
  name: 'Entra ID, and the rule under it',
  play: async ({ args, canvas }) => {
    // The rule belongs to this block rather than to the screen, so the
    // providers and the password form below never arrive stacked with
    // nothing between them.
    await expect(canvas.getByText(/^or$/i)).toBeVisible()

    const button = canvas.getByRole('button', { name: /Entra/ })
    await expect(button).toBeEnabled()
    await userEvent.click(button)
    await expect(args.providers[0]!.onChoose).toHaveBeenCalledOnce()
  },
}

/** The whole door: the provider, the rule, and the form it is an alternative to. */
export const OverTheForm: Story = {
  name: 'Over the password form',
  render: (args) => (
    <div className="flex flex-col gap-4">
      <SsoSignIn {...args} />
      <AuthForm submit="Sign in" pending="Signing in" onSubmit={fn()}>
        <TextField label="Username" name="username" isRequired autoComplete="username" />
        <PasswordField label="Password" name="password" isRequired autoComplete="current-password" />
      </AuthForm>
    </div>
  ),
}

/** More than one directory, which is the install with a partner tenant. */
export const TwoProviders: Story = {
  name: 'Two directories',
  args: {
    providers: [
      { ...ENTRA, onChoose: fn() },
      { id: 'okta', name: 'Okta', onChoose: fn() } satisfies SsoProvider,
    ],
  },
  play: async ({ canvas }) => {
    // Each directory is named rather than collapsed into one "single sign-on"
    // button, which would leave the analyst guessing which of the two they
    // are about to be sent to.
    await expect(canvas.getByRole('button', { name: /Entra/ })).toBeVisible()
    await expect(canvas.getByRole('button', { name: /Okta/ })).toBeVisible()
  },
}

/** No local passwords at all, so there is nothing on the other side of the rule. */
export const SoleMeans: Story = {
  name: 'The only way in',
  args: { soleMeans: true },
  play: async ({ canvas }) => {
    // No local passwords, so there is nothing on the other side of the rule.
    // A rule with one side reads as a form that failed to render.
    await expect(canvas.queryByText(/^or$/i)).toBeNull()
    await expect(canvas.getByRole('button', { name: /Entra/ })).toBeVisible()
  },
}

/**
 * Configured but unreachable -- the button says the install offers it and the
 * press is refused, which is the honest state while the door is being wired.
 */
export const NotYetWired: Story = {
  name: 'Offered but not answering',
  args: { providers: [ENTRA] },
  play: async ({ canvas }) => {
    // Drawn and refused rather than hidden: the install does offer this door,
    // and a button that vanished while it was being wired would say the
    // opposite about what the install accepts.
    await expect(canvas.getByRole('button', { name: /Entra/ })).toBeDisabled()
  },
}
