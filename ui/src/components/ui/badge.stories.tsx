import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, waitFor } from 'storybook/test'

import { Badge } from './badge'
import { Button } from './button'

/**
 * A small label: a severity, a verdict, a marking, a count.
 *
 * Takes no focus and fires nothing; wrap it in a `Button` if it must be
 * pressed. `solid` carries no fill - pass one as `className`. Never wraps or
 * truncates, so a caller that constrains its width owes the full value
 * somewhere reachable. Name the severity in the text as well as painting it.
 */
const meta = {
  title: 'Components/Badge',
  component: Badge,
  parameters: { layout: 'centered' },
  // On the meta rather than on each story, so every story below inherits a
  // live Controls panel: a knob moved in the panel reaches every badge on the
  // page, because each `render` spreads `args` rather than ignoring it.
  args: { children: 'Contained', variant: 'soft', size: 'sm', uppercase: false },
} satisfies Meta<typeof Badge>

export default meta
type Story = StoryObj<typeof meta>

/** The default: `soft`, at `sm`, sentence case. Every prop is a live control. */
export const Default: Story = {}

/**
 * The `variant` axis, all three at once. The first looks unpainted because
 * `solid` carries no fill - see `SolidCarriesNoFill`.
 */
export const Variants: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-3">
      <Badge {...args} variant="solid" />
      <Badge {...args} variant="soft" />
      <Badge {...args} variant="outlined" />
    </div>
  ),
}

/** The `size` axis. `count` is sized for a number rather than a word. */
export const Sizes: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-3">
      <Badge {...args} size="sm" />
      <Badge {...args} size="xs" />
      <Badge {...args} size="count">
        7
      </Badge>
      <Badge {...args} size="count">
        128
      </Badge>
    </div>
  ),
}

/** The `uppercase` axis, which also adds the micro tracking. */
export const Uppercase: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-3">
      <Badge {...args} uppercase={false} />
      <Badge {...args} uppercase />
    </div>
  ),
}

/**
 * **`solid` paints nothing by itself.**
 */
export const SolidCarriesNoFill: Story = {
  args: { variant: 'solid' },
  render: (args) => (
    <div className="flex flex-wrap items-center gap-3">
      <Badge {...args} data-testid="unfilled">
        No fill passed
      </Badge>
      <Badge {...args} className="bg-severity-critical text-on-severity">
        Critical
      </Badge>
      <Badge {...args} className="bg-severity-high text-on-severity">
        High
      </Badge>
      <Badge {...args} className="bg-severity-low text-on-severity-low">
        Low
      </Badge>
      <Badge {...args} className="bg-destructive text-on-destructive">
        Save refused
      </Badge>
      <Badge {...args} className="bg-primary text-on-primary">
        Confirmed
      </Badge>
    </div>
  ),
  play: async ({ canvas }) => {
    // Transparent, not "some default". If the variant ever grows a fill of its
    // own this fails, and the obligation documented on the caller is wrong.
    const unfilled = canvas.getByTestId('unfilled')
    await expect(getComputedStyle(unfilled).backgroundColor).toBe('rgba(0, 0, 0, 0)')
  },
}

/**
 * **A badge never wraps and never truncates**: `whitespace-nowrap` with
 * `overflow-hidden` and no ellipsis, so a label longer than the space it is
 * given is clipped mid-word with nothing to say it was.
 */
export const LongLabelIsClipped: Story = {
  render: (args) => (
    <div className="flex flex-col gap-3">
      <Badge {...args} variant="outlined">
        Credential access via LSASS memory dump on the finance file server
      </Badge>
      <div className="w-48 overflow-hidden">
        <Badge {...args} variant="outlined">
          Credential access via LSASS memory dump on the finance file server
        </Badge>
      </div>
    </div>
  ),
}

/**
 * Empty content still draws the badge, so a row holding one does not reflow
 * when the value arrives.
 */
export const Empty: Story = {
  args: { children: '' },
  render: (args) => (
    <div className="flex items-center gap-3">
      <Badge {...args} variant="outlined" />
      <Badge {...args} size="count" />
    </div>
  ),
}

/**
 * **A badge is not a control.**
 */
export const NotFocusable: Story = {
  render: (args) => (
    <div className="flex items-center gap-3">
      <Button size="sm" variant="outline">
        Before
      </Button>
      <Badge {...args} data-testid="inert" />
      <Button size="sm" variant="outline">
        After
      </Button>
    </div>
  ),
  play: async ({ canvas, step, userEvent }) => {
    const badge = canvas.getByTestId('inert')

    await step('Tab off the button before the badge', async () => {
      canvas.getByRole('button', { name: 'Before' }).focus()
      await userEvent.tab()
    })

    await step('Focus skipped the badge entirely', async () => {
      await expect(document.activeElement).not.toBe(badge)
      await expect(canvas.getByRole('button', { name: 'After' })).toHaveFocus()
    })
  },
}

/** The states a background job walks, as one badge changing rather than four. */
const STATES = [
  { key: 'queued', label: 'Queued', className: 'bg-secondary text-on-secondary' },
  { key: 'running', label: 'Uploading 3 of 12', className: 'bg-primary text-on-primary' },
  { key: 'done', label: 'Done', className: 'bg-severity-low text-on-severity-low' },
  { key: 'failed', label: 'Refused', className: 'bg-destructive text-on-destructive' },
]

function StateCycle({ uppercase }: { uppercase: boolean }) {
  const [at, setAt] = useState(0)
  const state = STATES[at % STATES.length]!
  return (
    <div className="flex flex-col items-center gap-4">
      <Badge
        variant="solid"
        uppercase={uppercase}
        stateKey={state.key}
        className={state.className}
      >
        {state.label}
      </Badge>
      <Button size="sm" variant="outline" onPress={() => setAt((n) => n + 1)}>
        Next state
      </Button>
    </div>
  )
}

/**
 * **`stateKey` turns the badge multi-state.**
 */
export const MultiState: Story = {
  render: (args) => <StateCycle uppercase={args.uppercase ?? false} />,
  play: async ({ canvas, canvasElement, step, userEvent }) => {
    await expect(canvas.getByText('Queued')).toBeInTheDocument()

    await step('Advance one state', async () => {
      await userEvent.click(canvas.getByRole('button', { name: 'Next state' }))
      await waitFor(() => {
        void expect(canvas.getByText('Uploading 3 of 12')).toBeInTheDocument()
      })
    })
    // **One state left standing, and it is the incoming one.** During the swap
    // `AnimatePresence` holds both in the tree; the failure worth catching is
    // the outgoing one never leaving, which accumulates a state node per
    // transition and is invisible in a screenshot because `popLayout` stacks
    // them. The outer `[data-slot="badge"]` is singular whatever happens, so
    // it is `badge-state` that has to be counted.
    await waitFor(() => {
      void expect(canvasElement.querySelectorAll('[data-slot="badge-state"]')).toHaveLength(1)
    })
    await expect(canvas.queryByText('Queued')).not.toBeInTheDocument()
  },
}
