import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ComponentProps } from 'react'
import { useState } from 'react'
import { expect, fn, waitFor } from 'storybook/test'

import { Button } from './button'
import { Form } from './form'
import { TextField } from './text-field'

/**
 * `onSubmitted` is not a prop of `TextField`. The two validation stories need a
 * spy to assert against, and an intersection type is how a story declares an
 * arg the component does not have without casting.
 *
 * **Every `render` below destructures it out** before spreading the rest: passed
 * on to `TextField` it reaches the DOM as an unknown attribute, and React's
 * warning about that fails the story in this tier.
 */
type StoryArgs = ComponentProps<typeof TextField> & {
  onSubmitted: (value: string) => void
}

/**
 * One line of text: a label, a box, an optional description under it, and an
 * error that replaces the description when the value is refused.
 *
 * `onChange` receives the string rather than the event. A `label` or an
 * `aria-label` is required; a placeholder is not a substitute, since it goes as
 * soon as anything is typed.
 *
 * Two refusal paths, and they differ. `isInvalid` with `errorMessage` is the
 * controlled one. `validate` marks the field and **does not stop the submit**:
 * the kit's `Form` defaults `validationBehavior` to `"aria"` so a screen's own
 * refusal branch stays reachable, so a caller treating `validate` as a guard
 * has none. Pass `"native"` for platform gating.
 *
 * `isDisabled` leaves the tab order; `isReadOnly` keeps it and refuses the edit.
 */
const meta = {
  title: 'Components/TextField',
  component: TextField,
  parameters: { layout: 'centered' },
  // Live controls for every story below: each `render` spreads `args` rather
  // than ignoring it, so a knob moved in the panel reaches the fields on screen.
  // `fn()` makes `onSubmitted` a spy the `play` functions can assert against.
  args: { label: 'Case title', placeholder: 'Mailbox read in bulk', onSubmitted: fn() },
  render: ({ onSubmitted: _onSubmitted, ...args }) => <TextField {...args} />,
} satisfies Meta<StoryArgs>

export default meta
type Story = StoryObj<typeof meta>

/**
 * A label and a box.
 *
 * The `play` asserts the label reaches the input rather than merely sitting
 * above it - `getByLabelText` fails if the generated `id`/`for` pair is ever
 * broken, which is the defect that leaves a field unusable by a screen reader
 * and identical in a screenshot.
 */
export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText('Case title')).toHaveAttribute(
      'placeholder',
      'Mailbox read in bulk',
    )
  },
}

/** One line under the box, announced with the field rather than read separately. */
export const WithDescription: Story = {
  args: {
    label: 'Ticket reference',
    placeholder: 'INC-0000',
    description: 'The reference the ticketing system holds.',
  },
  play: async ({ canvas, canvasElement }) => {
    const input = canvas.getByLabelText('Ticket reference')
    const describedBy = input.getAttribute('aria-describedby')

    await expect(describedBy).not.toBeNull()
    await expect(
      canvasElement.querySelector('#' + CSS.escape(describedBy ?? '')),
    ).toHaveTextContent('The reference the ticketing system holds.')
  },
}

/** The size ladder: 28, 32 and 40px. */
export const Sizes: Story = {
  render: ({ onSubmitted: _onSubmitted, ...args }) => (
    <div className="flex flex-col gap-4">
      <TextField {...args} label="Small" size="sm" defaultValue="Small" />
      <TextField {...args} label="Medium" size="md" defaultValue="Medium" />
      <TextField {...args} label="Large" size="lg" defaultValue="Large" />
    </div>
  ),
}

/**
 * **`isDisabled` and `isReadOnly` are not the same refusal, and choosing
 * wrongly loses the value.**
 *
 * Disabled leaves the tab order entirely: an analyst walking the form never
 * reaches it and never learns the value it holds. Read-only keeps the tab stop
 * and the text selectable, and only refuses the edit.
 *
 * Use read-only where the value still matters to the reader - a field frozen
 * because the case is closed. Use disabled where the field is irrelevant until
 * something else changes.
 *
 * The `play` walks the tab order and pins the distinction, which the prose here
 * previously claimed with nothing checking it.
 */
export const DisabledAndReadOnly: Story = {
  render: ({ onSubmitted: _onSubmitted, ...args }) => (
    <div className="flex flex-col gap-4">
      <Button size="sm" variant="outline">
        Before
      </Button>
      <TextField {...args} label="Disabled" defaultValue="Not reachable" isDisabled />
      <TextField {...args} label="Read-only" defaultValue="Reachable, not editable" isReadOnly />
      <Button size="sm" variant="outline">
        After
      </Button>
    </div>
  ),
  play: async ({ canvas, step, userEvent }) => {
    const disabled = canvas.getByLabelText('Disabled')
    const readOnly = canvas.getByLabelText('Read-only')

    await step('Tab from the button above the two fields', async () => {
      canvas.getByRole('button', { name: 'Before' }).focus()
      await userEvent.tab()
    })

    await step('Disabled is skipped; read-only is the next stop', async () => {
      await expect(disabled).not.toHaveFocus()
      await expect(readOnly).toHaveFocus()
    })

    await step('Read-only holds its focus and refuses the edit', async () => {
      await userEvent.type(readOnly, 'edited')
      await expect(readOnly).toHaveValue('Reachable, not editable')
    })
  },
}

