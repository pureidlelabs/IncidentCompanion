import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import { FileSlot } from './file-slot'

/**
 * One file, chosen or not yet.
 */
const meta = {
  title: 'Blocks/Form/File slot',
  component: FileSlot,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof FileSlot>

export default meta
type Story = StoryObj<typeof meta>

/** A file the picker will take. Its bytes are never read; its name is. */
function someFile(name = 'wks-fin01-kape.zip'): File {
  return new File(['PK'], name, { type: 'application/zip' })
}

/** Nothing held yet: the zone asks, and the button is the keyboard's way in. */
export const Empty: Story = {
  name: 'Waiting for a file',
  args: {
    file: null,
    onFile: () => undefined,
    label: 'Drop the collected file here',
    description: 'Without one the record reads as promised.',
  },
}

/** Held: the name, and the way to take it back. */
export const Holding: Story = {
  name: 'A file chosen',
  args: { ...Empty.args, file: someFile() },
}

/**
 * A name past the width it has.
 */
export const Overlong: Story = {
  name: 'A name too long for the row',
  args: {
    ...Empty.args,
    file: someFile('WKS-FIN01 KAPE triage collection, full targets plus memory capture, second pass.zip'),
  },
}

/**
 * Both states, driven.
 */
export const Live: Story = {
  name: 'Choosing, then taking it back',
  render: function Rendered(args) {
    const [file, setFile] = useState<File | null>(null)
    return <FileSlot {...args} file={file} onFile={setFile} />
  },
  args: { ...Empty.args },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const input = canvasElement.querySelector('input[type="file"]')
    if (!(input instanceof HTMLInputElement)) throw new Error('no file input in the drop zone')

    await userEvent.upload(input, someFile())
    await waitFor(async () => {
      await expect(canvas.getByText('wks-fin01-kape.zip')).toBeInTheDocument()
    })

    await userEvent.click(canvas.getByRole('button', { name: 'Remove wks-fin01-kape.zip' }))
    await waitFor(async () => {
      await expect(canvas.getByRole('button', { name: 'Choose a file' })).toBeInTheDocument()
    })
  },
}
