import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ComponentProps } from 'react'
import { expect, fn, waitFor } from 'storybook/test'

import { Button } from './button'
import { Form } from './form'
import { TextField } from './text-field'

/**
 * The story's submit handler, with the navigation held back.
 */
type Submit = NonNullable<ComponentProps<typeof Form>['onSubmit']>

function held(spy: Submit | undefined): Submit {
  return (event) => {
    event.preventDefault()
    spy?.(event)
  }
}

/**
 * The `<form>` every screen in the kit submits through.
 */
const meta = {
  title: 'Components/Form',
  component: Form,
  parameters: { layout: 'padded' },
  args: { onSubmit: fn() },
} satisfies Meta<typeof Form>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Default `validationBehavior`: `"aria"`. The field marks itself and renders
 * its message, and **the submit still reaches the handler**.
 */
export const Advice: Story = {
  render: ({ onSubmit, ...args }) => (
    <Form {...args} className="flex max-w-sm flex-col gap-4" onSubmit={held(onSubmit)}>
      <TextField
        label="Repeat"
        defaultValue="mistyped"
        isInvalid
        errorMessage="The passwords do not match"
      />
      <Button type="submit">Submit anyway</Button>
    </Form>
  ),
  play: async ({ args, canvas, step, userEvent }) => {
    await step('The field says it is wrong', async () => {
      await expect(canvas.getByLabelText('Repeat')).toHaveAttribute('aria-invalid', 'true')
      await expect(canvas.getByText('The passwords do not match')).toBeInTheDocument()
    })

    await step('And the submission goes through regardless', async () => {
      await userEvent.click(canvas.getByRole('button', { name: 'Submit anyway' }))
      await waitFor(() => {
        void expect(args.onSubmit).toHaveBeenCalled()
      })
    })
  },
}

/**
 * `validationErrors` on the `Form`, matched to a field by its `name` -- for a
 * batch that arrives all at once, such as a 422 naming several fields, and is
 * shown as it stands rather than recomputed on every keystroke.
 */
export const ServerAdvice: Story = {
  render: ({ onSubmit, ...args }) => (
    <Form
      {...args}
      className="flex max-w-sm flex-col gap-4"
      onSubmit={held(onSubmit)}
      validationErrors={{ token: 'That setup token has already been claimed.' }}
    >
      <TextField label="Setup token" name="token" defaultValue="abc123" />
      <Button type="submit">Submit anyway</Button>
    </Form>
  ),
  play: async ({ canvas }) => {
    // Matched by `name`, so the message lands on the field the server named
    // rather than at the top of the form.
    const box = canvas.getByLabelText('Setup token')
    await expect(box).toHaveAttribute('aria-invalid', 'true')
    await expect(canvas.getByText('That setup token has already been claimed.')).toBeInTheDocument()
  },
}

/**
 * `validationBehavior="native"`, opted into explicitly: the browser refuses
 * the submit while the field is invalid. A real refusal, not advice.
 */
export const Refusal: Story = {
  render: ({ onSubmit, ...args }) => (
    <Form
      {...args}
      className="flex max-w-sm flex-col gap-4"
      validationBehavior="native"
      onSubmit={held(onSubmit)}
    >
      <TextField
        label="Setup token"
        isRequired
        errorMessage="Enter the setup token printed at startup."
      />
      <Button type="submit">Claim install</Button>
    </Form>
  ),
  play: async ({ args, canvas, step, userEvent }) => {
    await step('The empty required field stops the submission', async () => {
      await userEvent.click(canvas.getByRole('button', { name: 'Claim install' }))
      await waitFor(() => {
        void expect(
          canvas.getByText('Enter the setup token printed at startup.'),
        ).toBeInTheDocument()
      })
      await expect(args.onSubmit).not.toHaveBeenCalled()
    })

    await step('And filling it lets the submission through', async () => {
      await userEvent.type(canvas.getByLabelText('Setup token'), 'abc123')
      await userEvent.click(canvas.getByRole('button', { name: 'Claim install' }))
      await waitFor(() => {
        void expect(args.onSubmit).toHaveBeenCalled()
      })
    })
  },
}
