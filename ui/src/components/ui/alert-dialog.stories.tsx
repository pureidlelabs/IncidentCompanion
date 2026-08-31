import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, waitFor, within } from 'storybook/test'

import { AlertDialog } from './alert-dialog'
import { Button } from './button'

/**
 * `AlertDialog` in its two tones and its in-flight state.
 *
 * **It refuses both the scrim and Escape**, which is the whole difference from
 * `Dialog`. React Aria leaves an overlay undismissable by outside click and
 * dismissable by Escape; the kit's `Dialog` opts into both, and this one opts
 * out of both. A decision an analyst is being asked to take is not one they
 * should be able to leave by missing the box.
 *
 * `onConfirm` and `onCancel` are both required, so the dialog always has two
 * named ways out and neither is the scrim.
 *
 * Each story arrives open in its own docs frame, and keeps the button that
 * reopens it -- three modals rendered inline would hold the whole autodocs page.
 */
const meta = {
  title: 'Components/AlertDialog',
  component: AlertDialog,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof AlertDialog>

export default meta
type Story = StoryObj<typeof meta>

/** Opens the dialog from a button and closes it on either answer. */
function Demo({
  open: label,
  startOpen = false,
  ...props
}: {
  open: string
  startOpen?: boolean
  title: string
  consequence: string
  confirmLabel: string
  tone?: 'default' | 'destructive'
  isPending?: boolean
}) {
  const [isOpen, setOpen] = useState(startOpen)
  const close = () => {
    setOpen(false)
  }
  return (
    <>
      <Button
        variant={props.tone === 'destructive' ? 'destructive' : 'default'}
        onPress={() => {
          setOpen(true)
        }}
      >
        {label}
      </Button>
      <AlertDialog
        {...props}
        isOpen={isOpen}
        onOpenChange={setOpen}
        onConfirm={close}
        onCancel={close}
      />
    </>
  )
}

const args = {
  title: 'Publish this report?',
  confirmLabel: 'Publish',
  onConfirm: () => undefined,
  onCancel: () => undefined,
}

/** Its own docs frame, `height` tall, so a modal can arrive open. */
function frame(height: string) {
  return { docs: { story: { inline: false, height } } }
}

/**
 * The alert is on the page, under the question the story asked.
 *
 * `alertdialog` rather than `dialog`: the role decides whether a screen reader
 * announces this as a decision that cannot be dismissed, and a story rendering
 * only its trigger smoke-tests green without it. Searched from the document,
 * since the overlay is portalled out of the canvas.
 */
async function showsAlert(canvasElement: HTMLElement, title: string) {
  const body = within(canvasElement.ownerDocument.body)
  await expect(await body.findByRole('alertdialog')).toBeInTheDocument()
  await expect(await body.findByText(title)).toBeInTheDocument()
}

/** The default tone: a decision that is not a removal. */
export const Default: Story = {
  parameters: frame('300px'),
  args,
  play: async ({ canvasElement }) => {
    await showsAlert(canvasElement, 'Publish this report?')
  },
  render: () => (
    <Demo
      startOpen
      open="Publish report"
      title="Publish this report?"
      consequence="Everyone on the case sees it, and the version is fixed."
      confirmLabel="Publish"
    />
  ),
}

/** Destructive: the mark and the confirm button both take the tone. */
export const Destructive: Story = {
  parameters: frame('300px'),
  args,
  play: async ({ canvasElement }) => {
    await showsAlert(canvasElement, 'Delete this case?')
  },
  render: () => (
    <Demo
      startOpen
      open="Delete case"
      tone="destructive"
      title="Delete this case?"
      consequence="This removes the case for everyone on this install. It cannot be undone."
      confirmLabel="Delete case"
    />
  ),
}

/**
 * Work in flight: the confirm button holds its width and shows a spinner.
 *
 * **And it refuses a second press.** An analyst who does not see the spinner
 * presses again, and a delete confirmed twice is the defect that makes a
 * destructive dialog dangerous rather than merely slow.
 */
export const Pending: Story = {
  parameters: frame('300px'),
  args,
  render: () => (
    <Demo
      startOpen
      open="Delete case (in flight)"
      tone="destructive"
      isPending
      title="Delete this case?"
      consequence="This removes the case for everyone on this install."
      confirmLabel="Delete case"
    />
  ),
  play: async ({ canvasElement, step, userEvent }) => {
    await showsAlert(canvasElement, 'Delete this case?')
    const body = within(canvasElement.ownerDocument.body)
    const alert = await body.findByRole('alertdialog')

    // **Not by name.** A pending button hides its label behind a spinner, so
    // the accessible name is not the one the caller passed -- which is itself
    // worth knowing for anything querying a control mid-write.
    const buttons = within(alert).getAllByRole('button')
    const confirm = buttons.at(-1)!

    await step('The confirm says it is working', async () => {
      await expect(confirm).toHaveAttribute('aria-disabled', 'true')
    })

    await step('And pressing it again does nothing', async () => {
      await userEvent.click(confirm)
      await expect(await body.findByRole('alertdialog')).toBeInTheDocument()
    })
  },
}

/**
 * **The named way out, which is the half this tier can settle.**
 *
 * Cancel closes the dialog, and the dialog announces itself as an `alertdialog`
 * -- the role a screen reader uses to say this is a decision rather than a
 * panel that can be waved away.
 *
 * **The refusal itself is not assertable here, measured rather than assumed.**
 * With `isDismissable` and keyboard dismissal both turned back on, neither a
 * synthesised Escape nor a synthesised click on the scrim closes this overlay
 * in this harness. So an assertion that the dialog survives them passes for a
 * dismissable dialog too, and proves nothing. What holds the refusal is the
 * pair of props and a person trying it.
 */
export const TheWayOut: Story = {
  parameters: frame('300px'),
  args,
  render: () => (
    <Demo
      startOpen
      open="Publish report"
      title="Publish this report?"
      consequence="Everyone on the case sees it, and the version is fixed."
      confirmLabel="Publish"
    />
  ),
  play: async ({ canvasElement, step, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body)

    await step('It announces as a decision', async () => {
      await expect(await body.findByRole('alertdialog')).toBeInTheDocument()
    })

    await step('Cancel closes it', async () => {
      await userEvent.click(body.getByRole('button', { name: 'Cancel' }))
      await waitFor(() => {
        void expect(body.queryByRole('alertdialog')).not.toBeInTheDocument()
      })
    })
  },
}
