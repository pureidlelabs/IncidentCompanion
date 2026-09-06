import type { Meta, StoryObj } from '@storybook/react-vite'
import { Info, Trash2 } from 'lucide-react'
import { expect, screen, waitFor } from 'storybook/test'

import { Button } from './button'
import { Tooltip, TooltipTrigger } from './tooltip'

/**
 * A hint on hover or focus, opened from a `TooltipTrigger` around a focusable
 * control.
 *
 * **Focus opens it, not only the pointer.** A hint reachable only by hovering
 * is one an analyst working from the keyboard never sees, and the icon-only
 * buttons this is usually put on are exactly the ones whose meaning is not
 * otherwise on screen.
 *
 * It is bound to its trigger by `aria-describedby`, so it is announced with the
 * control rather than read as loose text somewhere on the page. That is also
 * why the trigger must be focusable: a tooltip on a `div` describes nothing.
 *
 * **Never put anything interactive in it.** A tooltip closes when focus leaves
 * the trigger, so a link inside one cannot be reached. That is a `HoverCard`.
 */
const meta = {
  title: 'Components/Tooltip',
  component: Tooltip,
  parameters: { layout: 'centered' },
  args: { children: 'Delete this entry' },
  render: (args) => (
    <TooltipTrigger isOpen>
      <Button variant="outline" size="icon" aria-label="Delete">
        <Trash2 />
      </Button>
      <Tooltip {...args} />
    </TooltipTrigger>
  ),
} satisfies Meta<typeof Tooltip>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Its own docs frame, `height` tall.
 *
 * A tooltip open on mount is drawn wherever its trigger is, and on the
 * autodocs page that is one document holding every story - the chips land on
 * the prose belonging to the story above.
 */
function frame(height: string) {
  return { docs: { story: { inline: false, height } } }
}

/**
 * Open on mount, so the surface is on the page rather than behind a hover.
 *
 * The `play` follows the binding: the trigger names the tooltip through
 * `aria-describedby`, which is what puts the hint into the button's
 * announcement instead of leaving it as text beside it.
 */
export const Open: Story = {
  parameters: frame('200px'),
  play: async ({ canvas, canvasElement }) => {
    const trigger = canvas.getByRole('button', { name: 'Delete' })
    const describedBy = trigger.getAttribute('aria-describedby')

    await expect(describedBy).not.toBeNull()
    await expect(
      canvasElement.ownerDocument.querySelector('#' + CSS.escape(describedBy ?? '')),
    ).toHaveTextContent('Delete this entry')
  },
}

/**
 * **Focus opens it**, which is the path a pointer test cannot stand in for.
 */
export const OpensOnFocus: Story = {
  parameters: frame('200px'),
  render: (args) => (
    <TooltipTrigger delay={0}>
      <Button variant="outline" size="icon" aria-label="Delete">
        <Trash2 />
      </Button>
      <Tooltip {...args} />
    </TooltipTrigger>
  ),
  play: async ({ canvas, step }) => {
    const trigger = canvas.getByRole('button', { name: 'Delete' })

    await step('Nothing before focus', async () => {
      await expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    })

    await step('Focusing the trigger opens it', async () => {
      trigger.focus()
      await waitFor(() => {
        void expect(screen.getByRole('tooltip')).toHaveTextContent('Delete this entry')
      })
    })

    await step('And leaving closes it again', async () => {
      trigger.blur()
      await waitFor(() => {
        void expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
      })
    })
  },
}

/**
 * The four placements as a compass: each chip points away from the centre, so
 * the direction is the demonstration and nothing can overlap.
 */
export const Placements: Story = {
  parameters: frame('340px'),
  render: () => {
    const cell = 'flex items-center justify-center'
    const at = { top: 'col-start-2 row-start-1', bottom: 'col-start-2 row-start-3', left: 'col-start-1 row-start-2', right: 'col-start-3 row-start-2' } as const
    return (
      <div className="grid grid-cols-[2rem_2rem_2rem] grid-rows-[2rem_2rem_2rem] place-items-center px-28 py-16">
        {(['top', 'bottom', 'left', 'right'] as const).map((placement) => (
          <div key={placement} className={`${cell} ${at[placement]}`}>
            <TooltipTrigger isOpen>
              <Button variant="outline" size="icon" aria-label={placement}>
                <Info />
              </Button>
              <Tooltip placement={placement}>{placement}</Tooltip>
            </TooltipTrigger>
          </div>
        ))}
      </div>
    )
  },
  play: async ({ canvas, step }) => {
    const boxOf = (name: string) =>
      canvas.getByRole('button', { name }).getBoundingClientRect()
    const chipOf = (text: string) => screen.getByText(text).getBoundingClientRect()

    await step('Each chip sits on the side it names', async () => {
      await expect(chipOf('top').bottom).toBeLessThanOrEqual(boxOf('top').top + 1)
      await expect(chipOf('bottom').top).toBeGreaterThanOrEqual(boxOf('bottom').bottom - 1)
      await expect(chipOf('left').right).toBeLessThanOrEqual(boxOf('left').left + 1)
      await expect(chipOf('right').left).toBeGreaterThanOrEqual(boxOf('right').right - 1)
    })
  },
}

/**
 * Long text wraps at `max-w-xs` rather than running off the viewport.
 *
 * `max-w-xs` is 320px, which is what the assertion below caps against.
 */
export const Wrapping: Story = {
  parameters: frame('220px'),
  args: {
    children:
      'A refused save means somebody wrote first. The merge review names the field both of you set.',
  },
  render: (args) => (
    <TooltipTrigger isOpen>
      <Button variant="outline" size="icon" aria-label="What this means">
        <Info />
      </Button>
      <Tooltip {...args} />
    </TooltipTrigger>
  ),
  play: async () => {
    const chip = screen.getByRole('tooltip').getBoundingClientRect()

    // Capped and wrapped: a chip running the width of the sentence would be
    // wider than this and one line tall.
    await expect(chip.width).toBeLessThanOrEqual(320)
    await expect(chip.height).toBeGreaterThan(24)
  },
}

/**
 * Run the pointer along the row. Each tooltip leaves while the next arrives,
 * and a tooltip caught halfway out turns round from where it had got to.
 *
 * Closed on mount rather than `isOpen`, because the interruption is the whole
 * thing being shown and it only happens under a moving pointer.
 */
export const Interrupting: Story = {
  render: () => (
    <div className="flex gap-1">
      {(['Delete', 'Duplicate', 'Export', 'Flag'] as const).map((label) => (
        <TooltipTrigger key={label} delay={0}>
          <Button variant="outline" size="icon" aria-label={label}>
            <Info />
          </Button>
          <Tooltip>{label}</Tooltip>
        </TooltipTrigger>
      ))}
    </div>
  ),
}
