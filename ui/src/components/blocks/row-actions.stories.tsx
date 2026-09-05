import type { Decorator, Meta, StoryObj } from '@storybook/react-vite'
import { Copy, Download, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import { RowActions } from '@/components/blocks/row-actions'
import { MenuItem, MenuSectionGroup } from '@/components/ui/menu'

/**
 * `RowActions` on the React Aria kit: the five controls, a held row, and the
 * overflow the row's right-click menu duplicates.
 *
 * Every story sits inside a `group/row` stand-in for the table row, which is
 * what the cluster's reveal is keyed to.
 */
const meta = {
  title: 'Blocks/Table/Row actions',
  component: RowActions,
  parameters: { layout: 'padded' },
  args: {
    label: 'WKS-FIN01',
    expanded: true,
    onToggleExpanded: () => undefined,
    onEdit: () => undefined,
    onDelete: () => undefined,
  },
} satisfies Meta<typeof RowActions>

export default meta
type Story = StoryObj<typeof meta>

/** A table row's shape: a value on the left, the cluster hard right. */
function RowStub({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="group/row flex items-center gap-3 rounded-md border px-3 py-1.5">
      <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
      {children}
    </div>
  )
}

// `Decorator` is unparameterised, so `context.args` is `{}` and every field
// reads as `unknown`. Narrow rather than cast: a `String()` here rendered
// `[object Object]` into the row's accessible name.
const inARow: Decorator[] = [
  (Story, context) => (
    <RowStub label={typeof context.args.label === 'string' ? context.args.label : ''}>
      <Story />
    </RowStub>
  ),
]

/** Kit `MenuItem` rows, which React Aria reads as a collection. */
const overflow = (
  <MenuSectionGroup title="Row">
    <MenuItem>
      <Copy aria-hidden />
      Duplicate
    </MenuItem>
    <MenuItem>
      <Download aria-hidden />
      Export this row
    </MenuItem>
    <MenuItem tone="destructive">
      <Trash2 aria-hidden />
      Delete
    </MenuItem>
  </MenuSectionGroup>
)

/**
 * The two controls every row has, and nothing it was not given.
 *
 * A pin, an overflow and an expander each appear only when the caller hands
 * down the handler for them, so a table without pinning draws no pin rather
 * than a disabled one.
 */
export const EditAndDelete: Story = {
  name: 'Edit and delete only',
  decorators: inARow,
  play: async ({ canvas, args }) => {
    await expect(canvas.getByRole('button', { name: `Edit ${args.label} in full` })).toBeVisible()
    await expect(canvas.getByRole('button', { name: `Delete ${args.label}` })).toBeVisible()
    await expect(canvas.queryByRole('button', { name: /pin/i })).not.toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: /^More for/ })).not.toBeInTheDocument()
  },
}

/**
 * Collapsed and unhovered, which is how a row sits at rest: the cluster is
 * there and transparent. Hover the row, or tab into it, to bring it back.
 */
export const Collapsed: Story = {
  name: 'At rest \u2014 hidden until hover or focus',
  args: { expanded: false },
  decorators: inARow,
}

/**
 * A pinned row keeps its pin on screen at rest.
 *
 * The rest of the cluster fades out with the row; the pin is the one control
 * that says something about the row rather than offering to do something to
 * it, so hiding it would hide the state.
 */
export const WithPin: Story = {
  name: 'Pinned, with the pin held open',
  args: { pinned: true, onTogglePin: () => undefined },
  decorators: inARow,
  play: async ({ canvas, args }) => {
    await expect(canvas.getByRole('button', { name: `Unpin ${args.label}` })).toBeVisible()
  },
}

/** Unpinned, where the same control offers the other verb. */
export const Unpinned: Story = {
  name: 'Unpinned',
  args: { pinned: false, onTogglePin: () => undefined },
  decorators: inARow,
  play: async ({ canvas, args }) => {
    await expect(canvas.getByRole('button', { name: `Pin ${args.label}` })).toBeVisible()
    await expect(canvas.queryByRole('button', { name: `Unpin ${args.label}` })).not.toBeInTheDocument()
  },
}

/**
 * A row the server has not acknowledged yet: edit is refused because there is
 * no id to send it to.
 *
 * Refused rather than removed, so the control stays where the hand expects it
 * and the row does not change shape as the write lands.
 */
export const Optimistic: Story = {
  name: 'Optimistic row \u2014 edit refused, no id to PATCH',
  args: { editDisabled: true },
  decorators: inARow,
  play: async ({ canvas, args }) => {
    const edit = canvas.getByRole('button', { name: `Edit ${args.label} in full` })
    await expect(edit).toBeVisible()
    await expect(edit).toHaveAttribute('aria-disabled', 'true')

    // **Delete is refused for the same reason and was not.** There is no id to
    // send either verb to, so a bin left live sends a delete for a row the
    // server has never seen -- and the pencil beside it, greyed out, says the
    // row is not there to act on.
    const remove = canvas.getByRole('button', { name: `Delete ${args.label}` })
    await expect(remove).toBeVisible()
    await expect(remove).toHaveAttribute('aria-disabled', 'true')
  },
}

