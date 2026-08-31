import type { Meta, StoryObj } from '@storybook/react-vite'
import { Hash } from 'lucide-react'
import { expect } from 'storybook/test'

import {
  Description,
  Field,
  FieldGroup,
  GroupInput,
  Label,
  type FieldControlIds,
} from './field'
import { Input } from './input'
import { TextArea } from './textarea'
import { ListBoxItem } from './list-box'
import { Select } from './select'

/**
 * The ids a `Field` hands down, with the absent ones dropped.
 *
 * **A caller wrapping a React Aria control has to write this.**
 * `FieldControlIds` carries `id` and both `aria-*` as `string | undefined`,
 * because a group-labelled field has no single control to name. Under
 * `exactOptionalPropertyTypes` an explicit `undefined` is not the same as an
 * absent prop, so spreading the object straight into `Select`, `ComboBox` or
 * any other kit control does not compile.
 *
 * `Input` takes the looser native shape and needs none of this. `TextArea`
 * bridges the two spellings itself, so it takes the bundle whole -- which is
 * what a React Aria control inside a `Field` has to do.
 */
function set(ids: FieldControlIds): Record<string, unknown> {
  return Object.fromEntries(Object.entries(ids).filter(([, value]) => value !== undefined))
}

/**
 * The pieces a labelled control is built from: `Label`, `Description`,
 * `FieldError`, and the `FieldGroup` box drawn round the control.
 *
 * **A form should reach for `TextField` and its siblings**, which assemble
 * these already. These parts are for a control the kit does not wrap -- and
 * `Field`, the render-prop form, is for exactly that: it hands down the ids and
 * lets any control take them, so a select, a text box and a file input in one
 * form are labelled and described the same way.
 *
 * `aside` moves the label beside the control rather than above it, for the wide
 * dialog where a column of labels over controls wastes the width.
 */
const meta = {
  title: 'Components/Field',
  component: FieldGroup,
  parameters: { layout: 'centered' },
  args: { size: 'md' },
  render: (args) => (
    <FieldGroup {...args} className="w-72">
      <GroupInput aria-label="Ticket reference" placeholder="INC-0000" />
    </FieldGroup>
  ),
} satisfies Meta<typeof FieldGroup>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The parts, composed by hand. A `TextField` does this for you.
 *
 * The `play` follows the wiring rather than trusting it: the label names the
 * control and the description is announced with it.
 */
export const Parts: Story = {
  render: () => (
    <div className="flex w-72 flex-col gap-1.5">
      <Label id="ticket-label">Ticket reference</Label>
      <FieldGroup>
        <GroupInput
          aria-labelledby="ticket-label"
          aria-describedby="ticket-hint"
          placeholder="INC-0000"
        />
      </FieldGroup>
      <Description id="ticket-hint">The reference the ticketing system holds.</Description>
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText('Ticket reference')).toHaveAttribute(
      'placeholder',
      'INC-0000',
    )
  },
}

