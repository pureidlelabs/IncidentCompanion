import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import * as Y from 'yjs'

import { ProseUnsaved } from './prose-unsaved'

/**
 * Words the install holds unsaved. The banner stands while a save is failing
 * and nothing is locked; the dialog comes once the words are given up.
 */
const meta = {
  title: 'Blocks/Prose/Unsaved',
  component: ProseUnsaved,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof ProseUnsaved>

export default meta
type Story = StoryObj<typeof meta>

/** Only what this draws from: the state, its subscription and the document the copy is taken from. */
function channel(unsaved: 'unsaved' | 'lost') {
  const doc = new Y.Doc()
  const paragraph = new Y.XmlElement('paragraph')
  paragraph.insert(0, [
    new Y.XmlText(
      'Mailbox rule created on the CFO account at 09:14, forwarding to an external address.',
    ),
  ])
  doc.getXmlFragment('note').insert(0, [paragraph])
  // Nothing here changes it, so the subscription has nothing to call.
  return { doc, unsaved, watchUnsaved: () => () => undefined } as never
}

/** A save failed; the install holds the words and tries again. */
export const Unsaved: Story = {
  args: { channel: channel('unsaved') },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent('Not saved yet')
    await expect(canvas.getByRole('button', { name: /Copy the text/ })).toBeVisible()
  },
}

/** The words can no longer be stored, and the analyst is told once, in a dialog. */
export const GivenUp: Story = {
  args: { channel: channel('lost') },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body)
    await expect(await page.findByRole('dialog')).toHaveTextContent(
      'This text can no longer be saved',
    )
  },
}
