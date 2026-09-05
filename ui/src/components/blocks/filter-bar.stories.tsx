import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import { Button } from '@/components/ui/button'
import { campaignCase } from '@/fixtures/campaign'
import {
  Chip,
  FilterBar,
  FilterBarEnd,
  FilterGroup,
  FilterPicker,
  PickerGroup,
  PickerRow,
} from '@/components/blocks/filter-bar'

/**
 * `FilterBar` on the React Aria kit: chips for a fixed vocabulary, a picker for
 * a case-derived one, the states a count puts a chip in, and the end slot.
 */
const meta = {
  title: 'Blocks/Table/Filter bar',
  component: FilterBar,
  parameters: { layout: 'padded' },
  args: {
    label: 'Narrow the timeline',
    children: null,
  },
} satisfies Meta<typeof FilterBar>

export default meta
type Story = StoryObj<typeof meta>

/** How many timeline entries name each system, which is what a count is. */
function countBy<T>(rows: readonly T[], key: (row: T) => string | null): Map<string, number> {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const at = key(row)
    if (at !== null) counts.set(at, (counts.get(at) ?? 0) + 1)
  }
  return counts
}

const perSystem = countBy(campaignCase.timeline, (entry) => entry.systemId)

/** Every system in the case, most-seen first, counts and all - zeros included. */
const HOSTS: readonly { label: string; count: number }[] = campaignCase.systems
  .map((system) => ({ label: system.hostname, count: perSystem.get(system.id) ?? 0 }))
  .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))

/** The tactics the case actually holds, which is more than fits one row. */
const TACTICS: readonly { label: string; count: number }[] = [
  ...countBy(campaignCase.timeline, (entry) => entry.tactic ?? null),
]
  .map(([label, count]) => ({ label, count }))
  .sort((a, b) => b.count - a.count)

/** The picker's rows wired to their own state, so a story ticks as the app does. */
function HostPicker() {
  const [on, setOn] = useState<readonly string[]>([])
  return (
    <FilterPicker label="Host" active={on.length}>
      <PickerGroup label="Host">
        {HOSTS.map((host) => (
          <PickerRow
            key={host.label}
            label={host.label}
            count={host.count}
            checked={on.includes(host.label)}
            onToggle={() => {
              setOn((current) =>
                current.includes(host.label)
                  ? current.filter((one) => one !== host.label)
                  : [...current, host.label],
              )
            }}
          />
        ))}
      </PickerGroup>
    </FilterPicker>
  )
}

/** A row of chips holding its own selection. */
function KindChips() {
  const [on, setOn] = useState<readonly string[]>(['Sign-in'])
  const kinds: readonly { label: string; count: number }[] = [
    { label: 'Sign-in', count: 13 },
    { label: 'Process', count: 22 },
    { label: 'Network', count: 9 },
    { label: 'Failure', count: 0 },
  ]
  return (
    <>
      {kinds.map((kind) => (
        <Chip
          key={kind.label}
          label={kind.label}
          count={kind.count}
          pressed={on.includes(kind.label)}
          onToggle={() => {
            setOn((current) =>
              current.includes(kind.label)
                ? current.filter((one) => one !== kind.label)
                : [...current, kind.label],
            )
          }}
        />
      ))}
    </>
  )
}

/** Chips, a picker and an end slot in one row. */
export const Full: Story = {
  name: 'A whole row',
  render: (args) => (
    <FilterBar {...args}>
      <FilterGroup label="Kind" first>
        <KindChips />
      </FilterGroup>
      <FilterGroup label="Severity">
        <Chip label="Critical" count={2} pressed={false} onToggle={() => undefined} />
        <Chip label="High" count={6} pressed={false} onToggle={() => undefined} />
        <Chip label="Medium" count={14} pressed={false} onToggle={() => undefined} />
      </FilterGroup>
      <FilterGroup label="Where">
        <HostPicker />
      </FilterGroup>
      <FilterBarEnd>
        <span className="text-xs text-ink-muted">44 rows</span>
        <Button variant="ghost" size="sm">
          Clear
        </Button>
      </FilterBarEnd>
    </FilterBar>
  ),
}

