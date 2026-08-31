import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'

import { refOptions } from '@/api/refOptions'
import { fieldsOf, formSpec } from '@/api/specs'
import { FieldControl } from '@/components/blocks/field-control'
import { FieldRow, summarise } from '@/components/blocks/field-row'
import { Input } from '@/components/ui/input'
import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

type Row = Record<string, unknown>

/**
 * `FieldRow` on the React Aria kit: a filled row, an empty one, an edited one
 * and a refused one, plus the band a served form stacks into.
 */
const meta = {
  title: 'Blocks/Form/Field row',
  component: FieldRow,
  parameters: { layout: 'padded' },
  args: {
    label: 'Hostname',
    summary: 'WKS-FIN01',
    filled: true,
    children: <Input aria-label="Hostname" defaultValue="WKS-FIN01" />,
  },
} satisfies Meta<typeof FieldRow>

export default meta
type Story = StoryObj<typeof meta>

/**
 * A row at rest: the label, the value, and the control behind a fold.
 *
 * A band of these is read by scanning the summaries down; opening one is what
 * an analyst does after finding the row they came for.
 */
export const Filled: Story = {
  name: 'A value, folded',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const trigger = canvas.getByRole('button', { name: /Hostname/ })
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(trigger)
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    await expect(canvas.getByRole('textbox', { name: 'Hostname' })).toBeVisible()
  },
}

/**
 * Unset, where the summary is a word standing in for the value rather than a
 * blank.
 *
 * `filled` is what tells the two apart, so a row holding the literal text
 * *Not linked* still reads as a value and one holding nothing reads as absent.
 */
export const Empty: Story = {
  name: 'Unset \u2014 the word standing in for the value',
  args: {
    label: 'Owner',
    summary: 'Not linked',
    filled: false,
    children: <Input aria-label="Owner" defaultValue="" />,
  },
}

/** An edited row carries the accent rail, as the field control does. */
export const Changed: Story = {
  name: 'Edited \u2014 the accent rail',
  args: { changed: true, summary: 'WKS-FIN02' },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.border-l-primary')).not.toBeNull()
  },
}

/**
 * A refusal takes the summary's line rather than a line of its own.
 *
 * The row is one line by construction, and the thing worth reading while a
 * save is refused is why -- not the value that caused it, which is still in
 * the control a fold away.
 */
export const Refused: Story = {
  name: 'Refused \u2014 the message takes the summary line',
  args: { problem: 'A hostname is required.', summary: 'WKS-FIN01' },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('A hostname is required.')).toBeVisible()
    await expect(canvas.queryByText('WKS-FIN01')).not.toBeInTheDocument()
  },
}

/**
 * Both at once, which is the ordinary way a refusal arrives: on a row the
 * analyst just changed.
 *
 * **One rail, and the refusal takes it.** The two rails are the same border,
 * so a row cannot carry both -- and between *you changed this* and *the server
 * would not have it*, the second is the one to act on.
 */
export const RefusedAndChanged: Story = {
  name: 'Refused on a field the analyst edited',
  args: { changed: true, problem: 'That hostname is already in the case.' },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByText('That hostname is already in the case.')).toBeVisible()
    await expect(canvasElement.querySelector('.border-l-destructive')).not.toBeNull()
    await expect(canvasElement.querySelector('.border-l-primary')).toBeNull()
  },
}

/**
 * A served label at its full length, against the row's fixed label column.
 *
 * The column is fixed so a band of rows has one edge down its middle; a label
 * past it truncates rather than pushing the summary along and giving every row
 * a different one.
 */
export const ALongLabel: Story = {
  name: 'A label longer than its column',
  args: {
    label: 'Name (hostname, mailbox, or app name)',
    summary: 'WKS-FIN01',
    children: <Input aria-label="Name" defaultValue="WKS-FIN01" />,
  },
  // A pinned width, because this is a layout claim: at whatever width the
  // canvas happens to be, the text may simply fit and prove nothing.
  render: (args) => (
    <div style={{ width: 420 }}>
      <FieldRow {...args} />
    </div>
  ),
  play: async ({ canvas, args }) => {
    const label = canvas.getByText(args.label)
    // Clipped to one line rather than wrapped. Read as the property that does
    // it: the height alone stays a single line's whether the column holds the
    // text or the text is simply short enough.
    const style = getComputedStyle(label)
    await expect(style.textOverflow).toBe('ellipsis')
    await expect(style.whiteSpace).toBe('nowrap')
    await expect(label.scrollWidth).toBeGreaterThan(label.clientWidth)
  },
}

/**
 * The summary is one line: a value past the measure truncates rather than
 * wraps.
 *
 * A band is scanned down its summaries, and a row twice the height of its
 * neighbours is where that scan stops.
 */
export const ALongValue: Story = {
  name: 'A value past the measure',
  args: {
    label: 'Location',
    summary:
      'Forensic image held in the evidence locker at the Rotterdam office, shelf 4, '
      + 'alongside the original drive and its write-blocker log.',
    children: <Input aria-label="Location" defaultValue="Rotterdam" />,
  },
  // A pinned width, because this is a layout claim: at whatever width the
  // canvas happens to be, the text may simply fit and prove nothing.
  render: (args) => (
    <div style={{ width: 420 }}>
      <FieldRow {...args} />
    </div>
  ),
  play: async ({ canvas, args }) => {
    const line = canvas.getByText(args.summary)
    const style = getComputedStyle(line)
    await expect(style.textOverflow).toBe('ellipsis')
    await expect(style.whiteSpace).toBe('nowrap')
    await expect(line.scrollWidth).toBeGreaterThan(line.clientWidth)
  },
}

/** A refusal longer than the line truncates too, and the control below says it again. */
export const ALongRefusal: Story = {
  name: 'A refusal past the measure',
  args: {
    problem:
      'That hostname is already recorded on another system in this case, so the '
      + 'two rows would resolve to one asset in the graph.',
  },
}

// The band a form stacks into
// ---------------------------------------------------------------------------

const SYSTEMS = refOptions(campaignCase.systems, (row) => row.hostname)
const system = campaignCase.systems[0]! as unknown as Row
const form = formSpec<Row>(specsFixture, 'SYSTEM_FIELDS')

/**
 * Every `SYSTEM_FIELDS` field as a row, summarised the way the entity dialog
 * does it: filled rows, the words standing in for unset ones, and one refusal.
 */
export const AServedForm: Story = {
  name: 'A served form, as a band',
  render: () => (
    <div className="max-w-2xl">
      {fieldsOf(form).map((field) => {
        const { summary, filled } = summarise<Row>(field, system[field.name], (id) =>
          SYSTEMS.get(id),
        )
        return (
          <FieldRow
            key={field.name}
            label={field.label}
            summary={summary}
            filled={filled}
            changed={field.name === 'verdict'}
            {...(field.name === 'zone'
              ? { problem: 'A zone is required once a system is compromised.' }
              : {})}
          >
            <FieldControl<Row>
              field={field}
              draft={system}
              refused={field.name === 'zone' ? { zone: 'A zone is required.' } : {}}
              advice={{}}
              optionsFor={() => SYSTEMS}
              suggestions={undefined}
              bare
              onSet={() => undefined}
              onLeave={() => undefined}
            />
          </FieldRow>
        )
      })}
    </div>
  ),
}
