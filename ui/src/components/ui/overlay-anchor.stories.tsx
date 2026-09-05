import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor } from 'storybook/test'
import { MenuTrigger } from 'react-aria-components'

import { Menu, MenuItem } from './menu'
import { OverlayAnchor } from './overlay-anchor'

/**
 * A box an overlay opens against, at coordinates the caller owns.
 */
const meta = {
  title: 'Components/OverlayAnchor',
  component: OverlayAnchor,
  parameters: { layout: 'centered' },
  args: { label: 'WKS-FIN01', at: { left: 0, top: 0 } },
} satisfies Meta<typeof OverlayAnchor>

export default meta
type Story = StoryObj<typeof meta>

/**
 * A menu opening against a point inside the pane.
 */
export const Anchored: Story = {
  name: 'An overlay at a point',
  render: (args) => {
    function Frame() {
      const [open, setOpen] = useState(false)
      return (
        <div className="relative size-72 rounded-md border border-border bg-card">
          <button
            type="button"
            className="absolute left-40 top-24 size-4 rounded-full bg-primary"
            aria-label="A shape in the pane"
            onClick={() => {
              setOpen(true)
            }}
          />
          <MenuTrigger isOpen={open} onOpenChange={setOpen}>
            <OverlayAnchor {...args} at={{ left: 160, top: 96, width: 16, height: 16 }} />
            <Menu aria-label="More for WKS-FIN01">
              <MenuItem id="open">Open in Assets</MenuItem>
              <MenuItem id="hide">Hide Assets</MenuItem>
            </Menu>
          </MenuTrigger>
        </div>
      )
    }
    return <Frame />
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'A shape in the pane' }))
    // **Queried off the document, not the story's own element.** The overlay
    // is portalled to the body, so a canvas-scoped query looks in the one
    // place it is not.
    await waitFor(() => {
      void expect(document.querySelector('[role="menu"]')).not.toBeNull()
    })
    void expect(
      [...document.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent),
    ).toContain('Open in Assets')
  },
}

/** Shut: the anchor is in the tree and draws nothing. */
export const Idle: Story = {
  name: 'Nothing open',
  render: (args) => (
    <div className="relative size-40 rounded-md border border-border bg-card">
      <OverlayAnchor {...args} at={{ left: 20, top: 20 }} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const anchor = canvasElement.querySelector('[data-slot="overlay-anchor"]')
    await expect(anchor).not.toBeNull()
    // Never tabbed to: whatever the anchor stands for carries the keyboard.
    await expect(anchor).toHaveAttribute('tabindex', '-1')
  },
}
