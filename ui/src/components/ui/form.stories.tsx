import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ComponentProps } from 'react'
import { expect, fn, waitFor } from 'storybook/test'

import { Button } from './button'
import { Form } from './form'
import { TextField } from './text-field'

/**
 * The story's submit handler, with the navigation held back.
 *
 * **A story that lets a form submit for real navigates the page**, which in
 * this tier closes the browser mid-run and reports as a lost connection rather
 * than as a failing story.
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
 *
 * **It defaults `validationBehavior` to `"aria"` against React Aria's own
 * `"native"`**, and that one line decides what a refusal means everywhere
 * above it. Under `"aria"` a field marks itself and the submission still
 * reaches the handler, so the screen's own refusal branch is the thing that
 * stops the write -- and is reachable and testable. Under `"native"` the
 * browser refuses and the handler never runs.
 *
 * So a caller reading `validate` or `isInvalid` as a guard has no guard by
 * default. The screen checks before acting, or the form opts into `"native"`.
 *
 * `validationErrors` is the third path: a batch of messages arriving at once,
 * matched to fields by `name`. Use it for what a server said, not for what a
 * component is tracking live -- a map rebuilt every render loses the message
 * the instant the field blurs without the owner re-rendering.
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
 *
 * This is advice rather than a refusal, and the story is named for it because
 * that is the distinction a caller gets wrong.
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
 *
 * **Not the shape for a field a component already tracks live in its own
 * state.** A map rebuilt every render loses the message the instant the field
 * blurs without the owning component re-rendering for an unrelated reason --
 * `isInvalid`, a directly controlled prop, has no such gap.
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
