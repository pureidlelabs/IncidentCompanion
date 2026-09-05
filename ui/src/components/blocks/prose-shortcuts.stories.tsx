import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { PROSE_KEYS } from './prose-keys'
import { ProseShortcuts, useProseShortcuts } from './prose-shortcuts'

/**
 * Every key the report editor answers, on Cmd slash.
 */
const meta = {
  title: 'Blocks/Report/Prose shortcuts',
  component: ProseShortcuts,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof ProseShortcuts>

export default meta
type Story = StoryObj<typeof meta>

/** Open. Its own document, because an open dialog locks the page's scroll. */
export const Open: Story = {
  parameters: { docs: { story: { inline: false, height: '640px' } } },
  args: { open: true, onOpenChange: () => undefined },
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement.ownerDocument.body)
    let sheet: HTMLElement | undefined
    await waitFor(() => {
      sheet = screen.queryAllByRole('dialog').filter((el) => el.checkVisibility()).at(-1)
      if (sheet === undefined) throw new Error('the sheet never opened')
    })

    // Every key in the table the bindings themselves come from. A key that
    // worked and went unlisted is indistinguishable from one that does not
    // exist, which is the defect this block was written against.
    const listed = within(sheet!)
    for (const key of PROSE_KEYS) {
      await expect(listed.getAllByText(key.label).length).toBeGreaterThan(0)
    }
  },
}

/**
 * Closed, with the key that opens it.
 */
export const OpenedByTheKey: Story = {
  parameters: { docs: { story: { inline: false, height: '640px' } } },
  args: { open: false, onOpenChange: () => undefined },
  render: (args) => {
    const Rendered = () => {
      const [open, setOpen] = useState(args.open)
      useProseShortcuts(() => {
        setOpen((was) => !was)
      })
      return (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-ink-muted">
            Press Cmd slash anywhere in this frame, or use the button.
          </p>
          <Button variant="outline" onPress={() => { setOpen(true) }}>
            Keyboard
          </Button>
          <ProseShortcuts open={open} onOpenChange={setOpen} />
        </div>
      )
    }
    return <Rendered />
  },
  play: async ({ canvasElement, step }) => {
    const screen = within(canvasElement.ownerDocument.body)

    await step('the key opens it from outside any editor', async () => {
      // The listener is on `window` rather than on an editor: somebody who
      // has not found the shortcuts yet is, by definition, not in one.
      await userEvent.keyboard('{Meta>}/{/Meta}')
      await waitFor(() => {
        const sheet = screen.queryAllByRole('dialog').filter((el) => el.checkVisibility()).at(-1)
        if (sheet === undefined) throw new Error('the key did not open the sheet')
      })
    })
  },
}
