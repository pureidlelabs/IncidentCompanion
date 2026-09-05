import type { Meta, StoryObj } from '@storybook/react-vite'

import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import { ApiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import {
  ConfirmDeleteDialog,
  type ConfirmDeleteDialogProps,
} from '@/components/blocks/confirm-delete-dialog'

/**
 * `ConfirmDeleteDialog` on the React Aria kit: one row, several, a slow delete,
 * and the two refusals it has to keep the dialog open for.
 */
const meta = {
  title: 'Blocks/Overlay/Confirm delete',
  component: ConfirmDeleteDialog,
  parameters: { layout: 'centered' },
  args: {
    ids: ['a'],
    onOpenChange: () => undefined,
    // Typed wide, so a story may hand back a promise.
    onConfirm: ((): unknown => undefined),
    title: (count: number) => `Delete ${String(count)} row${count === 1 ? '' : 's'}?`,
    consequence: 'The rows are removed from the case. This cannot be undone.',
  },
} satisfies Meta<typeof ConfirmDeleteDialog>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The trigger and the dialog it raises, on `rows` rows.
 */
function Demo({
  rows,
  label,
  onConfirm,
  startOpen = false,
}: {
  rows: number
  label: string
  onConfirm: ConfirmDeleteDialogProps['onConfirm']
  startOpen?: boolean
}) {
  const rowIds = Array.from({ length: rows }, (_, at) => `row-${String(at)}`)
  const [ids, setIds] = useState<string[] | null>(startOpen ? rowIds : null)
  return (
    <>
      <Button
        variant="destructive"
        onPress={() => {
          setIds(rowIds)
        }}
      >
        {label}
      </Button>
      <ConfirmDeleteDialog
        ids={ids}
        onOpenChange={(open) => {
          if (!open) setIds(null)
        }}
        onConfirm={onConfirm}
        title={(count) => `Delete ${String(count)} row${count === 1 ? '' : 's'}?`}
        consequence="The rows are removed from the case. This cannot be undone."
      />
    </>
  )
}

/** A refusal naming two rows that other entries still reference. */
function referenceRefusal() {
  return new ApiError(409, 'Rows are still referenced.', {
    references: { a: 1, b: 3 },
  })
}

/** Its own docs frame, `height` tall, so a modal can arrive open. */
function frame(height: string) {
  return { docs: { story: { inline: false, height } } }
}

/** Presses Delete, which is the only way to reach a pending or refused state. */
async function confirm(canvasElement: HTMLElement) {
  const body = within(canvasElement.ownerDocument.body)
  await userEvent.click(await body.findByRole('button', { name: 'Delete' }))
}

/** One row, and the title says one rather than counting in the plural. */
export const OneRow: Story = {
  name: 'One row',
  parameters: frame('300px'),
  render: () => <Demo rows={1} label="Delete one row" onConfirm={() => undefined} startOpen />,
  play: async ({ canvasElement, step }) => {
    const body = within(canvasElement.ownerDocument.body)

    await step('The title counts what is selected', async () => {
      await expect(await body.findByRole('alertdialog')).toHaveTextContent('Delete 1 row?')
    })

    // Waited for rather than read at once: the dialog slides in, so the line is
    // in the document a frame before it is painted.
    await step('And says what cannot be undone', async () => {
      await waitFor(() => {
        void expect(body.getByText(/This cannot be undone/)).toBeInTheDocument()
      })
    })
  },
}

/** Four rows, through the same function: the plural is the composition's. */
export const SeveralRows: Story = {
  name: 'Several rows',
  parameters: frame('300px'),
  render: () => <Demo rows={4} label="Delete four rows" onConfirm={() => undefined} startOpen />,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)

    await expect(await body.findByRole('alertdialog')).toHaveTextContent('Delete 4 rows?')
  },
}

/**
 * A slow delete, where the dialog has to hold every way out.
 */
