import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { userEvent, within } from 'storybook/test'

import { Button } from '@/components/ui/button'

import type { SystemEntry } from '@/api/model'
import { formSpec } from '@/api/specs'
import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

import { ImportCsvDialog } from '@/components/blocks/import-csv-dialog'

const form = formSpec<SystemEntry>(specsFixture, 'SYSTEM_FIELDS')

/**
 * A CSV with one duplicate of a real campaign-case hostname, one clean row and
 * one row a select-kind field refuses - the three states the preview grid
 * draws at once.
 */
const FIXTURE_CSV = [
  'hostname,system_type,zone',
  `${campaignCase.systems[0]?.hostname ?? 'PC-1'},desktop,external`,
  'PC-NEW,desktop,external',
  'PC-BAD,not-a-real-type,external',
].join('\r\n')

/**
 * The file input React Aria's `FileTrigger` renders under the button.
 */
async function uploadFixture(canvasElement: HTMLElement) {
  const input = canvasElement.ownerDocument.body.querySelector('input[type="file"]')
  if (!(input instanceof HTMLInputElement)) throw new Error('no file input in this story')
  const file = new File([FIXTURE_CSV], 'systems.csv', { type: 'text/csv' })
  await userEvent.upload(input, file)
}

/** The CSV import dialog, previewing a clean row, a duplicate hostname and a row a select field refuses. */
const meta = {
  title: 'Blocks/Overlay/Import CSV',
  component: ImportCsvDialog,
  parameters: { layout: 'fullscreen' },
  args: {
    // Shut by default, and `frame` is what opens it per story: a docs page
    // renders every story into one document, and this dialog is modal -- four
    // open there at once cannot be dismissed.
    open: false,
    onOpenChange: () => undefined,
    collection: 'systems',
    form,
    existing: campaignCase.systems,
    importing: false,
    errorRow: null,
    errorMessage: null,
    onSubmit: () => undefined,
  },
  decorators: [
    (Story, context) => {
      const [open, setOpen] = useState(context.parameters.startOpen === true)
      return (
        <>
          <Button variant="outline" onPress={() => { setOpen(true) }}>
            Import a CSV
          </Button>
          <Story args={{ ...context.args, open, onOpenChange: setOpen }} />
        </>
      )
    },
  ],
} satisfies Meta<typeof ImportCsvDialog<SystemEntry>>

/** Presses the decorator's trigger, so the modal exists before a `play` reaches into it. */
async function openDialog(canvasElement: HTMLElement) {
  await userEvent.click(within(canvasElement).getByRole('button', { name: 'Import a CSV' }))
}

export default meta
type Story = StoryObj<typeof meta>

/**
 * Its own docs frame, `height` tall. `startOpen` is for the one story with no
 * `play` to press the trigger for it.
 */
function frame(height: string, startOpen = false) {
  return { startOpen, docs: { story: { inline: false, height } } }
}

/**
 * The dialog before a file is chosen: a drop zone and nothing to preview.
 */
export const Empty: Story = {
  parameters: frame('824px', true),
  name: 'Before a file is chosen',
  play: async ({ canvasElement }) => {
    // The one story with nothing to upload, so nothing else in this file
    // would notice `startOpen` going unhonoured.
    await within(canvasElement.ownerDocument.body).findByRole('dialog')
  },
}

/**
 * The preview, which is the whole point of the dialog: what would be written,
 * before anything is.
 */
export const PreviewWithProblemsAndDuplicates: Story = {
  parameters: frame('824px'),
  name: 'Preview \u2014 a duplicate, a vocabulary problem, one clean row',
  play: async ({ canvasElement }) => {
    await openDialog(canvasElement)
    await uploadFixture(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    await body.findByText('Probable duplicate')
  },
}

/**
 * The write in flight, where the confirm says what is happening and refuses a
 * second press.
 */
export const Importing: Story = {
  parameters: frame('824px'),
  name: 'Import in flight',
  args: { importing: true },
  play: async ({ canvasElement }) => {
    await openDialog(canvasElement)
    await uploadFixture(canvasElement)
    // The submit button's own label is the one thing only `importing: true`
    // produces - `uploadFixture` succeeding is not itself evidence this
    // story's own arg reached the screen.
    await within(canvasElement.ownerDocument.body).findByRole('button', { name: 'Importing\u2026' })
  },
}

/**
 * The server refused one row, and the dialog says which.
 */
export const ServerRefusedOneRow: Story = {
  parameters: frame('824px'),
  name: 'A row-N refusal, highlighted after submit',
  args: {
    errorRow: 1,
    errorMessage: "row 2: SystemEntry has no field 'nope'",
  },
  /**
   * **Asserts the highlight, not the message.**
   */
  play: async ({ canvasElement }) => {
    await openDialog(canvasElement)
    await uploadFixture(canvasElement)
    const canvas = within(canvasElement.ownerDocument.body)
    const flaggedRow = (await canvas.findByText('PC-NEW')).closest('tr')
    if (!flaggedRow) throw new Error('PC-NEW never reached a table row')
    if (!flaggedRow.className.includes('bg-destructive/10')) {
      throw new Error(`row 2 was not painted as the refused row: ${flaggedRow.className}`)
    }
  },
}
