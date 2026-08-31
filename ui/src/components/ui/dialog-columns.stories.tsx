import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

import { Input, controlBase } from './input'

import { DialogColumn, DialogColumns, sizeForColumns } from './dialog-columns'

/**
 * A dialog body divided into named columns, and the rule that picks the
 * dialog's width from how many there are.
 *
 * **It has no height of its own.** It carried `max-h-[70vh]`, which is a cap
 * rather than a size -- the same rule gave a two-field dialog and a
 * twenty-field one the same frame, so the frame moved whenever the form did.
 * `min-h-0` is what lets a flex child actually shrink and scroll inside the
 * height the frame handed it, which is the state `Overlong` shows.
 *
 * `sizeForColumns` answers in the kit `Dialog`'s own size vocabulary, so a
 * form that grows a third column widens its dialog without anybody choosing.
 */
const meta = {
  title: 'Components/Dialog columns',
  component: DialogColumns,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof DialogColumns>

export default meta
type Story = StoryObj<typeof meta>

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      {label}
      <Input aria-label={label} className={controlBase} defaultValue={value ?? ''} />
    </label>
  )
}

/** A frame standing in for `DialogContent`, at the width `sizeForColumns` picks. */
function Frame({ columns, children }: { columns: number; children: React.ReactNode }) {
  const size = sizeForColumns(columns)
  const width = size === 'workbench' ? 880 : size === 'form' ? 620 : 400
  return (
    <div className="flex h-96 flex-col rounded-lg border bg-card p-4" style={{ width }}>
      <h2 className="mb-3 text-sm font-medium">Edit system</h2>
      {children}
      <p className="mt-3 font-mono text-2xs text-ink-muted">
        sizeForColumns({columns}) = {size}
      </p>
    </div>
  )
}

/** One column: `compact`. */
export const OneColumn: Story = {
  play: async ({ canvas }) => {
    // The width is a consequence of the column count rather than a choice at
    // each call site, so a form that grows a column widens its dialog without
    // anybody deciding to. The whole ladder is asserted here, once.
    await expect(sizeForColumns(1)).toBe('compact')
    await expect(sizeForColumns(2)).toBe('form')
    await expect(sizeForColumns(3)).toBe('workbench')

    // Past three it does not keep growing: there is no wider size to pick.
    await expect(sizeForColumns(6)).toBe('workbench')

    await expect(canvas.getByText('sizeForColumns(1) = compact')).toBeVisible()
  },
  render: () => (
    <Frame columns={1}>
      <DialogColumns>
        <DialogColumn title="Identity">
          <Field label="Hostname" value="FIN-WS-04" />
          <Field label="Role" value="Workstation" />
        </DialogColumn>
      </DialogColumns>
    </Frame>
  ),
}

/** Two: `form`, and the divider is the column's own padding rather than a rule. */
export const TwoColumns: Story = {
  play: async ({ canvas }) => {
    // Each column is titled, and the titles are what tell an analyst which
    // half of the form they are in. Two columns of untitled fields is one
    // list with a gap down the middle.
    await expect(canvas.getByText('Identity')).toBeVisible()
    await expect(canvas.getByText('Assessment')).toBeVisible()

    const left = canvas.getByText('Identity').getBoundingClientRect()
    const right = canvas.getByText('Assessment').getBoundingClientRect()
    await expect(left.right).toBeLessThanOrEqual(right.left)
  },
  render: () => (
    <Frame columns={2}>
      <DialogColumns>
        <DialogColumn title="Identity">
          <Field label="Hostname" value="FIN-WS-04" />
          <Field label="Address" value="10.4.19.22" />
        </DialogColumn>
        <DialogColumn title="Assessment">
          <Field label="Verdict" value="Compromised" />
          <Field label="Owner" value="nadia.okonjo" />
        </DialogColumn>
      </DialogColumns>
    </Frame>
  ),
}

/** Three or more: `workbench`. */
export const ThreeColumns: Story = {
  render: () => (
    <Frame columns={3}>
      <DialogColumns>
        <DialogColumn title="Identity">
          <Field label="Hostname" value="FIN-WS-04" />
          <Field label="Address" value="10.4.19.22" />
        </DialogColumn>
        <DialogColumn title="Assessment">
          <Field label="Verdict" value="Compromised" />
          <Field label="Confidence" value="High" />
        </DialogColumn>
        <DialogColumn title="Provenance">
          <Field label="Source" value="EDR" />
          <Field label="First seen" value="2026-08-20" />
        </DialogColumn>
      </DialogColumns>
    </Frame>
  ),
}

/**
 * More fields than the frame is tall: the columns scroll inside the height the
 * frame handed them, and the frame does not grow.
 */
export const Overlong: Story = {
  play: async ({ canvas, canvasElement }) => {
    // `min-h-0` is what lets a flex child shrink and scroll inside the height
    // it was handed. Without it the columns size to their content, the frame
    // grows with the form, and a dialog's height becomes a property of how
    // many fields somebody added.
    const columns = canvasElement.querySelector('[data-slot="dialog-columns"]')!
    await expect(columns.scrollHeight).toBeGreaterThan(columns.clientHeight)

    const frame = canvas.getByText('Edit system').closest('div')!
    await expect(frame.getBoundingClientRect().height).toBeLessThan(500)
  },
  render: () => (
    <Frame columns={2}>
      <DialogColumns>
        <DialogColumn title="Identity">
          {Array.from({ length: 9 }, (_, index) => (
            <Field key={index} label={`Field ${String(index + 1)}`} />
          ))}
        </DialogColumn>
        <DialogColumn title="Assessment">
          {Array.from({ length: 9 }, (_, index) => (
            <Field key={index} label={`Assessment ${String(index + 1)}`} />
          ))}
        </DialogColumn>
      </DialogColumns>
    </Frame>
  ),
}
