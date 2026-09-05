import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, screen } from 'storybook/test'

import { Button } from './button'
import { Sheet } from './sheet'

/**
 * A panel that slides in from an edge, for where a dialog would be too small
 * and a page too much.
 *
 * `side` decides which edge it is fixed to, and nothing else differs between
 * the three. A bottom sheet is capped at 80vh, so it stops short of becoming a
 * full-screen page with a scrim behind it -- at that point it is a dialog.
 *
 * It is dismissable, like `Dialog` and unlike `AlertDialog`: a panel holding
 * something to read may be waved away.
 */
const meta = {
  title: 'Components/Sheet',
  component: Sheet,
  parameters: { layout: 'centered' },
  args: {
    title: 'Evidence',
    description: 'Everything attached to this entry.',
    side: 'right',
    children: (
      <p className="text-sm text-ink-muted">
        Three files, collected 2026-08-20. Hashes match the manifest.
      </p>
    ),
  },
  render: (args) => <Sheet {...args} defaultOpen />,
} satisfies Meta<typeof Sheet>

export default meta
type Story = StoryObj<typeof meta>

function Demo({
  side,
  startOpen = false,
}: {
  side: 'right' | 'left' | 'bottom'
  startOpen?: boolean
}) {
  const [open, setOpen] = useState(startOpen)
  return (
    <>
      <Button
        variant="outline"
        onPress={() => {
          setOpen(true)
        }}
      >
        Open from {side}
      </Button>
      <Sheet
        side={side}
        isOpen={open}
        onOpenChange={setOpen}
        title="Evidence"
        description="Everything attached to this entry."
        onClose={() => {
          setOpen(false)
        }}
      >
        <p className="text-sm text-ink-muted">
          Three files, collected 2026-08-20. Hashes match the manifest.
        </p>
      </Sheet>
    </>
  )
}

/** Its own docs frame, `height` tall, so a modal panel can arrive open. */
function frame(height: string) {
  return { docs: { story: { inline: false, height } } }
}

/**
 * Which edge the panel is fixed to, measured against the viewport.
 *
 * **This is the whole of what `side` changes**, and a sheet that lost it slides
 * in from somewhere else and still looks like a sheet. A fraction of a pixel is
 * allowed for a fractional viewport.
 */
async function hugs(root: HTMLElement, edge: 'right' | 'left' | 'bottom') {
  const panel = (await screen.findByRole('dialog')).getBoundingClientRect()
  const view = root.ownerDocument.documentElement

  if (edge === 'right') {
    await expect(panel.right).toBeGreaterThanOrEqual(view.clientWidth - 1)
    await expect(panel.left).toBeGreaterThan(0)
  }
  if (edge === 'left') {
    await expect(panel.left).toBeLessThanOrEqual(1)
    await expect(panel.right).toBeLessThan(view.clientWidth)
  }
  if (edge === 'bottom') {
    await expect(panel.bottom).toBeGreaterThanOrEqual(view.clientHeight - 1)
    await expect(panel.top).toBeGreaterThan(0)
  }
}

/** From the right, the default. */
export const Right: Story = {
  parameters: frame('420px'),
  render: () => <Demo side="right" startOpen />,
  play: async ({ canvasElement }) => {
    await hugs(canvasElement, 'right')
  },
}

/** From the left. */
export const Left: Story = {
  parameters: frame('420px'),
  render: () => <Demo side="left" startOpen />,
  play: async ({ canvasElement }) => {
    await hugs(canvasElement, 'left')
  },
}

/**
 * From the bottom, capped at 80vh.
 *
 * The cap is what stops a tall sheet becoming a full-screen page with a scrim
 * behind it, which is a dialog rather than a sheet.
 */
export const Bottom: Story = {
  // Taller than the side panels: the cap is a fraction of the frame, so a
  // short frame shows a sheet filling it rather than one stopping at 80vh.
  parameters: frame('560px'),
  render: () => <Demo side="bottom" startOpen />,
  play: async ({ canvasElement }) => {
    await hugs(canvasElement, 'bottom')

    const panel = (await screen.findByRole('dialog')).getBoundingClientRect()
    const view = canvasElement.ownerDocument.documentElement.clientHeight
    await expect(panel.height).toBeLessThanOrEqual(view * 0.81)
  },
}

/** Open on mount, so the panel itself is on the page. */
export const Open: Story = {
  parameters: frame('420px'),
  render: () => (
    <Sheet defaultOpen title="Evidence" description="Everything attached to this entry.">
      <p className="text-sm text-ink-muted">
        Three files, collected 2026-08-20. Hashes match the manifest.
      </p>
    </Sheet>
  ),
}

/**
 * Drag the title bar. Past a third of the panel, or with a flick, the sheet is
 * dismissed; anything short of that springs back to the edge it came from.
 *
 * The body is left to scroll on its own -- the gesture starts on the title bar
 * rather than anywhere on the panel, or a scroll would throw the sheet away.
 */
export const Throwable: Story = {
  render: () => (
    <div className="flex gap-2">
      <Demo side="bottom" />
      <Demo side="right" />
    </div>
  ),
}
