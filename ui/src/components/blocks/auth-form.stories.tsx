import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import { PasswordField } from '@/components/ui/password-field'
import { TextField } from '@/components/ui/text-field'

import { AuthForm } from './auth-form'

/**
 * The form an unauthenticated screen submits a credential through.
 */
const meta = {
  title: 'Blocks/Auth/Form',
  component: AuthForm,
  parameters: { layout: 'centered' },
  args: {
    submit: 'Sign in',
    pending: 'Signing in',
    onSubmit: fn(),
  },
  decorators: [
    (Story) => (
      <div className="w-sm [--control-h-md:2.75rem]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AuthForm>

export default meta
type Story = StoryObj<typeof meta>

const Credential = () => (
  <>
    <TextField label="Email" name="email" type="email" isRequired autoComplete="email" />
    <PasswordField label="Password" name="password" isRequired autoComplete="current-password" />
  </>
)

/**
 * Two fields and a submit, with nothing else asked of it.
 */
export const Plain: Story = {
  name: 'Fields and a submit',
  args: { children: <Credential /> },
  play: async ({ args, canvas, step }) => {
    await step('A filled form reaches the caller', async () => {
      await userEvent.type(canvas.getByRole('textbox', { name: 'Email' }), 'nina@example.test')
      await userEvent.type(canvas.getByLabelText('Password'), 'correct-horse-battery')
      await userEvent.click(canvas.getByRole('button', { name: 'Sign in' }))
      await expect(args.onSubmit).toHaveBeenCalledTimes(1)
    })

    // Both routes, because they are different code paths: the press goes
    // through the button and Enter goes through the form the button only points
    // at. The submit renders `type="button"` and React Aria's `Form` carries
    // the keyboard route regardless, measured.
    await step('And so does Enter in a box', async () => {
      await userEvent.type(canvas.getByRole('textbox', { name: 'Email' }), '{Enter}')
      await expect(args.onSubmit).toHaveBeenCalledTimes(2)
    })

    await step('And the page is still here to receive the answer', async () => {
      await expect(canvas.getByRole('textbox', { name: 'Email' })).toHaveValue(
        'nina@example.test',
      )
    })
  },
}

/**
 * With a way out for somebody who cannot produce the credential.
 */
export const WithRecovery: Story = {
  name: 'A recovery route',
  args: {
    children: <Credential />,
    recovery: 'An administrator resets a password you cannot produce.',
  },
  play: async ({ canvas, step }) => {
    const route = canvas.getByText('An administrator resets a password you cannot produce.')
    const submit = canvas.getByRole('button', { name: 'Sign in' })

    await step('It is above the submit', async () => {
      await expect(route.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        submit.getBoundingClientRect().top + 1,
      )
    })

    await step('And it is a sentence rather than a control', async () => {
      // Recovery goes through an administrator, so there is nowhere to send
      // anybody: a link here would be drawn like a way out and be none.
      await expect(canvas.queryByRole('link')).toBeNull()
      canvas.getByLabelText('Password').focus()
      // One tab past the box's own reveal control, and the submit is next --
      // nothing focusable sits between them any more.
      await userEvent.tab()
      await userEvent.tab()
      await expect(submit).toHaveFocus()
    })
  },
}

/**
 * The exchange in flight.
 *
 * The submit swaps its words for the pending ones. That it keeps its width
 * through the swap is a claim about two states and needs the pair to make it, so
 * it is not asserted here.
 */
export const Pending: Story = {
  name: 'A submit in flight',
  args: { children: <Credential />, isPending: true },
  play: async ({ args, canvas, step }) => {
    const buttons = canvas.getAllByRole('button')
    const submit = buttons[buttons.length - 1]!

    await step('The submit says what is happening, to the eye', async () => {
      await expect(submit).toHaveTextContent('Signing in')
      await expect(canvas.queryByRole('button', { name: /^Sign in$/ })).not.toBeInTheDocument()
    })

    // The words sit beside the indicator rather than under it, so the button is
    // named by them and a reader is told which control is busy.
    await step('And to a reader, which is what names it', async () => {
      await expect(canvas.getByRole('button', { name: /Signing in/ })).toBe(submit)
      await expect(submit.querySelector('[data-slot="button-pending"]')).not.toBeNull()
    })

    // Measured, not assumed: the block holds the button and leaves the boxes.
    await step('But the boxes are still editable', async () => {
      await expect(canvas.getByRole('textbox', { name: 'Email' })).toBeEnabled()
      await expect(canvas.getByLabelText('Password')).toBeEnabled()
    })

    // The keyboard is the usual route past a held button -- Enter in a text box
    // submits the form the button only points at -- and it is closed here.
    await step('And no second exchange can be sent, by press or by key', async () => {
      await userEvent.type(canvas.getByRole('textbox', { name: 'Email' }), 'x{Enter}')
      await expect(args.onSubmit).not.toHaveBeenCalled()
    })
  },
}

/**
 * `roomy` is the wider rhythm a short form can afford.
 */
export const Roomy: Story = {
  name: 'The wider rhythm',
  args: { children: <Credential />, gap: 'roomy' },
  play: async ({ canvas }) => {
    const email = canvas.getByRole('textbox', { name: 'Email' }).getBoundingClientRect()
    const password = canvas.getByLabelText('Password').getBoundingClientRect()

    await expect(password.top - email.bottom).toBeGreaterThan(16)
    await expect(email.height).toBeCloseTo(password.height, 0)
  },
}

/**
 * `native` hands the platform the gate, so an empty required field is a
 * refusal rather than a mark.
 */
export const Gated: Story = {
  name: 'The platform gating the submit',
  args: { children: <Credential />, validationBehavior: 'native' },
  play: async ({ args, canvasElement, step }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Sign in' }))

    await step('The empty box reports itself refused', async () => {
      await expect(canvas.getByRole('textbox', { name: 'Email' })).toBeInvalid()
    })

    await step('And nothing was sent', async () => {
      await expect(args.onSubmit).not.toHaveBeenCalled()
    })
  },
}
