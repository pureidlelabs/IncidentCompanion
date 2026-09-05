import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ComponentProps } from 'react'
import { useState } from 'react'
import { expect, fn } from 'storybook/test'

import { Button } from './button'
import { Form } from './form'
import { PasswordField } from './password-field'

type StoryArgs = ComponentProps<typeof PasswordField> & { onSubmitted: () => void }

/**
 * A password box with a reveal, so an analyst can read back what they typed.
 */
const meta = {
  title: 'Components/PasswordField',
  component: PasswordField,
  parameters: { layout: 'centered' },
  args: { label: 'Password', defaultValue: 'correct horse battery staple', onSubmitted: fn() },
  render: ({ onSubmitted: _onSubmitted, ...args }) => <PasswordField {...args} />,
} satisfies Meta<StoryArgs>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Masked, with the control that shows it.
 */
export const Default: Story = {
  play: async ({ canvas, step, userEvent }) => {
    const box = canvas.getByLabelText('Password')
    const reveal = canvas.getByRole('button', { name: /password/i })

    await step('It starts masked, and says so', async () => {
      await expect(box).toHaveAttribute('type', 'password')
      await expect(reveal).toHaveAttribute('aria-pressed', 'false')
    })

    await step('Pressing it reads the password back', async () => {
      await userEvent.click(reveal)
      await expect(box).toHaveAttribute('type', 'text')
      await expect(reveal).toHaveAttribute('aria-pressed', 'true')
    })

    await step('And pressing it again hides the password', async () => {
      await userEvent.click(reveal)
      await expect(box).toHaveAttribute('type', 'password')
    })
  },
}

/**
 * **The reveal is per box**, so a form asking twice draws two of them and
 * showing one leaves the other masked.
 *
 * State shared across the fields of one form would put every password on a
 * change-password screen on display at once, and a single-field story cannot
 * see that.
 */
export const ChosenTwice: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <PasswordField label="New password" autoComplete="new-password" defaultValue="one" />
      <PasswordField
        label="Repeat new password"
        autoComplete="new-password"
        defaultValue="two"
        isInvalid
        errorMessage="The passwords do not match"
      />
    </div>
  ),
  play: async ({ canvas, userEvent }) => {
    const first = canvas.getByLabelText('New password')
    const second = canvas.getByLabelText('Repeat new password')

    const [reveal] = canvas.getAllByRole('button', { name: /password/i })
    await userEvent.click(reveal!)

    await expect(first).toHaveAttribute('type', 'text')
    await expect(second).toHaveAttribute('type', 'password')
  },
}

/**
 * **The reveal does not submit the form it sits in.**
 */
export const DoesNotSubmit: Story = {
  render: ({ onSubmitted }) => (
    <Form
      className="flex w-80 flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmitted()
      }}
    >
      <PasswordField label="Password" defaultValue="correct horse battery staple" />
      <Button type="submit" size="sm">
        Sign in
      </Button>
    </Form>
  ),
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: /show|hide|password/i }))

    await expect(canvas.getByLabelText('Password')).toHaveAttribute('type', 'text')
    await expect(args.onSubmitted).not.toHaveBeenCalled()
  },
}

/**
 * **A fresh mount starts hidden again**, whatever the last one was showing.
 */
function Remountable() {
  const [instance, setInstance] = useState(0)
  return (
    <div className="flex w-80 flex-col gap-3">
      <PasswordField key={instance} label="Password" defaultValue="correct horse" />
      <Button
        size="sm"
        variant="outline"
        onPress={() => {
          setInstance((n) => n + 1)
        }}
      >
        Open it afresh
      </Button>
    </div>
  )
}

/**
 * A revealed field, remounted.
 */
export const StartsHiddenAgain: Story = {
  render: () => <Remountable />,
  play: async ({ canvas, step, userEvent }) => {
    await step('Reveal it', async () => {
      await userEvent.click(canvas.getByRole('button', { name: /password/i }))
      await expect(canvas.getByLabelText('Password')).toHaveAttribute('type', 'text')
    })

    await step('Mount it again and it is masked', async () => {
      await userEvent.click(canvas.getByRole('button', { name: 'Open it afresh' }))
      await expect(canvas.getByLabelText('Password')).toHaveAttribute('type', 'password')
    })
  },
}

/** The size ladder, shared with every other field. */
export const Sizes: Story = {
  render: ({ label: _label, onSubmitted: _onSubmitted, ...args }) => (
    <div className="flex flex-col gap-4">
      <PasswordField {...args} label="Small" size="sm" defaultValue="small" />
      <PasswordField {...args} label="Medium" size="md" defaultValue="medium" />
      <PasswordField {...args} label="Large" size="lg" defaultValue="large" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const heights = [...canvasElement.querySelectorAll('[data-slot="field-group"]')].map(
      (group) => group.getBoundingClientRect().height,
    )
    await expect(heights).toHaveLength(3)
    for (let index = 1; index < heights.length; index += 1) {
      await expect(heights[index]!).toBeGreaterThan(heights[index - 1]!)
    }
  },
}

/**
 * **Disabled stops the editing and leaves the reveal live.**
 */
export const Disabled: Story = {
  args: { defaultValue: 'unreachable', isDisabled: true },
  play: async ({ canvas, step, userEvent }) => {
    await step('The box refuses editing', async () => {
      await expect(canvas.getByLabelText('Password')).toBeDisabled()
    })

    await step('And the reveal still reads it back', async () => {
      await userEvent.click(canvas.getByRole('button', { name: /password/i }))
      await expect(canvas.getByLabelText('Password')).toHaveAttribute('type', 'text')
    })
  },
}
