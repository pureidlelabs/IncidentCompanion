import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'

import { Button } from '@/components/ui/button'

import { ImportCaseScreen } from './import-case'

/**
 * The picker's second door: an archive becomes a new case.
 *
 * Drawn open, because this surface only exists open. The last story is the one
 * that presses the door.
 */
const meta = {
  title: 'Screens/System/Import a case',
  component: ImportCaseScreen,
  parameters: { layout: 'fullscreen' },
  args: { isOpen: true, onOpenChange: fn() },
} satisfies Meta<typeof ImportCaseScreen>

export default meta
type Story = StoryObj<typeof meta>

/** No archive chosen, so there is nothing to send. */
export const JustOpened: Story = {
  name: 'Nothing chosen yet',
  play: async () => {
    const dialog = await waitFor(() => {
      const found = document.querySelector('[role="dialog"]')
      void expect(found).not.toBeNull()
      return found as HTMLElement
    })
    const panel = within(dialog)
    // Import with no file is the one control here that must refuse.
    void expect(panel.getByRole('button', { name: 'Import' })).toBeDisabled()
  },
}

/** The archive is in flight, and nothing can be sent twice. */
export const Sending: Story = {
  name: 'The archive in flight',
  args: { busy: true },
}

/**
 * The server refused, and said why.
 *
 * An encrypted archive is only known to be encrypted by the server, so this is
 * the state an analyst reaches by sending one without a passphrase. Nothing
 * they chose is cleared.
 */
export const Refused: Story = {
  name: 'The server refused',
  args: { problem: 'This archive is encrypted. Enter its passphrase and import it again.' },
  play: async () => {
    const dialog = await waitFor(() => {
      const found = document.querySelector('[role="dialog"]')
      void expect(found).not.toBeNull()
      return found as HTMLElement
    })
    // The field's own hint says "encrypted" too, so the refusal is matched on
    // what only it says.
    void expect(within(dialog).getByText(/Enter its passphrase/)).toBeInTheDocument()
  },
}

/**
 * Choosing an archive and sending it, which is the whole seam.
 *
 * The passphrase is absent from what leaves when nothing was typed: an empty
 * one is not a passphrase, and sending it would ask the server to decrypt with
 * the empty string.
 */
export const Sends: Story = {
  name: 'Choosing an archive and sending it',
  args: { writes: { start: fn() } },
  play: async ({ args }) => {
    const dialog = await waitFor(() => {
      const found = document.querySelector('[role="dialog"]')
      void expect(found).not.toBeNull()
      return found as HTMLElement
    })
    const panel = within(dialog)
    const archive = new File(['not really an archive'], 'handover.iccase')
    const picker = dialog.querySelector('input[type="file"]')
    void expect(picker).not.toBeNull()
    await userEvent.upload(picker as HTMLInputElement, archive)
    const send = panel.getByRole('button', { name: 'Import' })
    await waitFor(() => {
      void expect(send).toBeEnabled()
    })
    await userEvent.click(send)
    void expect(args.writes?.start).toHaveBeenCalledWith({ file: archive })
  },
}

/**
 * Both doors of the dialog: opened by a press, shut by Escape.
 *
 * The other stories here hand the dialog an `isOpen` the story fixes, which is
 * the only way to draw its inner states. This one gives the flag to a caller
 * instead, because opening and dismissing are the halves those stories cannot
 * reach -- and a dialog that opens and will not close is a trap rather than a
 * screen.
 *
 * `isOpen` seeds that caller, so the Controls panel still decides whether the
 * story starts open.
 */
export const AsTheAppOpensIt: Story = {
  name: 'Opened over the picker',
  args: { isOpen: false },
  render: (args) => {
    function Controlled() {
      const [open, setOpen] = useState(args.isOpen)
      return (
        <>
          <Button
            variant="outline"
            onPress={() => {
              setOpen(true)
            }}
          >
            Import a case
          </Button>
          <ImportCaseScreen {...args} isOpen={open} onOpenChange={setOpen} />
        </>
      )
    }
    return <Controlled />
  },
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement)
    const body = within(document.body)
    await step('nothing is open until something opens it', async () => {
      await expect(body.queryByRole('dialog')).toBeNull()
    })
    await step('the press opens it', async () => {
      await userEvent.click(canvas.getByRole('button', { name: 'Import a case' }))
      await expect(await body.findByRole('dialog')).toBeInTheDocument()
    })
    await step('and Escape gives it back, rather than trapping the analyst', async () => {
      await userEvent.keyboard('{Escape}')
      await waitFor(async () => {
        await expect(body.queryByRole('dialog')).toBeNull()
      })
    })
  },
}
