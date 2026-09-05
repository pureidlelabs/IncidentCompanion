import type { Meta, StoryObj } from '@storybook/react-vite'

import { expect } from 'storybook/test'

import { Wizard, type WizardStep } from '@/components/blocks/wizard'
import { Button } from '@/components/ui/button'

const STEPS: readonly WizardStep[] = [
  { key: 'source', label: 'Source', hint: 'Where the rows come from' },
  { key: 'map', label: 'Map fields', hint: 'A column per field' },
  { key: 'review', label: 'Review', hint: 'What will be written' },
]

/** The live importer's own rail: four steps, and no hint under any of them. */
const IMPORT_STEPS: readonly WizardStep[] = [
  { key: 'connect', label: 'Connect' },
  { key: 'source', label: 'Workspace' },
  { key: 'incidents', label: 'Incidents' },
  { key: 'review', label: 'Review' },
]

const Body = ({ children }: { children: string }) => (
  <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-ink-muted">
    {children}
  </div>
)

const Actions = (
  <>
    <Button variant="outline">Back</Button>
    <Button>Continue</Button>
  </>
)

/**
 * `Wizard` on the React Aria kit: each step, both orientations, a step in
 * flight, and the rail with no step matched.
 *
 * **The rail is derived from `current` and nothing else.** A step is done while
 * it is before the current one, current at it, and still to come after -- so a
 * caller moves one string and the whole rail follows, and a phase that does not
 * exist yet simply matches nothing.
 *
 * What this composition owes beyond the rail is the relation between the body,
 * the actions and `busy`: the demonstrations below hold which of those a step in
 * flight reaches.
 */
const meta = {
  title: 'Blocks/Form/Wizard',
  component: Wizard,
  parameters: { layout: 'padded' },
  args: {
    steps: STEPS,
    current: 'map',
    label: 'Import a CSV',
    actions: Actions,
    children: <Body>The current step&rsquo;s form</Body>,
  },
} satisfies Meta<typeof Wizard>

export default meta
type Story = StoryObj<typeof meta>

/** The first step, where nothing is behind and the rail has no history to show. */
export const FirstStep: Story = {
  name: 'First step',
  args: { current: 'source' },
  play: async ({ canvasElement }) => {
    const states = [...canvasElement.querySelectorAll('[data-slot="stepper-item"]')].map((one) =>
      one.getAttribute('data-state'),
    )

    await expect(states).toEqual(['current', 'upcoming', 'upcoming'])
  },
}

/** One behind, one under way, one ahead: the state a wizard spends its time in. */
export const MiddleStep: Story = {
  name: 'Middle step \u2014 one done, one to go',
  play: async ({ canvasElement, step }) => {
    const items = [...canvasElement.querySelectorAll('[data-slot="stepper-item"]')]

    await step('The rail follows the one string it was given', async () => {
      await expect(items.map((one) => one.getAttribute('data-state'))).toEqual([
        'complete',
        'current',
        'upcoming',
      ])
    })

    await step('And exactly one step says it is the current one', async () => {
      await expect(items.filter((one) => one.hasAttribute('aria-current'))).toHaveLength(1)
    })
  },
}

/** The last step, with everything behind it done. */
export const LastStep: Story = {
  name: 'Last step',
  args: { current: 'review' },
  play: async ({ canvasElement }) => {
    const states = [...canvasElement.querySelectorAll('[data-slot="stepper-item"]')].map((one) =>
      one.getAttribute('data-state'),
    )

    await expect(states).toEqual(['complete', 'complete', 'current'])
  },
}

/**
 * A step in flight.
 *
 * The indicator on the current step spins, so the rail says which step is
 * working rather than the page saying only that something is.
 */
export const Busy: Story = {
  name: 'Step in flight \u2014 the indicator spins',
  args: { busy: true },
  play: async ({ canvas, canvasElement, step }) => {
    const current = canvasElement.querySelector('[data-slot="stepper-item"][data-state="current"]')!

    // The number is swapped for the mark rather than joined by it, so the
    // reading is which indicator holds a glyph -- and the class carries a
    // `motion-safe:` prefix, so a selector for `.animate-spin` matches nothing.
    await step('The current step swaps its number for a mark', async () => {
      const indicator = current.querySelector('[data-slot="stepper-indicator"]')!
      await expect(indicator.querySelector('svg')).not.toBeNull()
      await expect(indicator).not.toHaveTextContent('2')
    })

    // The kit's own, not a glyph of this block's: one implementation, one size
    // ladder, and one place the reduced-motion guard is applied.
    await step('And the mark is the kit\u2019s spinner', async () => {
      await expect(current.querySelector('[data-slot="spinner"]')).not.toBeNull()
    })

    // Decorative, because the step's title is beside it and names the step. A
    // live region here would announce into a rail that already says where the
    // analyst is.
    await step('Which is decorative, so nothing announces twice', async () => {
      const mark = current.querySelector('[data-slot="spinner"]')!
      await expect(mark).toHaveAttribute('aria-hidden')
      await expect(mark).not.toHaveAttribute('role', 'status')
      await expect(canvas.queryByRole('status')).not.toBeInTheDocument()
    })

    await step('And the steps either side keep their numbers', async () => {
      const others = [
        ...canvasElement.querySelectorAll('[data-slot="stepper-item"]:not([data-state="current"])'),
      ].map((one) => one.querySelector('[data-slot="stepper-indicator"]')!)
      await expect(others[1]).toHaveTextContent('3')
    })

    await step('And the actions are still there to read', async () => {
      await expect(canvas.getByRole('button', { name: 'Continue' })).toBeInTheDocument()
      await expect(canvas.getByRole('button', { name: 'Back' })).toBeInTheDocument()
    })
  },
}