/** `FieldGroup` sizes on the `--control-h-*` scale: 28, 32 and 40px. */
export const Sizes: Story = {
  render: ({ size: _size, ...args }) => (
    <div className="flex w-72 flex-col gap-3">
      {(['sm', 'md', 'lg'] as const).map((size) => (
        <FieldGroup {...args} key={size} size={size}>
          <GroupInput aria-label={size} defaultValue={size} />
        </FieldGroup>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const heights = [...canvasElement.querySelectorAll('[data-slot="field-group"]')].map(
      (group) => group.getBoundingClientRect().height,
    )
    await expect(heights).toHaveLength(3)
    for (let index = 1; index < heights.length; index += 1) {
      await expect(heights[index]!).toBeGreaterThan(heights[index - 1]!)
    }
  },
}

/**
 * A group holds adornments beside the control, inside the same box.
 *
 * The adornment sits within the border rather than beside it, which is the
 * reason the group draws the box and the control does not.
 */
export const WithAdornment: Story = {
  render: () => (
    <FieldGroup className="w-72">
      <Hash aria-hidden className="ms-2 size-4 shrink-0 text-ink-muted" />
      <GroupInput aria-label="Port" defaultValue="8443" />
    </FieldGroup>
  ),
  play: async ({ canvas, canvasElement }) => {
    const group = canvasElement.querySelector('[data-slot="field-group"]')!.getBoundingClientRect()
    const box = canvas.getByLabelText('Port').getBoundingClientRect()

    // The control is inside the group's box, not beside it: an adornment that
    // pushed the control out would look almost identical.
    await expect(box.left).toBeGreaterThan(group.left)
    await expect(box.right).toBeLessThanOrEqual(group.right + 1)
  },
}

/** `isDisabled` on the group greys the box; `isInvalid` reddens the border. */
export const States: Story = {
  render: () => (
    <div className="flex w-72 flex-col gap-3">
      <FieldGroup>
        <GroupInput aria-label="Fine" defaultValue="Fine" />
      </FieldGroup>
      <FieldGroup isDisabled>
        <GroupInput aria-label="Disabled" defaultValue="Disabled" disabled />
      </FieldGroup>
      <FieldGroup isInvalid>
        <GroupInput aria-label="Invalid" defaultValue="Invalid" />
      </FieldGroup>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const [fine, , invalid] = [...canvasElement.querySelectorAll('[data-slot="field-group"]')]
    // Read from the computed edge rather than the class list, for the reason
    // `Select`'s story records: a variant can be present and inert.
    await expect(getComputedStyle(invalid!).borderTopColor).not.toBe(
      getComputedStyle(fine!).borderTopColor,
    )
  },
}

/**
 * `Field`, the render-prop wrapper, serving three different controls from one
 * call site.
 *
 * It hands each control the ids to take, so a select, a text box and a
 * multi-line box are labelled and described identically without any of them
 * knowing about the others.
 */
export const EveryControl: StoryObj = {
  name: 'Input, select and textarea in a field',
  render: () => (
    <div className="flex max-w-sm flex-col gap-4">
      <Field label="Description">
        {(ids) => <Input {...ids} defaultValue="Phishing wave delivered" />}
      </Field>
      <Field label="Severity" hint="Drives the case severity when none is stated.">
        {(ids) => (
          <Select {...set(ids)} defaultSelectedKey="high">
            <ListBoxItem id="critical">Critical</ListBoxItem>
            <ListBoxItem id="high">High</ListBoxItem>
            <ListBoxItem id="medium">Medium</ListBoxItem>
            <ListBoxItem id="low">Low</ListBoxItem>
          </Select>
        )}
      </Field>
      <Field label="Notes">{(ids) => <TextArea {...ids} rows={3} />}</Field>
    </div>
  ),
  play: async ({ canvas }) => {
    // Every control is reachable by its label, which is the whole of what
    // `Field` promises whatever it is wrapped around.
    await expect(canvas.getByLabelText('Description')).toBeInTheDocument()
    await expect(canvas.getByLabelText('Notes')).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: /Severity/ })).toBeInTheDocument()
  },
}

/**
 * `aside` puts the label and hint beside the control rather than above it, for
 * the wide dialog where a stacked column wastes the width.
 */
export const BesideItsLabel: StoryObj = {
  name: 'Label and hint beside the control',
  render: () => (
    // 860px, which is the `form` dialog width the arrangement is meant for.
    <div className="flex max-w-[860px] flex-col gap-4">
      <Field
        label="Picture"
        aside
        hint="PNG, JPEG, WebP or GIF, under 2MB. Stored as a small square."
      >
        {(ids) => <Input {...ids} type="file" />}
      </Field>
      <Field
        label="Colour"
        aside
        hint="Shown wherever your picture has not loaded. Your name is always drawn beside the disc, so a colour two of you share costs nothing."
      >
        {(ids) => <Input {...ids} defaultValue="Automatic" />}
      </Field>
      <Field label="Initials" aside hint="Two characters. Blank uses the ones from your name.">
        {(ids) => <Input {...ids} defaultValue="BS" className="w-40" />}
      </Field>
      <Field
        label="Handle"
        aside
        hint="A refusal keeps its message under the control it refused."
        problem="That handle is taken."
      >
        {(ids) => <Input {...ids} defaultValue="bvs" />}
      </Field>
    </div>
  ),
  play: async ({ canvas }) => {
    // Beside, not above: the label's box overlaps the control's rows rather
    // than sitting entirely over it.
    const label = canvas.getByText('Initials').getBoundingClientRect()
    const control = canvas.getByDisplayValue('BS').getBoundingClientRect()
    await expect(label.left).toBeLessThan(control.left)
    await expect(label.top).toBeLessThan(control.bottom)
  },
}

/** A refusal from the server, kept under the control it refused. */
export const FieldRefused: StoryObj = {
  name: 'Carrying the server\u2019s refusal',
  render: () => (
    <div className="max-w-sm">
      <Field
        label="System"
        problem="No system with that id &#x2014; the reference would dangle."
      >
        {(ids) => <Input {...ids} defaultValue="srv-does-not-exist" />}
      </Field>
    </div>
  ),
  play: async ({ canvas }) => {
    const box = canvas.getByLabelText('System')
    const problem = canvas.getByText(/No system with that id/)

    // Under the control rather than above the form, so an analyst reads the
    // refusal beside the thing that was refused.
    await expect(problem.getBoundingClientRect().top).toBeGreaterThan(
      box.getBoundingClientRect().top,
    )
  },
}