/** The four states a count puts a chip in. */
export const ChipStates: Story = {
  name: 'Chip states',
  render: (args) => (
    <FilterBar {...args}>
      <FilterGroup label="States" first>
        <Chip label="Pressed" count={13} pressed onToggle={() => undefined} />
        <Chip label="Unpressed" count={13} pressed={false} onToggle={() => undefined} />
        <Chip label="Empty" count={0} pressed={false} onToggle={() => undefined} />
        <Chip label="Empty and pressed" count={0} pressed onToggle={() => undefined} />
        <Chip label="24 hours" pressed={false} onToggle={() => undefined} />
      </FilterGroup>
    </FilterBar>
  ),
}

/**
 * Nothing chosen, so the picker's trigger is dashed.
 *
 * Dashed rather than solid: the border says *nothing here yet* in the same way
 * an empty state's does, so a bar of untouched pickers reads as available rather
 * than as set.
 */
export const PickerUntouched: Story = {
  name: 'A picker nobody has touched',
  render: (args) => (
    <FilterBar {...args}>
      <FilterGroup first>
        <HostPicker />
      </FilterGroup>
    </FilterBar>
  ),
}

/**
 * Two values chosen, so the trigger fills and states the number.
 *
 * The count is on the trigger because the pane is shut: an analyst scanning the
 * bar has to be able to see which dimensions are narrowing the table without
 * opening each one.
 */
export const PickerActive: Story = {
  name: 'A picker with values chosen',
  render: (args) => (
    <FilterBar {...args}>
      <FilterGroup first>
        <FilterPicker label="Host" active={2}>
          <PickerGroup label="Host">
            {HOSTS.slice(0, 5).map((host, at) => (
              <PickerRow
                key={host.label}
                label={host.label}
                count={host.count}
                checked={at < 2}
                onToggle={() => undefined}
              />
            ))}
          </PickerGroup>
        </FilterPicker>
      </FilterGroup>
    </FilterBar>
  ),
}

/** The picker's pane, opened over all 30 systems, so it scrolls at `max-h-80`. */
export const PickerOpen: Story = {
  name: 'The picker, open',
  render: (args) => (
    <FilterBar {...args}>
      <FilterGroup first>
        <HostPicker />
      </FilterGroup>
    </FilterBar>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Host' }))
    const row = await within(document.body).findByText('WKS-FIN01')
    await waitFor(async () => {
      await expect(row).toBeVisible()
    })
  },
}

