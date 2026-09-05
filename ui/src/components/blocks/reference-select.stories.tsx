import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'

import { refOptions } from '@/api/refOptions'
import {
  ReferenceMultiSelect,
  type ReferenceMultiSelectProps,
} from '@/components/blocks/reference-select'
import { MISSING_REFERENCE } from '@/components/blocks/entity-link'
import { campaignCase } from '@/fixtures/campaign'

/** The campaign case's own rows: 30 systems, 18 accounts. */
const SYSTEMS = refOptions(campaignCase.systems, (row) => row.hostname)
const ACCOUNTS = refOptions(campaignCase.accounts, (row) => row.accountName)

const systemIds = campaignCase.systems.map((row) => row.id)

/**
 * Two ids in the reverse of their sorted order.
 */
const OUT_OF_ORDER = [systemIds[0]!, systemIds[2]!].sort().reverse()
const accountIds = campaignCase.accounts.map((row) => row.id)

/**
 * `ReferenceMultiSelect` on the React Aria kit, over the campaign case's rows:
 * nothing chosen, several chosen, a dangling id, an empty collection, and the
 * create row.
 */
const meta = {
  title: 'Blocks/Form/Reference multi-select',
  component: ReferenceMultiSelect,
  parameters: { layout: 'padded' },
  args: {
    label: 'Systems',
    value: [],
    options: SYSTEMS,
    target: 'system',
    onChange: () => undefined,
  },
} satisfies Meta<typeof ReferenceMultiSelect>

export default meta
type Story = StoryObj<typeof meta>

/** Nothing chosen: the group of chips is empty and the picker is live. */
export const Empty: Story = {
  name: 'Nothing chosen',
  play: async ({ canvasElement, canvas }) => {
    await expect(canvasElement.querySelectorAll('[data-slot="reference-chip"]')).toHaveLength(0)
    await expect(canvas.getByRole('button', { name: 'Show suggestions' })).toBeEnabled()
  },
}

/**
 * Two chosen, drawn in the order they are stored rather than sorted.
 */
export const Chosen: Story = {
  name: 'Two chosen, in stored order',
  args: { value: OUT_OF_ORDER },
  play: async ({ canvas, canvasElement, args }) => {
    // The chips are a named group of their own, so a reader moving into them
    // hears which field they belong to rather than a bare list.
    await expect(canvas.getByRole('grid', { name: 'Chosen Systems' })).toBeVisible()

    const chips = [...canvasElement.querySelectorAll('[data-slot="reference-chip"]')]
    await expect(chips).toHaveLength(2)
    // The third row first and the first row second, as passed -- not sorted.
    await expect(chips.map((c) => c.textContent.trim())).toEqual(
      args.value.map((id) => SYSTEMS.get(id)),
    )
  },
}

/** Enough chosen that the tags wrap, which is what a linked event row holds. */
export const Many: Story = {
  name: 'Nine chosen \u2014 the tags wrap',
  args: { value: systemIds.slice(0, 9) },
}

/** An account name is long and monospaced: the widest thing a chip carries. */
export const LongLabels: Story = {
  name: 'Accounts \u2014 long labels in a chip',
  args: {
    label: 'Accounts',
    target: 'account',
    options: ACCOUNTS,
    value: accountIds.slice(0, 4),
  },
}

/**
 * An id nothing resolves keeps its chip, reading as a missing reference.
 */
export const Dangling: Story = {
  name: 'A dangling id keeps its tag',
  args: { value: [systemIds[0]!, 'gone-42'] },
  play: async ({ canvasElement }) => {
    const chips = [...canvasElement.querySelectorAll('[data-slot="reference-chip"]')]
    await expect(chips).toHaveLength(2)
    await expect(chips.some((c) => c.textContent.includes(MISSING_REFERENCE))).toBe(true)
  },
}

/**
 * Disabled: the chips stay readable and lose the control that removes them.
 */
export const Disabled: Story = {
  name: 'Disabled \u2014 the tags stay, without their remove buttons',
  args: { value: [systemIds[0]!, systemIds[1]!], disabled: true },
  play: async ({ canvasElement, canvas }) => {
    await expect(canvasElement.querySelectorAll('[data-slot="reference-chip"]')).toHaveLength(2)
    await expect(canvas.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Show suggestions' })).toBeDisabled()
  },
}

/**
 * An empty collection with nothing to create: the picker is shut.
 */
export const NothingToPick: Story = {
  name: 'An empty collection with no create row \u2014 shut',
  args: { label: 'Malware', target: 'malware', options: new Map() },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Show suggestions' })).toBeDisabled()
  },
}

/**
 * At rest this is pixel-identical to `Empty`: with nothing chosen, the create
 * row only exists inside the picker's popover, which neither story opens on
 * mount.
 */
export const CreateOffered: Story = {
  name: 'An empty collection with a create row \u2014 still live',
  args: {
    label: 'Malware',
    target: 'malware',
    options: new Map(),
    onCreateNew: () => undefined,
    createLabel: 'New malware sample',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Show suggestions' }))
    await expect(
      await within(document.body).findByRole('option', { name: 'New malware sample' }),
    ).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
  },
}

/**
 * The create row sits under the case's own rows rather than above them.
 */
export const CreateAlongsideRows: Story = {
  name: 'The create row under the case rows',
  args: {
    value: [systemIds[0]!],
    onCreateNew: () => undefined,
    createLabel: 'New system',
  },
  play: async ({ canvas, userEvent: press }) => {
    await press.click(canvas.getByRole('button', { name: 'Show suggestions' }))
    const rows = await within(document.body).findAllByRole('option')
    await expect(rows[rows.length - 1]).toHaveTextContent('New system')
    await press.keyboard('{Escape}')
  },
}

/** Inside a field: the ids `Field` hands down keep the label and the refusal wired. */
export const InsideAField: Story = {
  name: 'Wired to a field\u2019s label and description',
  args: {
    value: [systemIds[0]!],
    id: 'reference-select-story',
    'aria-describedby': 'reference-select-story-hint',
  },
  render: (args) => (
    <div className="flex max-w-(--field-max) flex-col gap-1.5">
      <label htmlFor={args.id} className="text-sm font-medium leading-tight">
        Systems
      </label>
      <ReferenceMultiSelect {...args} />
      <p id="reference-select-story-hint" className="text-xs text-ink-muted">
        The order is what the graph draws in sequence.
      </p>
    </div>
  ),
}

/** A story-local controlled wrapper, since the block holds no selection. */
function Controlled(args: ReferenceMultiSelectProps) {
  const [ids, setIds] = useState<string[]>([systemIds[0]!])
  return <ReferenceMultiSelect {...args} value={ids} onChange={setIds} />
}

/**
 * A pick goes on the end, and the chosen row leaves the list it came from.
 */
export const Live: Story = {
  name: 'Picking appends, removing takes it back',
  render: (args) => <Controlled {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const first = campaignCase.systems[0]!.hostname
    await expect(canvas.getByRole('row', { name: first })).toBeInTheDocument()

    await userEvent.click(canvas.getByRole('button', { name: 'Show suggestions' }))
    const rows = await within(document.body).findAllByRole('option')
    // The chosen row has left the list.
    await expect(rows).toHaveLength(SYSTEMS.size - 1)
    await expect(rows.map((row) => row.textContent)).not.toContain(first)

    const second = rows[0]!.textContent
    await userEvent.click(rows[0]!)
    // The popover marks the page behind it `aria-hidden`, so the tags are only
    // reachable once it is shut.
    await userEvent.keyboard('{Escape}')
    await expect(await canvas.findByRole('row', { name: second })).toBeInTheDocument()
  },
}
