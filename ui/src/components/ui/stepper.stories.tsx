import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor } from 'storybook/test'

import {
  Stepper,
  StepperDescription,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperSeparator,
  StepperTitle,
  StepperTrigger,
} from './stepper'

/**
 * A numbered path through a task, one step at a time.
 */
const meta = {
  title: 'Components/Stepper',
  component: Stepper,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Stepper>

export default meta
type Story = StoryObj<typeof meta>

const STEPS = ['Scope', 'Evidence', 'Findings', 'Report'] as const

/**
 * The default: four steps, the analyst on the second.
 */
export const Default: Story = {
  render: () => (
    <Stepper defaultValue={2} className="w-[36rem]">
      <StepperNav>
        {STEPS.map((title, index) => (
          <StepperItem key={title} step={index + 1}>
            <StepperTrigger>
              <StepperIndicator />
              <StepperTitle>{title}</StepperTitle>
            </StepperTrigger>
            {index < STEPS.length - 1 ? <StepperSeparator /> : null}
          </StepperItem>
        ))}
      </StepperNav>
    </Stepper>
  ),
  play: async ({ canvas, canvasElement, step }) => {
    const items = [...canvasElement.querySelectorAll('[data-slot="stepper-item"]')]

    await step('The path is derived from the one number', async () => {
      await expect(items.map((item) => item.getAttribute('data-state'))).toEqual([
        'complete',
        'current',
        'upcoming',
        'upcoming',
      ])
    })

    await step('And exactly one step says it is the current one', async () => {
      await expect(items.filter((item) => item.hasAttribute('aria-current'))).toHaveLength(1)
      await expect(canvas.getByText('Evidence').closest('[data-slot="stepper-item"]')).toHaveAttribute(
        'aria-current',
        'step',
      )
    })

    await step('Pressing a step moves the path, and the ring with it', async () => {
      await userEvent.click(canvas.getByText('Report'))
      await waitFor(() => {
        void expect(
          [...canvasElement.querySelectorAll('[data-slot="stepper-item"]')].map((item) =>
            item.getAttribute('data-state'),
          ),
        ).toEqual(['complete', 'complete', 'complete', 'current'])
      })

      // Waited out rather than read at once: the ring fades, so the one
      // leaving and the one arriving are both on screen for the length of the
      // crossfade. What settles is one, on the step that is now current.
      await waitFor(() => {
        void expect(canvasElement.querySelectorAll('[data-slot="stepper-ring"]')).toHaveLength(1)
      })
      await expect(
        canvas.getByText('Report').closest('[data-slot="stepper-item"]')!
          .querySelector('[data-slot="stepper-ring"]'),
      ).not.toBeNull()
    })
  },
}

/**
 * Every step state: complete, current, upcoming and disabled.
 */
export const StepStates: Story = {
  render: () => (
    <Stepper value={2} className="w-[36rem]">
      <StepperNav>
        <StepperItem step={1}>
          <StepperTrigger>
            <StepperIndicator />
            <StepperTitle>Complete</StepperTitle>
          </StepperTrigger>
          <StepperSeparator />
        </StepperItem>
        <StepperItem step={2}>
          <StepperTrigger>
            <StepperIndicator />
            <StepperTitle>Current</StepperTitle>
          </StepperTrigger>
          <StepperSeparator />
        </StepperItem>
        <StepperItem step={3}>
          <StepperTrigger>
            <StepperIndicator />
            <StepperTitle>Upcoming</StepperTitle>
          </StepperTrigger>
          <StepperSeparator />
        </StepperItem>
        <StepperItem step={4} disabled>
          <StepperTrigger>
            <StepperIndicator />
            <StepperTitle>Disabled</StepperTitle>
          </StepperTrigger>
        </StepperItem>
      </StepperNav>
    </Stepper>
  ),
  play: async ({ canvasElement, step }) => {
    const items = [...canvasElement.querySelectorAll<HTMLElement>('[data-slot="stepper-item"]')]
    const dot = (item: HTMLElement) =>
      item.querySelector<HTMLElement>('[data-slot="stepper-indicator"]')!

    await step('Every state is drawn differently from the others', async () => {
      await expect(items.map((item) => item.getAttribute('data-state'))).toEqual([
        'complete',
        'current',
        'upcoming',
        'upcoming',
      ])
      const grounds = items.slice(0, 3).map((item) => getComputedStyle(dot(item)).backgroundColor)
      await expect(new Set(grounds).size).toBe(3)
    })

    // One ring, on the step being worked. Two would mean two elements fading
    // rather than one travelling, and none would put us back where this
    // started.
    await step('And only the current one wears the ring', async () => {
      await expect(canvasElement.querySelectorAll('[data-slot="stepper-ring"]')).toHaveLength(1)
      await expect(items[1]!.querySelector('[data-slot="stepper-ring"]')).not.toBeNull()
    })

    // The rule behind the current step is filled and the ones ahead are not,
    // and the fill is a scaled box rather than a colour -- so it has a
    // direction, which a crossfade does not.
    await step('The line behind is filled and the lines ahead are not', async () => {
      const fill = (item: HTMLElement) =>
        item.querySelector<HTMLElement>('[data-slot="stepper-separator-fill"]')!
      const width = (item: HTMLElement) => fill(item).getBoundingClientRect().width

      await expect(width(items[0]!)).toBeGreaterThan(0)
      await expect(width(items[1]!)).toBeCloseTo(0, 0)
    })

    // The origin, not the box. At full scale the fill covers the track whatever
    // it grew from, so the direction is only visible mid-animation -- and the
    // property that decides it is readable at rest.
    await step('And it grows from its own step rather than from the middle', async () => {
      const behind = items[0]!.querySelector<HTMLElement>(
        '[data-slot="stepper-separator-fill"]',
      )!
      const [x, y] = getComputedStyle(behind).transformOrigin.split(' ')
      await expect(Number.parseFloat(x!)).toBe(0)
      await expect(Number.parseFloat(y!)).toBe(0)
    })

    await step('The complete one carries a mark and the rest carry numbers', async () => {
      await expect(dot(items[0]!).querySelector('svg')).not.toBeNull()
      await expect(dot(items[1]!)).toHaveTextContent('2')
      await expect(dot(items[2]!)).toHaveTextContent('3')
    })

    await step('And the disabled one refuses, and is dimmed to say so', async () => {
      await expect(items[3]!.querySelector('button')).toBeDisabled()
      await expect(items[3]!.getAttribute('data-state')).toBe('upcoming')
      // On the item, not on the indicator: the indicator reads 1 either way.
      await expect(Number.parseFloat(getComputedStyle(items[3]!).opacity)).toBeLessThan(1)
    })
  },
}

/**
 * Vertical, with a description under each title.
 */
export const Vertical: Story = {
  render: () => (
    <Stepper defaultValue={2} orientation="vertical" className="w-80">
      <StepperNav>
        <StepperItem step={1}>
          <StepperTrigger>
            <StepperIndicator />
            <span>
              <StepperTitle>Scope</StepperTitle>
              <StepperDescription>What the incident touched.</StepperDescription>
            </span>
          </StepperTrigger>
          <StepperSeparator />
        </StepperItem>
        <StepperItem step={2}>
          <StepperTrigger>
            <StepperIndicator />
            <span>
              <StepperTitle>Evidence</StepperTitle>
              <StepperDescription>Logs, files and screenshots.</StepperDescription>
            </span>
          </StepperTrigger>
          <StepperSeparator />
        </StepperItem>
        <StepperItem step={3}>
          <StepperTrigger>
            <StepperIndicator />
            <span>
              <StepperTitle>Findings</StepperTitle>
              <StepperDescription>What the evidence supports.</StepperDescription>
            </span>
          </StepperTrigger>
        </StepperItem>
      </StepperNav>
    </Stepper>
  ),
  play: async ({ canvasElement, step }) => {
    const items = [...canvasElement.querySelectorAll<HTMLElement>('[data-slot="stepper-item"]')]

    await step('The steps stack rather than running across', async () => {
      const boxes = items.map((item) => item.getBoundingClientRect())
      await expect(boxes[1]!.top).toBeGreaterThanOrEqual(boxes[0]!.bottom - 1)
    })

    await step('And the rule between them stands on end', async () => {
      const rule = canvasElement
        .querySelector('[data-slot="stepper-separator"]')!
        .getBoundingClientRect()
      await expect(rule.height).toBeGreaterThan(rule.width)
    })
  },
}

/**
 * `completed` marks a step done wherever the active step sits.
 */
export const ForcedComplete: Story = {
  render: () => (
    <Stepper value={1} className="w-[36rem]">
      <StepperNav>
        <StepperItem step={1}>
          <StepperTrigger>
            <StepperIndicator />
            <StepperTitle>Scope</StepperTitle>
          </StepperTrigger>
          <StepperSeparator />
        </StepperItem>
        <StepperItem step={2} completed>
          <StepperTrigger>
            <StepperIndicator />
            <StepperTitle>Evidence</StepperTitle>
          </StepperTrigger>
          <StepperSeparator />
        </StepperItem>
        <StepperItem step={3}>
          <StepperTrigger>
            <StepperIndicator />
            <StepperTitle>Findings</StepperTitle>
          </StepperTrigger>
        </StepperItem>
      </StepperNav>
    </Stepper>
  ),
  play: async ({ canvasElement, step }) => {
    const items = [...canvasElement.querySelectorAll<HTMLElement>('[data-slot="stepper-item"]')]

    await step('The second is done while the first is still current', async () => {
      await expect(items.map((item) => item.getAttribute('data-state'))).toEqual([
        'current',
        'complete',
        'upcoming',
      ])
    })

    await step('And the tick is on its disc', async () => {
      await expect(
        items[1]!.querySelector('[data-slot="stepper-indicator"] svg'),
      ).not.toBeNull()
    })

    // Nobody has walked anywhere: the analyst is standing on the first step.
    await step('While no line claims any ground', async () => {
      for (const item of items) {
        const fill = item.querySelector<HTMLElement>('[data-slot="stepper-separator-fill"]')
        if (fill) await expect(fill.getBoundingClientRect().width).toBeCloseTo(0, 0)
      }
    })
  },
}
