import type { Meta, StoryObj } from '@storybook/react-vite'
import { useListData } from 'react-aria-components'
import { expect, fn, userEvent, waitFor } from 'storybook/test'

import { Button } from './button'
import { Sortable, SortableItem, type SortableLook } from './sortable'

/**
 * A list whose rows an analyst can reorder, by pointer or by keyboard through
 * each row's grip.
 */
const meta = {
  title: 'Components/Sortable',
  component: Sortable,
  parameters: { layout: 'centered' },
  // Every story renders its own `Reorderable`, which owns the order and the
  // handler; the meta carries the required props so each one does not restate
  // a pair it never reads.
  args: { children: null, onReorder: fn() },
} satisfies Meta<typeof Sortable<Row>>

export default meta
type Story = StoryObj<typeof meta>

interface Row {
  id: string
  label: string
  body?: string
}

const SECTIONS: Row[] = [
  { id: 'summary', label: 'Executive summary' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'findings', label: 'Findings' },
  { id: 'actions', label: 'Recommended actions' },
]

/**
 * The mixed-height case the dnd-kit fork existed for: one row four times the
 * height of its neighbours.
 */
const MIXED: Row[] = [
  { id: 'scope', label: 'Scope' },
  {
    id: 'narrative',
    label: 'Narrative',
    body:
      'The mailbox was read in bulk over the Graph API, an inbox rule forwarded '
      + 'anything matching the invoice thread to an external address, and an '
      + 'archive was staged under Temp before the session was closed. Four lines '
      + 'of body, so this row stands several times the height of its neighbours.',
  },
  { id: 'iocs', label: 'Indicators' },
  { id: 'annex', label: 'Annex' },
]

function Reorderable({
  rows,
  disabledKeys,
  handle,
}: {
  rows: Row[]
  disabledKeys?: string[]
  handle?: SortableLook['handle']
}) {
  const list = useListData({ initialItems: rows })
  return (
    <Sortable
      aria-label="Report sections"
      className="w-80"
      items={list.items}
      {...(disabledKeys === undefined ? {} : { disabledKeys })}
      {...(handle === undefined ? {} : { handle })}
      onReorder={(e) => {
        if (e.target.dropPosition === 'before') list.moveBefore(e.target.key, e.keys)
        else if (e.target.dropPosition === 'after') list.moveAfter(e.target.key, e.keys)
      }}
    >
      {(row: Row) => (
        <SortableItem id={row.id} textValue={row.label}>
          <span className="flex min-w-0 flex-col gap-1">
            <span className="truncate font-medium">{row.label}</span>
            {row.body !== undefined && (
              <span className="text-xs text-ink-muted">{row.body}</span>
            )}
          </span>
        </SortableItem>
      )}
    </Sortable>
  )
}

/**
 * Drag a grip, or Tab to it and press Enter, then the arrow keys, then Enter
 * again.
 */
export const Default: Story = {
  render: () => <Reorderable rows={SECTIONS} />,
  play: async ({ canvasElement, step }) => {
    const grip = canvasElement.querySelector<HTMLElement>('button[slot="drag"]')!

    await step('It is invisible while nothing touches the row', async () => {
      await expect(getComputedStyle(grip).opacity).toBe('0')
    })

    await step('And it is still reachable, which is the point of hiding it this way', async () => {
      grip.focus()
      await expect(grip).toHaveFocus()
      await waitFor(() => {
        void expect(getComputedStyle(grip).opacity).toBe('1')
      })
    })
  },
}

/**
 * `handle="always"` keeps every grip on screen rather than fading it in, for a
 * list where reordering is the reason the screen exists rather than something
 * available on it.
 */
export const AlwaysVisibleHandle: Story = {
  render: () => <Reorderable rows={SECTIONS} handle="always" />,
  /**
   * Every grip clears 24px in both axes, and **takes no pointer at all**.
   */
  play: async ({ canvasElement }) => {
    const grips = [...canvasElement.querySelectorAll('button[slot="drag"]')]
    await expect(grips).toHaveLength(4)
    for (const el of grips) {
      await expect(getComputedStyle(el).opacity).toBe('1')
      await expect(getComputedStyle(el).pointerEvents).toBe('none')
      const box = el.getBoundingClientRect()
      await expect(box.width, 'a grip is below the 24px floor').toBeGreaterThanOrEqual(24)
      await expect(box.height, 'a grip is below the 24px floor').toBeGreaterThanOrEqual(24)
    }
  },
}

/**
 * Rows of unequal height.
 */
export const MixedHeights: Story = {
  render: () => <Reorderable rows={MIXED} handle="always" />,
  play: async ({ canvasElement }) => {
    const heights = [...canvasElement.querySelectorAll('[data-slot="grid-list-item"]')].map(
      (row) => row.getBoundingClientRect().height,
    )

    // The story is worth nothing if the tall row is not tall.
    await expect(heights[1]).toBeGreaterThan(heights[0]! * 2)
  },
}

/**
 * A disabled row cannot be picked up and is skipped while another row moves.
 */
export const DisabledItem: Story = {
  render: () => <Reorderable rows={SECTIONS} disabledKeys={['findings']} handle="always" />,
  play: async ({ canvas, step }) => {
    const gripOf = (name: string) =>
      canvas.getByRole('row', { name }).querySelector('button[slot="drag"]')!

    await step('Every row keeps its grip, disabled included', async () => {
      await expect(canvas.getAllByRole('row')).toHaveLength(4)
    })

    await step('And the disabled row\u2019s grip is the one that refuses', async () => {
      await expect(gripOf('Findings')).toBeDisabled()
      await expect(gripOf('Timeline')).toBeEnabled()
    })
  },
}

/**
 * **The reorder itself, without a drag.**
 */
function Shuffled() {
  const list = useListData({ initialItems: SECTIONS })
  const last = list.items[list.items.length - 1]
  const first = list.items[0]
  return (
    <div className="flex w-80 flex-col gap-3">
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        onPress={() => {
          if (last && first) list.moveBefore(first.id, [last.id])
        }}
      >
        Move the last section to the top
      </Button>
      <Sortable
        aria-label="Report sections"
        items={list.items}
        handle="always"
        onReorder={(e) => {
          if (e.target.dropPosition === 'before') list.moveBefore(e.target.key, e.keys)
          else if (e.target.dropPosition === 'after') list.moveAfter(e.target.key, e.keys)
        }}
      >
        {(row: Row) => (
          <SortableItem id={row.id} textValue={row.label}>
            <span className="truncate font-medium">{row.label}</span>
          </SortableItem>
        )}
      </Sortable>
    </div>
  )
}

/**
 * The button above the list is the caller, standing in for whatever really moves
 * the data -- a keyboard drop, an undo, another analyst's write over the socket.
 */
export const Reorder: Story = {
  render: () => <Shuffled />,
  play: async ({ canvas, step }) => {
    const order = () => canvas.getAllByRole('row').map((row) => row.textContent)

    await step('The last section is last', async () => {
      await expect(order()[3]).toBe('Recommended actions')
    })

    await step('And the press moves the data, not just the paint', async () => {
      await userEvent.click(
        canvas.getByRole('button', { name: 'Move the last section to the top' }),
      )
      await waitFor(() => {
        void expect(order()[0]).toBe('Recommended actions')
      })
      await expect(order()).toHaveLength(4)
    })
  },
}
