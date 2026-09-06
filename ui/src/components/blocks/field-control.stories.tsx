import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'

import { refOptions } from '@/api/refOptions'
import { fieldOf, formSpec, type FieldSpec } from '@/api/specs'
import { FieldControl } from '@/components/blocks/field-control'
import { Input } from '@/components/ui/input'
import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

type Row = Record<string, unknown>

/** One served field, by form and name. Throws where the form has no such field. */
function served(form: string, name: string): FieldSpec<Row> {
  const field = fieldOf<Row>(formSpec<Row>(specsFixture, form), name)
  if (!field) throw new Error(`${form} serves no field named ${name}`)
  return field
}

/** A served field with one property forced, for a state the fixture has no field in. */
function forced(form: string, name: string, over: Partial<FieldSpec<Row>>): FieldSpec<Row> {
  return { ...served(form, name), ...over }
}

const system = campaignCase.systems[0]!
const evidence = campaignCase.evidence[0]!

const SYSTEMS = refOptions(campaignCase.systems, (row) => row.hostname)
const ACCOUNTS = refOptions(campaignCase.accounts, (row) => row.accountName)
const EVIDENCE = refOptions(campaignCase.evidence, (row) => row.name)

/** The target collection's rows, as the dialog resolves them. */
function optionsFor(field: FieldSpec<Row>): ReadonlyMap<string, string> {
  switch (field.ref?.collection) {
    case 'accounts':
      return ACCOUNTS
    case 'evidence':
      return EVIDENCE
    default:
      return SYSTEMS
  }
}

/**
 * One draft covering every arm: a campaign system row, plus the values the
 * fields on other forms hold.
 */
const DRAFT: Row = {
  ...system,
  systemId: evidence.systemId ?? campaignCase.systems[1]!.id,
  accountIds: campaignCase.accounts.slice(0, 4).map((row) => row.id),
  evidenceIds: campaignCase.evidence.map((row) => row.id),
  subjectCount: 4200,
  notes:
    'Beaconing to 203.0.113.7 every 60 seconds over TLS, with the JA3 hash matching '
    + 'the loader seen on WKS-FIN02. The channel went quiet once the host was isolated, '
    + 'and no second implant has answered since.',
  isolated: true,
  isolatedAt: '2026-08-13T17:21:00Z',
  // A CSV string, which is what the tag arm reads. The campaign rows carry no
  // tags at all, so the story showed an empty field under a name promising
  // stored ones.
  tags: 'beaconing, isolated, finance-vlan',
  colour: '#b91c1c',
}

/** The generic pinned to this file's row type, so the stories' args narrow. */
const Control = FieldControl<Row>

/**
 * `FieldControl` on the React Aria kit: one arm per served `kind`, drawn from
 * the forms `GET /api/specs` publishes and valued from the campaign case.
 *
 * The states below the kinds are what a form owes: unset, filled, refused,
 * advised, gated, edited, and the awkward pairs.
 */
const meta = {
  title: 'Blocks/Form/Field control',
  component: Control,
  parameters: { layout: 'padded' },
  args: {
    field: served('SYSTEM_FIELDS', 'hostname'),
    draft: DRAFT,
    refused: {},
    advice: {},
    optionsFor,
    suggestions: undefined,
    onSet: fn(),
    onLeave: fn(),
  },
} satisfies Meta<typeof Control>

export default meta
type Story = StoryObj<typeof meta>

/**
 * A select with nothing chosen: the trigger says so rather than standing empty
 * or picking the first option on the analyst's behalf.
 */
export const SelectUnset: Story = {
  name: 'select \u2014 nothing chosen yet',
  args: { field: served('SYSTEM_FIELDS', 'verdict'), draft: {} },
  play: async ({ canvas, args }) => {
    await expect(canvas.getByText(args.field.label)).toBeVisible()
    await expect(canvas.getByRole('button')).toBeVisible()
  },
}

/**
 * A checkbox carries its own name, so this arm returns before the `Field`.
 *
 * A `Field` above it would render the label twice -- once as the field's and
 * once as the checkbox's own -- which a screen reader reads out as two things.
 */
export const CheckboxKind: Story = {
  name: 'checkbox \u2014 names itself, with no Field above it',
  args: { field: served('SYSTEM_FIELDS', 'isolated') },
  play: async ({ canvas, args }) => {
    await expect(canvas.getByRole('checkbox', { name: args.field.label })).toBeVisible()
    // Once, not twice: no `Field` label above the control's own.
    await expect(canvas.getAllByText(args.field.label)).toHaveLength(1)
  },
}

/**
 * The colour arm is parked: it names the field and says when it can be set.
 *
 * The control it wants is a 21-swatch band with a fold, and no form this
 * dialog serves carries one. It draws nothing rather than a field that
 * silently does nothing.
 */
