import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, fn, userEvent, within } from 'storybook/test'

import { Button } from '@/components/ui/button'
import { NewAccountDialog, type NewAccount } from './new-account-dialog'

/**
 * The door an administrator mints an account through.
 *
 * The roles are the server's, so the form draws whatever an install offers
 * rather than a list written here.
 */
const meta = {
  title: 'Blocks/Dialogs/New account',
  component: NewAccountDialog,
  parameters: { layout: 'fullscreen' },
  args: {
    // Shut by default: a docs page renders every story into one document, and
    // modal dialogs there cannot be dismissed.
    isOpen: false,
    onOpenChange: fn(),
    onCreate: fn(),
    roles: ['analyst', 'admin'],
    defaultRole: 'analyst',
    isPending: false,
  },
  decorators: [
    /** Holds the dialog open, which nothing else here does. */
    (Story, context) => {
      const [open, setOpen] = useState(context.parameters.startOpen === true)
      // A write that never resolves, so the story rests in the state a real
      // one passes through.
      const [writing, setWriting] = useState(false)
      const holds = context.parameters.holdOnCreate === true
      // A create that comes back refused, so the story rests where a real
      // refusal leaves the analyst.
      const [refusal, setRefusal] = useState<string | undefined>(undefined)
      const refuses = context.parameters.refuseOnCreate === true
      return (
        <>
          <Button
            variant="outline"
            onPress={() => {
              setOpen(true)
            }}
          >
            New account
          </Button>
          <Story
            args={{
              ...context.args,
              isOpen: open,
              onOpenChange: setOpen,
              ...(refuses
                ? {
                    problem: refusal,
                    onCreate: (account: NewAccount) => {
                      setRefusal('That address already has an account.')
                      context.args.onCreate(account)
                    },
                  }
                : {}),
              ...(holds
                ? {
                    isPending: writing,
                    onCreate: (account: NewAccount) => {
                      setWriting(true)
                      context.args.onCreate(account)
                    },
                  }
                : {}),
            }}
          />
        </>
      )
    },
  ],
} satisfies Meta<typeof NewAccountDialog>

export default meta
type Story = StoryObj<typeof meta>


/**
 * The form as an administrator fills it in. Press the trigger to open it.
 *
 * Shut on arrival, like the other dialog stories: a docs page renders every
 * story into one document, and a modal there cannot be dismissed.
 */
export const Open: Story = {
  play: async ({ args, canvasElement }) => {
    // `canvasElement.ownerDocument.body`, because the dialog is a portal and
    // does not sit inside the canvas element.
    const canvas = within(canvasElement.ownerDocument.body)
    // The decorator leaves it shut, so the walk starts where an administrator's
    // does: at the trigger.
    await userEvent.click(canvas.getByRole('button', { name: 'New account' }))
    await userEvent.type(canvas.getByLabelText(/e-?mail/i), 'nina@example.test')
    await userEvent.type(canvas.getByLabelText(/display name/i), 'Nina Okafor')
    await userEvent.type(canvas.getByLabelText(/^password/i), 'correct-horse-battery')
    await userEvent.click(canvas.getByRole('button', { name: /create account/i }))
    // The four the create route takes, and the role from the default rather
    // than from a press: an administrator who touches nothing still sends one.
    await expect(args.onCreate).toHaveBeenCalledWith({
      username: 'nina@example.test',
      display_name: 'Nina Okafor',
      password: 'correct-horse-battery',
      role: 'analyst',
    })
  },
}

/**
 * **A write in flight, reached rather than posed.** `isPending: true` at mount draws a write in
 * flight over an empty form -- a state that cannot happen, because the field
 * values are the dialog's own state and a held fieldset cannot be typed into.
 * So this story fills the form, presses Create, and the decorator flips
 * pending on the way through: the same moment an analyst actually sees.
 */
export const Writing: Story = {
  parameters: { holdOnCreate: true },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)
    await userEvent.click(canvas.getByRole('button', { name: 'New account' }))
    await userEvent.type(canvas.getByLabelText(/e-?mail/i), 'nina@example.test')
    await userEvent.type(canvas.getByLabelText(/display name/i), 'Nina Okafor')
    await userEvent.type(canvas.getByLabelText(/^password/i), 'correct-horse-battery')
    await userEvent.click(canvas.getByRole('button', { name: /create account/i }))
    // From here the write is in flight, and what it typed is still on screen.
    await expect(canvas.getByLabelText(/e-?mail/i)).toHaveValue('nina@example.test')
    // **The fields, not just the button.** Holding only the submit leaves an
    // analyst able to edit the address after pressing Create, so the account
    // is made with one value and the screen shows another.
    await expect(canvas.getByLabelText(/e-?mail/i)).toBeDisabled()
    await expect(canvas.getByLabelText(/display name/i)).toBeDisabled()
    await expect(canvas.getByLabelText(/^password/i)).toBeDisabled()
    // Cancel too: dismissing mid-write leaves the account made and the analyst
    // believing they stopped it.
    await expect(canvas.getByRole('button', { name: /cancel/i })).toBeDisabled()
    // **The role, asserted on its own attribute rather than with
    // `toBeDisabled`.** jest-dom walks up and calls anything inside a disabled
    // fieldset disabled, so that matcher cannot tell "the press is stopped"
    // from "the control says it is held" -- it passed with the group's own
    // `isDisabled` removed.
    for (const role of ['Analyst', 'Admin']) {
      await expect(canvas.getByRole('radio', { name: new RegExp(role) })).toHaveAttribute(
        'disabled',
      )
    }
    // **The keyboard is the way past a disabled button.** A press cannot fire
    // it -- the kit gives it `pointer-events: none` -- but Enter in a text box
    // submits the form the button only points at, which is how an install ends
    // up with two accounts from one analyst. A disabled fieldset closes that
    // too.
    await expect(args.onCreate).toHaveBeenCalledTimes(1)
    await userEvent.type(canvas.getByLabelText(/e-?mail/i), 'x{Enter}')
    // Still one: the press that started the write, and nothing the keyboard
    // added to it.
    await expect(args.onCreate).toHaveBeenCalledTimes(1)
  },
}

/**
 * The server refused, reached the way an analyst reaches it.
 *
 * **Posed over an empty form this documented nothing**: a refusal only follows
 * a filled form and a press, and the property worth holding is that the
 * refusal does not cost the analyst what they typed.
 */
export const Refused: Story = {
  parameters: { refuseOnCreate: true },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)
    await userEvent.click(canvas.getByRole('button', { name: 'New account' }))
    await userEvent.type(canvas.getByLabelText(/e-?mail/i), 'nina@example.test')
    await userEvent.type(canvas.getByLabelText(/display name/i), 'Nina Okafor')
    await userEvent.type(canvas.getByLabelText(/^password/i), 'correct-horse-battery')
    await userEvent.click(canvas.getByRole('button', { name: /create account/i }))

    await expect(canvas.getByText('That address already has an account.')).toBeVisible()
    // **What the analyst typed survives the refusal.** Clearing the form would
    // make them retype three fields to change the one the server objected to.
    await expect(canvas.getByLabelText(/e-?mail/i)).toHaveValue('nina@example.test')
    await expect(canvas.getByLabelText(/display name/i)).toHaveValue('Nina Okafor')
    // And the form is usable again rather than left held from the write.
    await expect(canvas.getByLabelText(/e-?mail/i)).toBeEnabled()
    await expect(args.onOpenChange).not.toHaveBeenCalledWith(false)
  },
}
