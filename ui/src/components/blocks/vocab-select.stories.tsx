import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, fn, waitFor, within } from 'storybook/test'

import { Field } from '@/components/ui/field'
import { VocabSelect } from './vocab-select'

const SEVERITY = ['critical', 'high', 'medium', 'low', 'informational']
const SEVERITY_LABELS = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  informational: 'Informational',
}

/** The tone a served word is painted in, supplied by the caller. */
const TONE: Record<string, string> = {
  critical: 'bg-severity-critical',
  high: 'bg-severity-high',
  medium: 'bg-severity-medium',
  low: 'bg-severity-low',
  informational: 'bg-severity-info',
}

/** Holds the value, since the control does not. */
function Held({
  initial = '',
  ...props
}: { initial?: string } & Omit<
  Parameters<typeof VocabSelect>[0],
  'value' | 'onValueChange'
> & { onValueChange?: (next: string) => void }) {
  const [value, setValue] = useState(initial)
  return (
    <VocabSelect
      {...props}
      value={value}
      onValueChange={(next) => {
        setValue(next)
        props.onValueChange?.(next)
      }}
    />
  )
}

/**
 * The select every served vocabulary is drawn with.
 */
const meta = {
  title: 'Blocks/Form/Vocab select',
  component: VocabSelect,
  parameters: { layout: 'centered' },
  args: {
    'aria-label': 'Severity',
    value: 'high',
    onValueChange: fn(),
    options: SEVERITY,
    optionLabels: SEVERITY_LABELS,
  },
  render: (args) => (
    <div className="w-64">
      <Held {...args} initial={args.value} />
    </div>
  ),
} satisfies Meta<typeof VocabSelect>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Picked, with the vocabulary's own labels on the rows.
 */
export const Default: Story = {
  args: { allowEmpty: false },
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByRole('button')).toHaveTextContent('High')

    await userEvent.click(canvas.getByRole('button'))
    const list = await within(document.body).findByRole('listbox')
    // Five served words and nothing else: no way to unset what must be set.
    await expect(within(list).getAllByRole('option')).toHaveLength(SEVERITY.length)
    await userEvent.keyboard('{Escape}')
  },
}

/** Open, so the rows and the tick are on the page. */
export const Open: Story = {
  // Its own docs frame: the list is a popover, and the autodocs page renders
  // every story into one document for it to be drawn over.
  parameters: { docs: { story: { inline: false, height: '380px' } } },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button'))

    const list = await within(document.body).findByRole('listbox')
    // The served words, drawn under the labels the caller gave them. Waited
    // for: the popover rises in, so its rows are in the document a frame
    // before they are painted.
    await waitFor(() => {
      for (const label of Object.values(SEVERITY_LABELS)) {
        void expect(within(list).getByRole('option', { name: label })).toBeVisible()
      }
    })
    await expect(
      within(list).getByRole('option', { name: 'High' }),
    ).toHaveAttribute('aria-selected', 'true')
  },
}

/**
 * The two ways a value can be absent, side by side.
 */
export const Empty: Story = {
  render: () => (
    <div className="flex w-[34rem] gap-4">
      <Held aria-label="Blank row offered" options={SEVERITY} optionLabels={SEVERITY_LABELS} />
      <Held
        aria-label="Blank served"
        options={['', ...SEVERITY]}
        optionLabels={{ '': 'Not stated', ...SEVERITY_LABELS }}
      />
      <Held aria-label="Nothing served yet" options={[]} placeholder="Nothing to pick" />
    </div>
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: /Blank served/ }))
    let list = await within(document.body).findByRole('listbox')

    // One way of saying nothing, not two: the served blank is the only one.
    // The popover animates in, so the option exists a frame before it paints:
    // asserting its box directly is green alone and flaky in a full run, where
    // the machine is busy enough for the animation to still be going.
    const blank = within(list).getByRole('option', { name: 'Not stated' })
    await waitFor(async () => {
      await expect(blank).toBeVisible()
    })
    await expect(within(list).getAllByRole('option')).toHaveLength(SEVERITY.length + 1)
    await userEvent.keyboard('{Escape}')

    // And the control does add one where the vocabulary has none: the same
    // count, from five served words and a blank of the control's own.
    await userEvent.click(canvas.getByRole('button', { name: /Blank row offered/ }))
    list = await within(document.body).findByRole('listbox')
    await expect(within(list).getAllByRole('option')).toHaveLength(SEVERITY.length + 1)
    await userEvent.keyboard('{Escape}')
  },
}

/** A placeholder rather than a value, and a caller's own wording for it. */
export const Placeholder: Story = {
  args: { value: '', options: ['shot-1', 'shot-2'], optionLabels: {}, placeholder: 'No image' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button')).toHaveTextContent('No image')
  },
}

/**
 * A mark for the value, drawn by the caller.
 */
export const Marked: Story = {
  args: {
    value: 'critical',
    renderValue: (option: string, label: string) => (
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <span
          aria-hidden
          className={`size-2 shrink-0 rounded-full ${TONE[option] ?? 'bg-severity-none'}`}
        />
        <span className="truncate">{label}</span>
      </span>
    ),
  },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole('button')).toHaveTextContent('Critical')
    // The caller's mark, painted from the caller's own map.
    await expect(canvasElement.querySelector('.bg-severity-critical')).not.toBeNull()
  },
}

/** Inside a field, which is where most of the call sites put it. */
export const InAField: Story = {
  render: (args) => (
    <div className="flex w-80 flex-col gap-4">
      <Field label="Severity" hint="Drives the report ordering.">
        {(ids) => <Held {...args} {...ids} initial="medium" />}
      </Field>
      <Field label="Severity" problem="Pick one before saving.">
        {(ids) => <Held {...args} {...ids} initial="" />}
      </Field>
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Drives the report ordering.')).toBeVisible()
    await expect(canvas.getByText('Pick one before saving.')).toBeVisible()
  },
}

/** Frozen, for a record nothing may write to. */
export const Disabled: Story = {
  args: { value: 'low', disabled: true },
  play: async ({ canvas }) => {
    const trigger = canvas.getByRole('button')
    await expect(trigger).toBeDisabled()
    // The value stays readable: a gate takes the ability to change an answer,
    // not the answer.
    await expect(trigger).toHaveTextContent('Low')
  },
}

/**
 * A vocabulary longer than anything shipped, with a member named at length.
 */
export const TooMuchData: Story = {
  name: 'Two hundred served words',
  args: {
    value: 'v-0',
    options: Array.from({ length: 200 }, (_, i) => `v-${String(i)}`),
    optionLabels: Object.fromEntries(
      Array.from({ length: 200 }, (_, i) => [
        `v-${String(i)}`,
        i === 0
          ? 'Critical, with regulatory reporting already started and the customer notified'
          : `Category ${String(i)}`,
      ]),
    ),
  },
  play: async ({ canvas, canvasElement }) => {
    const trigger = canvas.getByRole('button')
    const box = canvasElement.querySelector('.w-64')!.getBoundingClientRect()
    // Truncated inside its column rather than carrying it wider.
    await expect(trigger.getBoundingClientRect().right).toBeLessThanOrEqual(box.right + 1)
  },
}
