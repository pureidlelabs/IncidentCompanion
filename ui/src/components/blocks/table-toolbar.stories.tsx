import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { TableToolbar } from '@/components/blocks/table-toolbar'

/**
 * `TableToolbar` on the React Aria kit: the value box on its own, the faceted
 * popover in front of it, the `Clear` that appears once something is set, and
 * the far end of the row.
 */
const meta = {
  title: 'Blocks/Table/Table toolbar',
  component: TableToolbar,
  parameters: { layout: 'padded' },
  args: {
    searchColumn: 'hostname',
    placeholder: 'Search hosts',
    value: '',
    onValue: () => undefined,
    narrowed: false,
    onClear: () => undefined,
  },
} satisfies Meta<typeof TableToolbar>

export default meta
type Story = StoryObj<typeof meta>

/** One facet's worth of tick boxes, which is what a screen puts behind `Filters`. */
function VerdictFacet() {
  return (
    <div className="flex w-48 flex-col gap-1">
      <p className="px-1 text-xs uppercase text-ink-muted">Verdict</p>
      <Checkbox>Compromised (4)</Checkbox>
      <Checkbox>Accessed (11)</Checkbox>
      <Checkbox>Clean (15)</Checkbox>
    </div>
  )
}

/** The box wired to its own state, so typing in a story behaves as it does live. */
function Live({ initial = '', ...rest }: { initial?: string } & Partial<
  Parameters<typeof TableToolbar>[0]
>) {
  const [value, setValue] = useState(initial)
  return (
    <TableToolbar
      searchColumn="hostname"
      placeholder="Search hosts"
      narrowed={value !== ''}
      onClear={() => {
        setValue('')
      }}
      {...rest}
      value={value}
      onValue={setValue}
    />
  )
}

/** Nothing set, so there is nothing to clear and no control offering to. */
export const Empty: Story = {
  name: 'Nothing set',
  play: async ({ canvas, step }) => {
    await step('The box is empty', async () => {
      await expect(canvas.getByLabelText('hostname contains')).toHaveValue('')
    })

    await step('And no way back is offered, there being nowhere to go', async () => {
      await expect(canvas.queryByRole('button', { name: /^Clear$/ })).not.toBeInTheDocument()
    })
  },
}

/**
 * A search is in place, so the box holds a value and `Clear` is drawn.
 */
export const Narrowed: Story = {
  name: 'Narrowed by a search',
  args: { value: 'WKS-FIN', narrowed: true },
  play: async ({ canvas, step }) => {
    await step('The box holds what it was narrowed by', async () => {
      await expect(canvas.getByLabelText('hostname contains')).toHaveValue('WKS-FIN')
    })

    await step('And the way back is there now', async () => {
      await expect(canvas.getByRole('button', { name: /^Clear$/ })).toBeVisible()
    })
  },
}

/**
 * The operator is stated rather than chosen. A screen sets the word.
 */
export const AnotherOperator: Story = {
  name: 'A stated operator',
  args: { searchColumn: 'verdict', operator: 'is', placeholder: 'Any verdict' },
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText('verdict is')).toBeInTheDocument()
    await expect(canvas.queryByLabelText('hostname contains')).not.toBeInTheDocument()
  },
}

/** With `filters` set, a `Filters` button opens the faceted popover. */
export const WithFacets: Story = {
  name: 'With a faceted popover',
  args: { filters: <VerdictFacet /> },
}

/** The popover, opened. */
export const FacetsOpen: Story = {
  name: 'The faceted popover, open',
  args: { filters: <VerdictFacet /> },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Filters' }))
    const facet = await within(document.body).findByText('Verdict')
    // The popover fades in, so it is in the DOM at opacity 0 for a frame.
    await waitFor(async () => {
      await expect(facet).toBeVisible()
    })
  },
}

/** `end` holds the selection's actions, at the far end of the same row. */
export const WithAnEnd: Story = {
  name: 'With actions at the far end',
  args: {
    value: 'DC-',
    narrowed: true,
    end: (
      <>
        <span className="text-xs text-ink-muted">2 selected</span>
        <Button variant="outline" size="sm">
          Set verdict
        </Button>
      </>
    ),
  },
}

/** Typing narrows the row, and the cross inside the box empties it again. */
export const Typing: Story = {
  name: 'Typing, then clearing the box',
  render: () => <Live filters={<VerdictFacet />} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByLabelText('hostname contains'), 'DC-01')
    const box = canvas.getByLabelText('hostname contains')
    await expect(box).toHaveValue('DC-01')
    await userEvent.click(canvas.getByRole('button', { name: 'Clear the search' }))
    await expect(box).toHaveValue('')
  },
}

/**
 * A search longer than the box. It scrolls inside the box; nothing else moves.
 */
export const ALongValue: Story = {
  name: 'A search longer than its box',
  args: {
    value: 'WKS-FINANCE-RECONCILIATION-0417.corp.meridian-holdings.example.internal',
    narrowed: true,
  },
  play: async ({ canvas, canvasElement, step }) => {
    const box = canvas.getByLabelText('hostname contains')

    await step('The value runs past the box it is in', async () => {
      await expect(box.scrollWidth).toBeGreaterThan(box.clientWidth)
    })

    await step('And the row it sits in did not grow to hold it', async () => {
      const row = canvasElement.firstElementChild as HTMLElement
      await expect(row.scrollWidth).toBeLessThanOrEqual(Math.ceil(row.clientWidth) + 1)
    })
  },
}

/**
 * The whole row in a pane too narrow for it. The row wraps, so `end` drops to
 * a second line rather than colliding with the value box.
 */
export const Narrow: Story = {
  name: 'A pane too narrow for one row',
  args: {
    value: 'DC-',
    narrowed: true,
    filters: <VerdictFacet />,
    end: (
      <>
        <span className="text-xs text-ink-muted">2 selected</span>
        <Button variant="outline" size="sm">
          Set verdict
        </Button>
      </>
    ),
  },
  render: (args) => (
    <div className="w-96 rounded-md border p-2">
      <TableToolbar {...args} />
    </div>
  ),
  play: async ({ canvas, step }) => {
    const box = canvas.getByLabelText('hostname contains').getBoundingClientRect()
    const action = canvas.getByRole('button', { name: 'Set verdict' }).getBoundingClientRect()

    await step('The far end dropped to its own line', async () => {
      await expect(action.top).toBeGreaterThanOrEqual(box.bottom - 1)
    })

    await step('Rather than sitting on top of the box', async () => {
      const overlaps = action.top < box.bottom - 1 && action.left < box.right - 1
      await expect(overlaps).toBe(false)
    })
  },
}
