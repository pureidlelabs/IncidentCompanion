import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, waitFor, within } from 'storybook/test'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
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

/**
 * The analyst goes to leave while the words are unsaved. Drawn in a router of
 * its own, since the question is asked on a change of route.
 */
export const Leaving: Story = {
  args: { channel: channel('unsaved') },
  render: (args) => {
    const router = createMemoryRouter(
      [
        { path: '/notes', element: <ProseUnsaved {...args} /> },
        { path: '/elsewhere', element: <p>Elsewhere</p> },
      ],
      { initialEntries: ['/notes'] },
    )
    void Promise.resolve().then(() => router.navigate('/elsewhere'))
    return <RouterProvider router={router} />
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body)
    const dialog = await page.findByRole('dialog')
    await expect(dialog).toHaveTextContent('Leave with the text unsaved?')
    // After the dialog's entrance, which starts it transparent.
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: /Copy the text/ })).toBeVisible(),
    )
  },
}