/** A chip states its count in its accessible name, and refuses a press at zero. */
export const Pressing: Story = {
  name: 'Pressing a chip',
  render: (args) => (
    <FilterBar {...args}>
      <FilterGroup label="Kind" first>
        <KindChips />
      </FilterGroup>
    </FilterBar>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const network = canvas.getByRole('button', { name: 'Network 9' })
    await expect(network).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(network)
    await waitFor(async () => {
      await expect(canvas.getByRole('button', { name: 'Network 9' })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
    })
    await expect(canvas.getByRole('button', { name: 'Failure 0' })).toBeDisabled()
  },
}

/**
 * Every tactic the case holds, as chips. The bar wraps rather than scrolling,
 * so a wide vocabulary costs height and never hides a value off the right.
 *
 * **A filter an analyst cannot see is a filter they will not use**, and a
 * horizontally scrolling bar hides the values furthest from the ones already
 * chosen. The cost is height, which a bar can afford and a hidden value cannot.
 */
export const TooManyChips: Story = {
  name: 'More values than fit one row',
  render: (args) => (
    <FilterBar {...args}>
      <FilterGroup label="Tactic" first>
        {TACTICS.map((tactic) => (
          <Chip
            key={tactic.label}
            label={tactic.label}
            count={tactic.count}
            pressed={false}
            onToggle={() => undefined}
          />
        ))}
      </FilterGroup>
    </FilterBar>
  ),
  play: async ({ canvas, canvasElement, step }) => {
    const bar = canvasElement.querySelector<HTMLElement>('[data-slot="filter-bar"]')!
    const chips = canvas.getAllByRole('button')

    await step('There are more chips than one row holds', async () => {
      const rows = new Set(chips.map((chip) => Math.round(chip.getBoundingClientRect().top)))
      await expect(rows.size).toBeGreaterThan(1)
    })

    await step('And every one of them is inside the bar', async () => {
      const box = bar.getBoundingClientRect()
      for (const chip of chips) {
        await expect(chip.getBoundingClientRect().right).toBeLessThanOrEqual(box.right + 1)
      }
    })

    await step('So nothing is hidden off the right', async () => {
      await expect(bar.scrollWidth).toBeLessThanOrEqual(Math.ceil(bar.clientWidth))
    })
  },
}

/**
 * A value long enough to be a chip of its own. Nothing truncates it.
 *
 * A truncated filter value is one an analyst cannot tell from its neighbour --
 * two zones both reading *internal - finance...* are two chips that look like a
 * mistake. The chip takes the width instead.
 */
export const ALongValue: Story = {
  name: 'A value too long for a chip',
  render: (args) => (
    <FilterBar {...args}>
      <FilterGroup label="Zone" first>
        <Chip label={'internal \u2014 finance'} count={9} pressed onToggle={() => undefined} />
        <Chip
          label={'internal \u2014 finance reconciliation, third floor, restricted'}
          count={2}
          pressed={false}
          onToggle={() => undefined}
        />
      </FilterGroup>
    </FilterBar>
  ),
  play: async ({ canvas, step }) => {
    const long = canvas.getByRole('button', { name: /restricted/ })

    await step('The whole value is drawn', async () => {
      await expect(long.scrollWidth).toBeLessThanOrEqual(Math.ceil(long.clientWidth) + 1)
      await expect(long).toHaveTextContent('third floor, restricted')
    })

    await step('And the short one beside it keeps its own width', async () => {
      const short = canvas.getByRole('button', { name: /finance 9/ })
      await expect(short.getBoundingClientRect().width).toBeLessThan(
        long.getBoundingClientRect().width,
      )
    })
  },
}

/** No dimension has anything in it: every chip is at zero and refuses a press. */
export const NothingToNarrow: Story = {
  name: 'Nothing left to narrow by',
  render: (args) => (
    <FilterBar {...args}>
      <FilterGroup label="Kind" first>
        <Chip label="Sign-in" count={0} pressed={false} onToggle={() => undefined} />
        <Chip label="Process" count={0} pressed={false} onToggle={() => undefined} />
        <Chip label="Network" count={0} pressed={false} onToggle={() => undefined} />
      </FilterGroup>
      <FilterBarEnd>
        <span className="text-xs text-ink-muted">0 rows</span>
        <Button variant="ghost" size="sm">
          Clear
        </Button>
      </FilterBarEnd>
    </FilterBar>
  ),
  play: async ({ canvas, step }) => {
    await step('Every chip is at zero and refuses', async () => {
      for (const label of ['Sign-in', 'Process', 'Network']) {
        await expect(canvas.getByRole('button', { name: `${label} 0` })).toBeDisabled()
      }
    })

    // The way back stays live, which is the whole point of the state: an
    // analyst who has narrowed to nothing needs the one control that undoes it.
    await step('And the way out of it does not', async () => {
      await expect(canvas.getByRole('button', { name: 'Clear' })).toBeEnabled()
    })
  },
}

/**
 * The bar in the box it is used in: a scroller inset by `--spacing-pane-y`, with
 * a section head above it and rows below.
 *
 * **Nothing else holds this shape.** Every other story here renders the bar
 * with no scrollport at all, so neither half of what it is for -- standing in
 * front of the rows that pass under it, and covering nothing while it rests --
 * could be asserted. A change that got the resting half right and the scrolled
 * half wrong passed every story in this file.
 */
export const InAPaneThatScrolls: Story = {
  name: 'Stuck to a pane that scrolls',
  render: (args) => (
    <div
      data-slot="pane-scroll"
      // The real pane declares this for whatever sticks to it, and a mock that
      // does not is a mock that lies about being one: the bar would pin at the
      // padding edge and the rows would scroll through the strip above it.
      className="relative flex h-80 flex-col overflow-y-auto bg-background px-6 py-pane-y [--sticky-top:var(--pane-sticky-top)]"
    >
      <div data-slot="section-head" className="flex flex-col gap-0.5">
        <h1 className="text-lg font-semibold">Reports</h1>
        <p className="text-xs text-ink-muted">
          What this case has produced, and what it still owes.
        </p>
      </div>
      <FilterBar {...args}>
        <FilterGroup label="Stage" first>
          <Chip label="Draft" count={12} pressed={false} onToggle={() => undefined} />
          <Chip label="Final" count={12} pressed={false} onToggle={() => undefined} />
        </FilterGroup>
      </FilterBar>
      <ol className="flex flex-col">
        {Array.from({ length: 40 }, (_, at) => (
          <li key={at} className="border-b border-border py-2 text-sm">
            {`Row ${String(at + 1)}`}
          </li>
        ))}
      </ol>
    </div>
  ),
}
