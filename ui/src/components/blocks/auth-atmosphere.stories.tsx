import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

import { AuthBeats, AuthAtmosphere } from './auth-atmosphere'

/**
 * The wide half of the unauthenticated frame.
 */
const meta = {
  title: 'Blocks/Auth/Atmosphere',
  component: AuthAtmosphere,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof AuthAtmosphere>

export default meta
type Story = StoryObj<typeof meta>

/** The field and its two washes, carrying nothing. */
export const Bare: Story = {
  name: 'Nothing said over it',
  render: (args) => (
    <div className="flex h-screen">
      <AuthAtmosphere {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    // Two washes over a field, and every one of them hidden from the
    // accessibility tree: it is atmosphere, and a screen reader announcing it
    // would read decoration to somebody trying to sign in.
    const pane = canvasElement.querySelector('section')!
    for (const layer of pane.querySelectorAll(':scope > div')) {
      await expect(layer.getAttribute('aria-hidden')).toBe('true')
    }
  },
}

/** With copy, which anchors to the pane's foot at 44ch. */
export const Speaking: Story = {
  name: 'Carrying a line',
  render: (args) => (
    <div className="flex h-screen">
      <AuthAtmosphere {...args}>Untangling the intrusion is the hard part.</AuthAtmosphere>
    </div>
  ),
  play: async ({ canvas, canvasElement }) => {
    const said = canvas.getByText('Untangling the intrusion is the hard part.')
    const pane = canvasElement.querySelector('section')!.getBoundingClientRect()
    const box = said.getBoundingClientRect()

    // Anchored to the foot of the pane rather than centred in it, and held to
    // a reading measure. A line set across the whole of a wide pane is one
    // the eye loses its place in.
    await expect(pane.bottom - box.bottom).toBeLessThan(pane.height / 5)
    await expect(box.width).toBeLessThan(pane.width)
  },
}

/**
 * Copy that arrives a line at a time.
 */
export const Beats: Story = {
  name: 'Copy arriving a line at a time',
  render: (args) => (
    <div className="flex h-screen">
      <AuthAtmosphere {...args}>
        <AuthBeats
          lines={['Untangling the intrusion is the hard part.', 'The report should not be.']}
        />
      </AuthAtmosphere>
    </div>
  ),
  play: async ({ canvas }) => {
    // The second line waits out the first, so the pause between them stays a
    // pause whatever the copy is changed to. Both arrive; what is asserted
    // here is that the second is not dropped by the wait.
    await expect(
      await canvas.findByText('Untangling the intrusion is the hard part.'),
    ).toBeInTheDocument()
    await expect(await canvas.findByText('The report should not be.')).toBeInTheDocument()
  },
}
