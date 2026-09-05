import type { Meta, StoryObj } from '@storybook/react-vite'
import { useListData } from 'react-aria-components'
import { expect, fn, userEvent, waitFor } from 'storybook/test'

import { Button } from './button'
import { Sortable, SortableItem, type SortableLook } from './sortable'

/**
 * A list whose rows an analyst can reorder, by pointer or by keyboard through
 * each row's grip.
 *
 * **The list holds no order.** `onReorder` reports a move and the caller
 * rewrites its data; what comes back as `items` is what draws. So every story
 * here wires a `useListData`, and a screen wiring one up does the same against
 * whatever holds its rows.
 *
 * What the kit adds over React Aria's own drag and drop is the grip's look, the
 * drop indicator, and the spring each row lands on. The pointer, the keyboard
 * route and where a drop is allowed are the foundation's and untouched.
 *
 * **The grip is not what a pointer grabs.** React Aria renders the drag button
 * with `pointer-events: none` and puts the pointer drag on the whole row; the
 * button is the keyboard and screen-reader entry, carrying its own label and
 * instructions. So the grip says *this row moves* and gives the keyboard
 * somewhere to land, and a mouse drags the row from anywhere along it.
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
 *
 * **The grip fades in rather than hiding**, which is the default and is why it
 * is `opacity` and not `hidden`: a hidden control takes no focus, and the
 * keyboard route is the reason to reach for this over a pair of Move up and
 * Move down buttons. So the grip is invisible and reachable at once, and the
 * `play` reads both -- transparent on a resting row, opaque once focus lands.
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
   *
   * React Aria sets `pointer-events: none` on the drag button inline, measured
   * off the rendered element. The grip is the keyboard and screen-reader route
   * into the drag -- Tab to it, Enter to pick the row up -- and a pointer drags
   * the row itself, anywhere along it. So the size is a floor for a *focus*
   * target and for something a reader has to see and understand, not for
   * something anybody clicks.
   *
   * jsdom gives every element a zero box and no computed style, so only this
   * tier can read either back: `size-5` and a grip nobody can reach both pass
   * there.
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
 * Rows of unequal height. React Aria's keyboard drop targets come from the
 * collection's keys rather than from pixel coordinates, so the row's height
 * does not enter into where a keyboard drop lands.
 *
 * It is the pointer path the tall row tests, and that is a thing to try rather
 * than to assert: a drag reads coordinates, and a row four times its
 * neighbours' height is where an indicator lands in the wrong gap.
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
 *
 * **It keeps its grip and the grip is disabled**, rather than the grip going
 * away. Measured: a row that lost its handle would change height and shift the
 * column, and the row would read as a different kind of thing rather than as
 * this kind, fixed.
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
 * **The reorder itself, without a drag.** Press the button and the data moves
 * one row to the top; the rows spring from their old indices to their new ones
 * rather than the list repainting in the new order.
 *
 * A story rather than only a drag, because the animation is a property of the
 * *data* changing and not of the pointer - which is also why a keyboard drop,
 * an undo, and another analyst's write arriving over the socket all get it.
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