export const ColourKind: Story = {
  name: 'color \u2014 parked, and it draws no control',
  args: { field: served('EVENT_FIELDS', 'colour') },
  play: async ({ canvas, canvasElement, args }) => {
    await expect(canvas.getByText(args.field.label)).toBeVisible()
    await expect(canvas.getByText('Set it after creating the entry.')).toBeVisible()
    await expect(canvasElement.querySelector('input, select, textarea')).toBeNull()
  },
}

/** A tag field draws what the row already holds, each removable on its own. */
export const Tags: Story = {
  name: 'tag_select \u2014 the row\u2019s own stored tags',
  args: { field: served('SYSTEM_FIELDS', 'tags') },
  play: async ({ canvas, args }) => {
    await expect(canvas.getByText(args.field.label)).toBeVisible()
    for (const tag of ['beaconing', 'isolated', 'finance-vlan']) {
      await expect(canvas.getByText(tag)).toBeVisible()
    }
    await expect(args.field.kind).toBe('tag_select')
  },
}

/** Nothing typed anywhere: every arm draws its own empty. */
export const Untouched: Story = {
  name: 'Unset \u2014 required, with its hint',
  args: {
    field: forced('SYSTEM_FIELDS', 'hostname', { hint: 'As the agent reports it.' }),
    draft: {},
  },
}

/**
 * What the server said, under the control it was said about.
 *
 * A refusal interrupts, because the save failed and the analyst is about to
 * try again.
 */
export const Refused: Story = {
  name: 'Refused \u2014 the message under the control',
  args: { refused: { hostname: 'That hostname is already in this case.' } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('That hostname is already in this case.')).toBeVisible()
  },
}

/** A hint and a refusal at once: the refusal takes its own line under the hint. */
export const RefusedWithAHint: Story = {
  name: 'Refused, on a required field that also carries a hint',
  args: {
    field: forced('SYSTEM_FIELDS', 'hostname', { hint: 'As the agent reports it.' }),
    draft: {},
    refused: { hostname: 'A name is required.' },
  },
}

/**
 * Advice takes the hint's line rather than a line of its own.
 *
 * Two sentences at 12px under one control compete to be read, so the app says
 * one thing: the schema's hint while there is nothing to advise, and the
 * advice once there is.
 *
 * **Polite, never an alert.** Advice arrives every time a field is left, and
 * an interruption each time sends a screen-reader user tabbing around the
 * form.
 */
export const Advised: Story = {
  name: 'Advice \u2014 it takes the hint line, and announces politely',
  args: { advice: { hostname: 'That looks like an IP address, not a hostname.' } },
  play: async ({ canvas, canvasElement }) => {
    const said = canvas.getByText('That looks like an IP address, not a hostname.')
    await expect(said).toBeVisible()

    // Announced, and announced politely rather than as an alert.
    const live = canvasElement.querySelector('[aria-live]')
    await expect(live).not.toBeNull()
    await expect(live).toHaveAttribute('aria-live', 'polite')
    await expect(canvasElement.querySelector('[role="alert"]')).toBeNull()
  },
}

/**
 * A shut gate, forced onto this field rather than read off a served one, so
 * the story does not depend on which forms happen to carry `enabledBy`.
 */
export const Gated: Story = {
  name: 'A shut gate \u2014 the control is greyed, not hidden',
  args: {
    field: forced('SYSTEM_FIELDS', 'isolatedAt', { enabledBy: 'contained' }),
    draft: { ...DRAFT, contained: false },
  },
  play: async ({ canvas, canvasElement, args }) => {
    // Greyed, not gone: hiding it jumps the group's height as the gate opens.
    await expect(canvas.getByText(args.field.label)).toBeVisible()
    const control = canvasElement.querySelector('input, button, [role="button"]')
    await expect(control).not.toBeNull()
    await expect(control).toBeDisabled()
  },
}

/** The same gate, on the arm that returns before the `Field` and its id bundle. */
export const GatedCheckbox: Story = {
  name: 'A shut gate on a checkbox',
  args: {
    field: forced('SYSTEM_FIELDS', 'isolated', { enabledBy: 'contained' }),
    draft: { ...DRAFT, contained: false },
  },
  play: async ({ canvas, args }) => {
    // This arm returns before the id bundle exists, so the gate is honoured
    // separately here -- and was the one branch nothing pointed at.
    await expect(canvas.getByRole('checkbox', { name: args.field.label })).toBeDisabled()
  },
}

/** A gate on a reference field, which greys the picker and keeps the chips. */
export const GatedReference: Story = {
  name: 'A shut gate on a multi-reference',
  args: {
    field: forced('EVENT_FIELDS', 'accountIds', { enabledBy: 'contained' }),
    draft: { ...DRAFT, contained: false },
  },
  play: async ({ canvas, args }) => {
    await expect(canvas.getByText(args.field.label)).toBeVisible()
    // The chips stay readable while the picker is shut.
    await expect(canvas.getAllByRole('button').length).toBeGreaterThan(0)
  },
}

/**
 * An edited field carries a rail, hung outside the grid column.
 *
 * `-ml-2` is what keeps the control level with its neighbours instead of
 * shifting 8px right of them the moment it is touched.
 */
