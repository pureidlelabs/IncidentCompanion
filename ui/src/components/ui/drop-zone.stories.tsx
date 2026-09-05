import type { Meta, StoryObj } from '@storybook/react-vite'
import { UploadIcon } from 'lucide-react'
import { useState } from 'react'
import { isFileDropItem } from 'react-aria-components'

import { expect } from 'storybook/test'

import { Button } from './button'
import { DropZone, FileTrigger } from './drop-zone'

/** The target a dragged file is dropped on, with a dashed edge so it never reads as a field already holding a value. */
const meta = {
  title: 'Components/DropZone',
  component: DropZone,
  parameters: { layout: 'centered' },
  args: { label: 'Drop evidence here' },
} satisfies Meta<typeof DropZone>

export default meta
type Story = StoryObj<typeof meta>

/** The zone on its own. Drag anything over it to see the drop state. */
export const Default: Story = {
  args: {
    label: 'Drop evidence here',
    description: 'CSV, JSON or an exported alert.',
  },
  play: async ({ canvas }) => {
    // The zone announces as one, and its label is what says so: a dashed box
    // with text in it is a paragraph to anybody not looking at it.
    const zone = canvas.getByRole('button', { name: /Drop evidence here/ })
    await expect(zone).toBeVisible()

    // What it takes is said before the drop rather than refused after it.
    await expect(canvas.getByText('CSV, JSON or an exported alert.')).toBeVisible()
  },
  render: (args) => (
    <div className="w-96">
      <DropZone {...args} />
    </div>
  ),
}

/** Empty: no description, and the label carries the whole instruction. */
export const LabelOnly: Story = {
  args: { label: 'Drop evidence here' },
  play: async ({ canvas }) => {
    // No description, and no empty line where one would be: the label carries
    // the whole instruction.
    await expect(canvas.getByRole('button', { name: /Drop evidence here/ })).toBeVisible()
    await expect(canvas.queryByText(/CSV, JSON/)).toBeNull()
  },
  render: (args) => (
    <div className="w-96">
      <DropZone {...args} />
    </div>
  ),
}

/**
 * With a `FileTrigger`, which is the keyboard half.
 */
export const WithFileTrigger: Story = {
  args: { label: 'Drop evidence here' },
  play: async ({ canvas }) => {
    // A drop zone alone is unreachable without a pointer, so the pair is the
    // shipping shape rather than an enhancement: there has to be a control
    // the keyboard can reach and press.
    const choose = canvas.getByRole('button', { name: /Choose files/ })
    await expect(choose).toBeVisible()
    await expect(choose).toBeEnabled()

    choose.focus()
    await expect(choose).toHaveFocus()
  },
  render: (args) => (
    <div className="w-96">
      <DropZone {...args} description="CSV, JSON or an exported alert.">
        <FileTrigger allowsMultiple acceptedFileTypes={['text/csv', 'application/json']}>
          <Button variant="outline" size="sm">
            <UploadIcon />
            Choose files
          </Button>
        </FileTrigger>
      </DropZone>
    </div>
  ),
}

/** Disabled. It refuses a drop and takes no focus ring. */
export const Disabled: Story = {
  args: {
    label: 'Drop evidence here',
    description: 'The case is closed.',
    isDisabled: true,
  },
  render: (args) => (
    <div className="w-96">
      <DropZone {...args} />
    </div>
  ),
}

/** What a drop yields: the names React Aria hands back. */
function Accepting() {
  const [names, setNames] = useState<string[]>([])
  return (
    <div className="flex w-96 flex-col gap-2">
      <DropZone
        label="Drop evidence here"
        description="Dropped names are listed below."
        onDrop={(event) => {
          setNames(event.items.filter(isFileDropItem).map((one) => one.name))
        }}
      >
        <FileTrigger
          allowsMultiple
          onSelect={(files) => {
            setNames(files === null ? [] : Array.from(files, (one) => one.name))
          }}
        >
          <Button variant="outline" size="sm">
            <UploadIcon />
            Choose files
          </Button>
        </FileTrigger>
      </DropZone>
      <ul className="text-xs text-ink-muted">
        {names.length === 0 ? <li>Nothing dropped yet.</li> : names.map((one) => <li key={one}>{one}</li>)}
      </ul>
    </div>
  )
}

/**
 * Reads the drop. `isFileDropItem` narrows the items to files.
 */
export const ReadingTheDrop: Story = {
  render: () => <Accepting />,
  play: async ({ canvas, step }) => {
    await step('The zone is reachable and named', async () => {
      const zone = canvas.getByRole('button', { name: /Drop evidence here/ })
      zone.focus()
      await expect(zone).toHaveFocus()
    })

    await step('It says nothing has been dropped rather than showing an empty list', async () => {
      await expect(canvas.getByRole('listitem')).toHaveTextContent('Nothing dropped yet.')
    })

    await step('And the picker inside it is reachable in its own right', async () => {
      await expect(canvas.getByRole('button', { name: /Choose files/ })).toBeEnabled()
    })
  },
}