/** The rail beside the body rather than above it, for a tall form. */
export const Vertical: Story = {
  name: 'Vertical \u2014 the rail beside the body',
  args: { orientation: 'vertical' },
  play: async ({ canvas, canvasElement }) => {
    const rail = canvasElement.querySelector('[data-slot="stepper-nav"]')!.getBoundingClientRect()
    const body = canvas.getByText(/current step/).getBoundingClientRect()

    await expect(body.left).toBeGreaterThanOrEqual(rail.right - 1)
  },
}

/** The vertical rail while a step runs, which is where the importer draws it. */
export const VerticalBusy: Story = {
  name: 'Vertical, in flight',
  args: { orientation: 'vertical', busy: true },
}

/**
 * No action row, for a step whose form carries its own submit.
 *
 * The row is absent rather than empty, so the body sits against the bottom edge
 * instead of above a band of nothing.
 */
export const NoActions: Story = {
  name: 'No action row',
  args: { actions: undefined },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument()
    await expect(canvas.getByText(/current step/)).toBeVisible()
  },
}

/**
 * Four steps and no hints: the shape the live importer passes.
 *
 * The hint line is absent where there is nothing to put in it, so a rail of
 * bare labels does not carry a row of empty space under each one.
 */
export const NoHints: Story = {
  name: 'Four steps, no hints',
  args: {
    steps: IMPORT_STEPS,
    current: 'incidents',
    label: 'Import steps',
    children: <Body>Incidents to bring across</Body>,
  },
  play: async ({ canvasElement, step }) => {
    const items = [...canvasElement.querySelectorAll('[data-slot="stepper-item"]')]

    await step('Four steps, the third of them current', async () => {
      await expect(items.map((one) => one.getAttribute('data-state'))).toEqual([
        'complete',
        'complete',
        'current',
        'upcoming',
      ])
    })

    await step('And no hint row under any of them', async () => {
      await expect(
        canvasElement.querySelectorAll('[data-slot="stepper-description"]'),
      ).toHaveLength(0)
    })
  },
}

/**
 * `current` matching no step: the rail draws every step as still to come, which
 * is what a phase the caller has not added yet looks like.
 *
 * It does not throw and does not guess. A rail that fell back to the first step
 * would tell an analyst they were at the beginning of something they are in the
 * middle of.
 */
export const Unmatched: Story = {
  name: 'A step nothing matches',
  args: { current: 'nowhere' },
  play: async ({ canvasElement, step }) => {
    const items = [...canvasElement.querySelectorAll('[data-slot="stepper-item"]')]

    await step('Every step is still to come', async () => {
      await expect(items.map((one) => one.getAttribute('data-state'))).toEqual([
        'upcoming',
        'upcoming',
        'upcoming',
      ])
    })

    await step('And none of them claims to be current', async () => {
      await expect(items.filter((one) => one.hasAttribute('aria-current'))).toHaveLength(0)
    })
  },
}

/**
 * A label past the space its column has, against the separator beside it.
 *
 * The case that decides whether a rail survives real copy: three labels of
 * unequal length, each of which has to stay readable beside a rule that has to
 * stay visible.
 */
export const ALongLabel: Story = {
  name: 'Labels past their column',
  args: {
    steps: [
      { key: 'source', label: 'Choose a workspace', hint: 'The tenant these incidents come from' },
      {
        key: 'map',
        label: 'Map every served column to a field',
        hint: 'A column per field, and the ones left over are dropped',
      },
      { key: 'review', label: 'Review what will be written', hint: 'Nothing is written until then' },
    ],
    current: 'map',
  },
  play: async ({ canvasElement, step }) => {
    const items = [...canvasElement.querySelectorAll<HTMLElement>('[data-slot="stepper-item"]')]

    await step('The steps share one row', async () => {
      const tops = items.map((one) => Math.round(one.getBoundingClientRect().top))
      await expect(new Set(tops).size).toBe(1)
    })

    await step('And every rule between them is still drawn', async () => {
      const rules = [
        ...canvasElement.querySelectorAll<HTMLElement>('[data-slot="stepper-separator"]'),
      ]
      await expect(rules.length).toBeGreaterThan(0)
      for (const rule of rules) {
        await expect(rule.getBoundingClientRect().width).toBeGreaterThan(0)
      }
    })
  },
}