export const Changed: Story = {
  name: 'Edited \u2014 the accent rail',
  args: { changed: true },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.border-l-primary')).not.toBeNull()
  },
}

/** Edited and refused: an accent rail and a destructive message on one field. */
export const ChangedAndRefused: Story = {
  name: 'Edited, then refused',
  args: { changed: true, refused: { hostname: 'That hostname is already in this case.' } },
}

/**
 * Bare, for a detail row that has already drawn the label.
 *
 * The label is hidden rather than dropped, so the control keeps the name a
 * screen reader announces.
 */
export const Bare: Story = {
  name: 'Bare \u2014 inside a detail row that drew the label',
  args: { bare: true },
  play: async ({ canvas, canvasElement, args }) => {
    // The name survives for a screen reader...
    await expect(canvas.getByLabelText(args.field.label)).toBeVisible()
    // ...and the label is taken off the screen rather than out of the tree,
    // read as a box rather than as a class, since the class sits on its
    // wrapper.
    // The wrapper is what carries `sr-only`, and a clipped parent does not
    // shrink the child's own box -- so reading the label would say 251px while
    // nothing is on screen.
    const label = canvasElement.querySelector('[data-slot="label"]')!
    await expect(label.parentElement!.getBoundingClientRect().width).toBeLessThanOrEqual(1)
  },
}

/**
 * The identity tone, for the field that names the row rather than describes
 * it: a shorter control, in a monospaced face.
 */
export const Identity: Story = {
  name: 'Identity tone \u2014 the row itself',
  args: { tone: 'identity' },
  play: async ({ canvas, args }) => {
    const box = canvas.getByLabelText(args.field.label)
    await expect(getComputedStyle(box).fontFamily.toLowerCase()).toMatch(/mono/)
  },
}

/**
 * The caller draws its own control, and the `Field` around it is still this
 * block's.
 *
 * The id bundle is handed over rather than rebuilt, so a caller's control is
 * labelled, described and marked by the same wiring as every other arm.
 */
export const Overridden: Story = {
  name: 'override \u2014 the caller draws its own control inside the Field',
  args: {
    override: (field, ids) => <Input {...ids} readOnly value={`drawn by the caller for ${field.name}`} />,
  },
  play: async ({ canvas, args }) => {
    // Found by the field's own label, which is the wiring the bundle carries.
    const box = canvas.getByLabelText(args.field.label)
    await expect(box).toHaveValue('drawn by the caller for hostname')
    await expect(box).toHaveAttribute('readonly')
  },
}

/** Every arm at once, so spacing and label alignment are comparable down a column. */
export const EveryArm: Story = {
  name: 'Every arm, down one column',
  render: (args) => (
    <div className="flex max-w-md flex-col gap-4">
      {[
        served('SYSTEM_FIELDS', 'hostname'),
        served('SYSTEM_FIELDS', 'systemType'),
        served('SYSTEM_FIELDS', 'analyst'),
        served('IMPACT_FIELDS', 'subjectCount'),
        served('SYSTEM_FIELDS', 'isolatedAt'),
        served('SYSTEM_FIELDS', 'tags'),
        served('EVIDENCE_FIELDS', 'systemId'),
        served('EVENT_FIELDS', 'accountIds'),
        served('SYSTEM_FIELDS', 'isolated'),
        served('EVENT_FIELDS', 'notes'),
      ].map((field) => (
        <Control key={`${field.name}-${field.kind}`} {...args} field={field} />
      ))}
    </div>
  ),
}

/**
 * The longest note an analyst writes, in the arm that takes one.
 *
 * A narrative field is where a shift's worth of writing ends up, and the
 * control grows down rather than pushing the column wider: a field that
 * widened with its content would drag every field beside it out of line.
 */
export const TheLongestText: Story = {
  name: 'A note as long as an analyst writes them',
  args: {
    field: served('EVENT_FIELDS', 'notes'),
    draft: {
      ...DRAFT,
      notes: Array.from(
        { length: 12 },
        (_, i) =>
          `Beaconing to 203.0.113.${String(i + 1)} every 60 seconds over TLS, with the JA3 `
          + 'hash matching the loader seen on WKS-FIN02. The channel went quiet once the '
          + 'host was isolated, and no second implant has answered since.',
      ).join(' '),
    },
  },
  render: (args) => (
    <div style={{ width: 480 }} data-testid="bounded">
      <Control {...args} />
    </div>
  ),
  play: async ({ canvas, canvasElement, args }) => {
    const bound = canvasElement
      .querySelector('[data-testid="bounded"]')!
      .getBoundingClientRect()
    const box = canvas.getByLabelText(args.field.label, { selector: 'textarea' })

    // Down, never out: the control stays inside the width it was given.
    await expect(box.getBoundingClientRect().right).toBeLessThanOrEqual(bound.right + 1)
    // And the text is reachable rather than clipped away.
    await expect(box.scrollHeight).toBeGreaterThan(0)
  },
}
