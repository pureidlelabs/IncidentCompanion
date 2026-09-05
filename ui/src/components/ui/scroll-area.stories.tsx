import type { Meta, StoryObj } from '@storybook/react-vite'

import { expect } from 'storybook/test'

import { ScrollArea } from '@/components/ui/scroll-area'

const lines = (count: number, word: string) =>
  Array.from({ length: count }, (_, at) => `${word} ${String(at + 1)}`)

/**
 * `ScrollArea` on each axis, and the case where nothing scrolls.
 */
const meta = {
  title: 'Components/ScrollArea',
  component: ScrollArea,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof ScrollArea>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The default. Rows run past the bottom edge and the sideways axis is shut, so a
 * row too wide for the box is clipped rather than opening a second bar.
 */
export const Vertical: Story = {
  render: () => (
    <ScrollArea className="max-h-64 w-72 rounded-md border border-border p-3">
      <ul className="flex flex-col gap-2 text-sm">
        {lines(30, 'Row').map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </ScrollArea>
  ),
  play: async ({ canvasElement, step }) => {
    const box = canvasElement.querySelector<HTMLElement>('[data-slot="scroll-area"]')!

    await step('It has more to show than it can', async () => {
      await expect(box.scrollHeight).toBeGreaterThan(box.clientHeight)
    })

    await step('And the other axis is shut rather than idle', async () => {
      await expect(getComputedStyle(box).overflowX).toBe('hidden')
      await expect(getComputedStyle(box).overflowY).not.toBe('hidden')
    })

    await step('So it actually scrolls', async () => {
      box.scrollTop = 40
      await expect(box.scrollTop).toBe(40)
    })
  },
}

/**
 * The same the other way round: columns run past the right edge, and the
 * vertical axis is the one shut.
 */
export const Horizontal: Story = {
  render: () => (
    <ScrollArea
      orientation="horizontal"
      className="w-72 rounded-md border border-border p-3"
    >
      <div className="flex w-max gap-2 text-sm">
        {lines(20, 'Column').map((line) => (
          <span key={line} className="rounded bg-muted px-2 py-1 whitespace-nowrap">
            {line}
          </span>
        ))}
      </div>
    </ScrollArea>
  ),
  play: async ({ canvasElement, step }) => {
    const box = canvasElement.querySelector<HTMLElement>('[data-slot="scroll-area"]')!

    await step('It runs off the right edge', async () => {
      await expect(box.scrollWidth).toBeGreaterThan(box.clientWidth)
    })

    await step('And the vertical axis is the one shut', async () => {
      await expect(getComputedStyle(box).overflowY).toBe('hidden')
      await expect(getComputedStyle(box).overflowX).not.toBe('hidden')
    })
  },
}

/**
 * `both`, for content that genuinely runs off two edges -- a wide table inside a
 * short pane. Neither axis is hidden, so both bars appear when they are needed.
 */
export const Both: Story = {
  name: 'Both axes',
  render: () => (
    <ScrollArea orientation="both" className="size-64 rounded-md border border-border p-3">
      <div className="w-max">
        {lines(30, 'Row').map((row) => (
          <p key={row} className="whitespace-nowrap text-sm">
            {row} &#x2014; a line long enough to run past the right-hand edge of the box
          </p>
        ))}
      </div>
    </ScrollArea>
  ),
  play: async ({ canvasElement, step }) => {
    const box = canvasElement.querySelector<HTMLElement>('[data-slot="scroll-area"]')!

    await step('It overflows on both axes', async () => {
      await expect(box.scrollHeight).toBeGreaterThan(box.clientHeight)
      await expect(box.scrollWidth).toBeGreaterThan(box.clientWidth)
    })

    await step('And neither is shut', async () => {
      const style = getComputedStyle(box)
      await expect(style.overflowX).not.toBe('hidden')
      await expect(style.overflowY).not.toBe('hidden')
    })
  },
}

/**
 * Content that fits.
 */
export const NothingToScroll: Story = {
  name: 'Content fits \u2014 no scrollbar',
  render: () => (
    <ScrollArea className="max-h-64 w-72 rounded-md border border-border p-3">
      <p className="text-sm">Two lines, well inside the height.</p>
      <p className="text-sm">So the region never overflows.</p>
    </ScrollArea>
  ),
  play: async ({ canvasElement, step }) => {
    const box = canvasElement.querySelector<HTMLElement>('[data-slot="scroll-area"]')!

    await step('Nothing runs past either edge', async () => {
      await expect(box.scrollHeight).toBe(box.clientHeight)
      await expect(box.scrollWidth).toBe(box.clientWidth)
    })

    await step('And the box is the height of its content, not of its cap', async () => {
      await expect(box.getBoundingClientRect().height).toBeLessThan(200)
    })
  },
}