export const InFlight: Story = {
  name: 'Delete in flight \u2014 confirm blocked',
  parameters: frame('300px'),
  render: () => (
    <Demo
      rows={2}
      label="Delete, slowly"
      onConfirm={() => new Promise(() => undefined)}
      startOpen
    />
  ),
  play: async ({ canvasElement, step }) => {
    const body = within(canvasElement.ownerDocument.body)
    await confirm(canvasElement)

    // Scoped to the dialog: the trigger behind it is destructive too and reads
    // as `Delete, slowly`, so a query over the page finds it first.
    const dialog = within(await body.findByRole('alertdialog'))

    // The hold is `aria-disabled` rather than the native attribute -- React
    // Aria's pending button keeps focus while refusing the press -- so
    // `toBeDisabled` reports it as live.
    await step('The confirm is held, and says what is happening', async () => {
      await waitFor(() => {
        void expect(dialog.getByRole('button', { name: /Deleting/ })).toHaveAttribute(
          'aria-disabled',
          'true',
        )
      })
    })

    // The way out is held with it, because it cannot stop a request already on
    // its way to the server. The scrim and Escape are refused by the alert
    // dialog itself, so while the delete runs there is no route out that lies.
    await step('And so is the way out', async () => {
      await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    })

    await step('And the dialog is still standing', async () => {
      await expect(body.getByRole('alertdialog')).toBeInTheDocument()
    })
  },
}

/**
 * The refusal this dialog exists for: rows other entries still point at.
 */
export const RefusedByReferences: Story = {
  name: 'Refused \u2014 rows referenced elsewhere',
  parameters: frame('300px'),
  render: () => (
    <Demo
      rows={2}
      label="Delete rows other entries hold"
      onConfirm={() => Promise.reject(referenceRefusal())}
      startOpen
    />
  ),
  play: async ({ canvasElement, step }) => {
    const body = within(canvasElement.ownerDocument.body)
    await confirm(canvasElement)

    await step('The dialog stays open through the refusal', async () => {
      await waitFor(() => {
        void expect(body.getByRole('alertdialog')).toBeInTheDocument()
      })
    })

    // Counted from the reference check rather than read out of the message, so
    // the sentence is the same whatever the server phrased its refusal as.
    await step('And says how many rows are held, not what the server said', async () => {
      await waitFor(() => {
        void expect(
          body.getByText('2 of the selected rows are still referenced elsewhere in the case.'),
        ).toBeInTheDocument()
      })
    })

    await step('And the way out is usable again', async () => {
      await expect(
        within(body.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }),
      ).toBeEnabled()
    })
  },
}

/**
 * A refusal with nothing to count, where the server's own words are the
 * message.
 */
export const RefusedPlainly: Story = {
  name: 'Refused \u2014 the server\u2019s own message',
  parameters: frame('300px'),
  render: () => (
    <Demo
      rows={1}
      label="Delete on a read-only case"
      onConfirm={() => Promise.reject(new ApiError(403, 'This case is read-only.', {}))}
      startOpen
    />
  ),
  play: async ({ canvasElement, step }) => {
    const body = within(canvasElement.ownerDocument.body)
    await confirm(canvasElement)

    await step('The server\u2019s own words reach the analyst', async () => {
      await waitFor(() => {
        void expect(body.getByText('This case is read-only.')).toBeInTheDocument()
      })
    })

    await step('And the dialog is still there to read them in', async () => {
      await expect(body.getByRole('alertdialog')).toBeInTheDocument()
    })
  },
}

/**
 * A selection nobody counted before pressing delete.
 */
export const TooMuchData: Story = {
  name: 'Four hundred rows',
  parameters: frame('300px'),
  render: () => (
    <Demo rows={400} label="Delete four hundred rows" onConfirm={() => undefined} startOpen />
  ),
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    const dialog = await body.findByRole('alertdialog')

    await expect(dialog).toHaveTextContent('Delete 400 rows?')
    // The dialog is a fixed thing over the page: four hundred rows do not make
    // it four hundred rows tall.
    await expect(dialog.getBoundingClientRect().height).toBeLessThan(400)
  },
}