/**
 * Somebody else is editing the row, so both verbs are refused and the tooltip
 * names them.
 *
 * The controls keep their tab stop and their pointer events: a refusal nobody
 * can reach is a refusal nobody is told about.
 */
export const HeldByAnother: Story = {
  name: 'Held \u2014 edit and delete refused, naming the analyst',
  args: { heldBy: 'Jo Meyer' },
  decorators: inARow,
  play: async ({ canvas, args }) => {
    for (const name of [`Edit ${args.label} in full`, `Delete ${args.label}`]) {
      await expect(canvas.getByRole('button', { name })).toHaveAttribute('aria-disabled', 'true')
    }
  },
}

/**
 * The overflow, holding what the cluster has no room for.
 *
 * The same groups the row's right-click menu draws, so a reader who found a
 * verb one way finds it the other.
 */
export const WithOverflow: Story = {
  name: 'With an overflow menu',
  args: { onTogglePin: () => undefined, pinned: false, menu: overflow },
  decorators: inARow,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'More for WKS-FIN01' }))
    const rows = await within(document.body).findAllByRole('menuitem')
    await expect(rows.map((row) => row.textContent)).toEqual([
      'Duplicate',
      'Export this row',
      'Delete',
    ])
  },
}

/**
 * Every control the cluster can draw, so the width it takes at its widest is
 * comparable against a row carrying two.
 */
export const EveryControlAtOnce: Story = {
  name: 'Every control at once',
  args: {
    pinned: true,
    onTogglePin: () => undefined,
    heldBy: 'Jo Meyer',
    menu: overflow,
  },
  decorators: inARow,
}

/**
 * A row whose value is far wider than the pane. The value truncates and the
 * cluster keeps its width, so the controls stay where the hand expects them.
 */
export const ALongValue: Story = {
  name: 'A row value too long for its pane',
  args: {
    label:
      'WKS-FINANCE-RECONCILIATION-0417.corp.meridian-holdings.example.internal',
    pinned: true,
    onTogglePin: () => undefined,
    menu: overflow,
  },
  decorators: inARow,
}

/**
 * The tooltip a held row answers with. It fires on a control that will not act,
 * because `isRefused` keeps the tab stop and the pointer events.
 */
export const TheRefusalTooltip: Story = {
  name: 'Why edit is refused',
  args: { heldBy: 'Jo Meyer' },
  decorators: inARow,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // **Focus rather than hover.** A pointer has to rest for `REST_BEFORE_OPEN`
    // before the tooltip opens at all, and a run that loses that race waits out
    // the whole timeout having seen nothing. Focus opens one immediately, and
    // is the route a keyboard reaches this control by anyway.
    await userEvent.keyboard('{Tab}')
    canvas.getByRole('button', { name: 'Edit WKS-FIN01 in full' }).focus()
    const tip = await within(document.body).findByText('Jo Meyer is editing this')
    // The tooltip rises in, so it is in the DOM at opacity 0 for a frame.
    await waitFor(async () => {
      await expect(tip).toBeVisible()
    })
  },
}

/**
 * The overflow as a controlled trigger, which is how the table opens a row's
 * menu from a press on the row itself.
 *
 * `onMenuOpenChange` hands the open state to the caller, and `menuOpen` holds
 * the cluster on screen while the menu is: the popover is anchored to the
 * `...` button, and a menu hanging off a control at `opacity: 0` points at
 * nothing. Collapsed and unhovered here, so the reveal can only be the menu's
 * doing.
 */
export const ControlledOverflow: Story = {
  name: 'The overflow, opened from outside',
  args: {
    expanded: false,
    menu: overflow,
    menuOpen: true,
    onMenuOpenChange: () => undefined,
  },
  decorators: inARow,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const cluster = canvas.getByRole('toolbar', { name: 'Actions for WKS-FIN01' })
    // The class, not the computed opacity: jsdom would read `''` and a
    // browser reads the transition's mid-frame. What is being held is that
    // an open menu keeps the cluster out of the transparent state.
    await expect(cluster.className).toContain('opacity-100')
    await expect(cluster.className).not.toContain('opacity-0')
    // And the menu it names is open, without anybody pressing the button.
    const rows = await within(document.body).findAllByRole('menuitem')
    await expect(rows.map((row) => row.textContent)).toEqual([
      'Duplicate',
      'Export this row',
      'Delete',
    ])
  },
}
