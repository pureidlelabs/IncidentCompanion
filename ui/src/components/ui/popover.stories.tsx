import type { Meta, StoryObj } from '@storybook/react-vite'
import { DialogTrigger } from 'react-aria-components'
import { expect, screen, waitFor } from 'storybook/test'

import { Button } from './button'
import { Popover } from './popover'

/**
 * The floating panel a trigger opens, anchored and dismissed by React Aria.
 *
 * **It is placed at the document, not inside its trigger**, so a query for
 * anything in it reaches the whole page. Every story that opens one renders in
 * its own docs frame, since the autodocs page draws every story into one
 * document and a panel would be laid over its neighbours.
 *
 * The offset from the trigger is 8px, or 12px with a pointer -- the extra four
 * being the pointer itself, so the panel's edge sits where it did. A caller
 * setting `offset` takes both.
 *
 * `MenuTrigger` supplies its own offset through context, because a menu is
 * anchored to the trigger's box rather than off an anchor.
 */
const meta = {
  title: 'Components/Popover',
  component: Popover,
  parameters: { layout: 'centered' },
  args: { children: null },
  render: (args) => (
    <DialogTrigger defaultOpen>
      <Button variant="outline">Details</Button>
      <Popover {...args}>{body}</Popover>
    </DialogTrigger>
  ),
} satisfies Meta<typeof Popover>

export default meta
type Story = StoryObj<typeof meta>

/** Its own docs frame, `height` tall, so the panel can arrive open. */
function frame(height: string) {
  return { docs: { story: { inline: false, height } } }
}

const body = (
  <div className="w-64 p-3 text-sm">
    <p className="font-medium">E2E-0001</p>
    <p className="text-ink-muted">Opened 2026-08-20 by Dev Analyst.</p>
  </div>
)

/**
 * Anchored to its trigger, open.
 *
 * The `play` measures the anchoring rather than trusting it: a panel that
 * stopped being positioned lands at the top left of the document and looks like
 * a layout fault rather than a broken anchor.
 */
export const Default: Story = {
  parameters: frame('260px'),
  render: () => (
    <DialogTrigger defaultOpen>
      <Button variant="outline">Details</Button>
      <Popover>{body}</Popover>
    </DialogTrigger>
  ),
  play: async ({ canvas }) => {
    const trigger = canvas.getByRole('button', { name: 'Details' }).getBoundingClientRect()
    const panel = (await screen.findByRole('dialog')).getBoundingClientRect()

    // Below the trigger and overlapping it horizontally: an unanchored panel
    // sits at the document's origin, which is neither.
    await expect(panel.top).toBeGreaterThan(trigger.top)
    await expect(panel.left).toBeLessThan(trigger.right)
    await expect(panel.right).toBeGreaterThan(trigger.left)
  },
}

/**
 * Opened from the trigger rather than arriving open, which is how an analyst
 * meets it.
 */
export const OpensFromItsTrigger: Story = {
  parameters: frame('260px'),
  render: () => (
    <DialogTrigger>
      <Button variant="outline">Details</Button>
      <Popover>{body}</Popover>
    </DialogTrigger>
  ),
  play: async ({ canvas, step, userEvent }) => {
    await step('Closed to begin with', async () => {
      await expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    await step('The trigger opens it', async () => {
      await userEvent.click(canvas.getByRole('button', { name: 'Details' }))
      await expect(await screen.findByRole('dialog')).toBeInTheDocument()
    })

    await step('And the trigger closes it again', async () => {
      await userEvent.click(canvas.getByRole('button', { name: 'Details' }))
      await waitFor(() => {
        void expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })
    })
  },
}

/**
 * With the pointer, which adds 4px to the offset so the panel's edge stays
 * where it was.
 */
export const WithArrow: Story = {
  parameters: frame('260px'),
  render: () => (
    <DialogTrigger defaultOpen>
      <Button variant="outline">Details</Button>
      <Popover showArrow>{body}</Popover>
    </DialogTrigger>
  ),
  play: async ({ canvas }) => {
    const trigger = canvas.getByRole('button', { name: 'Details' }).getBoundingClientRect()
    const panel = (await screen.findByRole('dialog')).getBoundingClientRect()

    // Further off the trigger than the plain one, which is the whole of what
    // the pointer costs.
    await expect(panel.top - trigger.bottom).toBeGreaterThan(8)
  },
}

/**
 * A panel holding far more than fits, which is where the scroller matters.
 *
 * Without the pointer the panel scrolls its own content; with one it cannot,
 * because a clipped pointer is worse than a tall panel.
 */
export const Overflowing: Story = {
  parameters: frame('420px'),
  render: () => (
    <DialogTrigger defaultOpen>
      <Button variant="outline">Details</Button>
      <Popover>
        <div className="w-64 p-3 text-sm">
          {Array.from({ length: 30 }, (_, index) => (
            <p key={index} className="text-ink-muted">
              Session {String(index).padStart(3, '0')} revoked at 05:02 UTC.
            </p>
          ))}
        </div>
      </Popover>
    </DialogTrigger>
  ),
}