/**
 * **`isInvalid` with `errorMessage` is the controlled refusal**: the caller has
 * decided the value is wrong and says why.
 *
 * The message is bound to the input, so it is announced when focus arrives
 * rather than only painted red - which is the half that colour alone cannot
 * carry.
 */
export const Invalid: Story = {
  args: {
    label: 'Analyst email',
    defaultValue: 'not-an-address',
    isInvalid: true,
    errorMessage: 'Enter an email address.',
  },
  play: async ({ canvas, canvasElement }) => {
    const input = canvas.getByLabelText('Analyst email')

    await expect(input).toHaveAttribute('aria-invalid', 'true')
    const describedBy = input.getAttribute('aria-describedby')
    await expect(
      canvasElement.querySelector('#' + CSS.escape(describedBy ?? '')),
    ).toHaveTextContent('Enter an email address.')
  },
}

/**
 * A field with a `validate` inside a `Form`, submitted by a button.
 *
 * `behaviour` is the whole subject of the two stories below.
 */
function SubmitGuard({
  onSubmitted,
  behaviour,
}: {
  onSubmitted: (value: string) => void
  behaviour: 'aria' | 'native'
}) {
  const [value, setValue] = useState('not-an-address')
  return (
    <Form
      className="flex w-72 flex-col gap-4"
      validationBehavior={behaviour}
      onSubmit={(event) => {
        event.preventDefault()
        onSubmitted(value)
      }}
    >
      <TextField
        label="Analyst email"
        value={value}
        onChange={setValue}
        validate={(entered) => (entered.includes('@') ? null : 'Enter an email address.')}
      />
      <Button type="submit" size="sm">
        Save
      </Button>
    </Form>
  )
}

/**
 * **`validate` does not stop a submit, and that is deliberate.**
 *
 * The kit's `Form` defaults `validationBehavior` to `"aria"` against React
 * Aria's own `"native"`. The field marks itself invalid and announces why, and
 * the submission still runs - so the screen's own refusal branch is reachable
 * and testable rather than being pre-empted by the platform.
 *
 * **This is the trap.** A caller reading `validate` as a guard writes no other
 * one, and the write leaves for the server carrying a value the field has
 * already marked as wrong. If the submit must not fire, the screen checks
 * before acting, or the form opts into `"native"` - see the story below.
 */
export const AriaValidationStillSubmits: Story = {
  render: ({ onSubmitted }) => <SubmitGuard behaviour="aria" onSubmitted={onSubmitted} />,
  play: async ({ args, canvas, step, userEvent }) => {
    const input = canvas.getByLabelText('Analyst email')

    await step('Submit a value the field refuses', async () => {
      await userEvent.click(canvas.getByRole('button', { name: 'Save' }))
      await waitFor(() => {
        void expect(input).toHaveAttribute('aria-invalid', 'true')
      })
    })

    await step('The submission ran anyway, carrying that value', async () => {
      await expect(args.onSubmitted).toHaveBeenCalledWith('not-an-address')
    })
  },
}

/**
 * **`validationBehavior="native"` is the opt-in that does stop it.**
 *
 * The browser refuses the submission, focus moves to the offending field, and
 * the handler never runs. `sign-in.tsx` is where this application takes it,
 * because there the screen has nothing better to do with a bad value than
 * refuse it.
 */
export const NativeValidationRefusesTheSubmit: Story = {
  render: ({ onSubmitted }) => <SubmitGuard behaviour="native" onSubmitted={onSubmitted} />,
  play: async ({ args, canvas, step, userEvent }) => {
    const input = canvas.getByLabelText('Analyst email')

    await step('Submit a value the field refuses', async () => {
      await userEvent.click(canvas.getByRole('button', { name: 'Save' }))
      await waitFor(() => {
        void expect(canvas.getByText('Enter an email address.')).toBeInTheDocument()
      })
      await expect(args.onSubmitted).not.toHaveBeenCalled()
    })

    await step('Correct it and the submission goes through', async () => {
      await userEvent.clear(input)
      await userEvent.type(input, 'analyst@example.org')
      await userEvent.click(canvas.getByRole('button', { name: 'Save' }))
      await waitFor(() => {
        void expect(args.onSubmitted).toHaveBeenCalledWith('analyst@example.org')
      })
    })
  },
}

/** `type` carries through to the input, so a password masks and a manager fills. */
export const Types: Story = {
  render: ({ onSubmitted: _onSubmitted, ...args }) => (
    <div className="flex flex-col gap-4">
      <TextField {...args} label="Email" type="email" placeholder="analyst@example.org" />
      <TextField {...args} label="Password" type="password" defaultValue="hunter2" />
      <TextField {...args} label="Source URL" type="url" placeholder="https://example.org" />
    </div>
  ),
}

/**
 * **The box stops growing at `--container-field` and the value scrolls inside it.**
 *
 * A long value is not truncated and not wrapped: the field keeps its measure,
 * and the text runs past the right edge where only the caret follows it. An
 * analyst pasting a long indicator sees the tail, not the head.
 */
export const LongValue: Story = {
  args: {
    label: 'Indicator',
    defaultValue:
      'hxxps://storage-account-prod-eastus2.blob.core.windows.net/exfil/2026-08-29T04-12-55Z/finance-master-export.7z',
  },
}

/** Empty, which is every field's first state and the one the placeholder is for. */
export const Empty: Story = {
  args: { label: 'Case title', defaultValue: '' },
}
