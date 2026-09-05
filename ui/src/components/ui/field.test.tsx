import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Field, FieldItem, FieldItemLabel } from './field'
import { Input } from './input'

describe('a field', () => {
  it('points its label at the control', () => {
    render(<Field label="Description">{(ids) => <Input {...ids} />}</Field>)
    // getByLabelText resolves through `for`/`id`, so this fails if the two
    // are generated independently - the wiring a hand-rolled field forgets.
    expect(screen.getByLabelText('Description')).toBeInTheDocument()
  })

  it('describes the control with its problem, so a reader hears why', () => {
    render(
      <Field label="Password" problem="That does not match.">
        {(ids) => <Input {...ids} />}
      </Field>,
    )
    const control = screen.getByLabelText('Password')
    expect(control).toHaveAccessibleDescription('That does not match.')
    expect(control).toHaveAttribute('aria-invalid', 'true')
  })

  it('is not marked invalid when there is no problem', () => {
    render(<Field label="Username">{(ids) => <Input {...ids} />}</Field>)
    expect(screen.getByLabelText('Username')).toHaveAttribute('aria-invalid', 'false')
  })

  /**
   * **The room is made when the caller can refuse, not when it does.**
   */
  it('reserves the message row for a field that can refuse', () => {
    const { container } = render(
      <Field label="Title" problem={undefined}>
        {(ids) => <input {...ids} />}
      </Field>,
    )
    const row = container.querySelector('.min-h-4')
    expect(row, 'no room was reserved').not.toBeNull()
    expect(row).toHaveTextContent('')
    // Nothing to announce yet, so nothing announces.
    expect(row).not.toHaveAttribute('role', 'alert')
  })

  it('reserves nothing for a field that never refuses', () => {
    const { container } = render(<Field label="Title">{(ids) => <input {...ids} />}</Field>)
    expect(container.querySelector('.min-h-4')).toBeNull()
  })

  it('marks the required field without joining its label', () => {
    render(
      <Field label="Title" required>
        {(ids) => <input {...ids} />}
      </Field>,
    )
    // The marker is a sibling of the label, so the accessible name is clean.
    expect(screen.getByLabelText('Title')).toBeInTheDocument()
  })

  it('gives two fields on one screen different ids', () => {
    render(
      <>
        <Field label="One">{(ids) => <Input {...ids} />}</Field>
        <Field label="Two">{(ids) => <Input {...ids} />}</Field>
      </>,
    )
    expect(screen.getByLabelText('One').id).not.toBe(screen.getByLabelText('Two').id)
  })

  /**
   * **The wiring is what `aside` puts at risk, and nothing else here can see
   * it.** The layout moves the hint into a different column from the control,
   * so the two are no longer siblings; a reader still has to hear the hint as
   * the control's description. jsdom lays nothing out, so this asserts the
   * pairing and says nothing about which side of the form either one is drawn
   * on.
   */
  it('still describes the control with a hint laid out beside it', () => {
    render(
      <Field label="Initials" aside hint="Two characters.">
        {(ids) => <Input {...ids} />}
      </Field>,
    )
    expect(screen.getByLabelText('Initials')).toHaveAccessibleDescription('Two characters.')
  })

  /**
   * A refusal is about the value that was typed, so it stays under the control
   * rather than following the hint into the label's column - and both still
   * reach the accessible description.
   */
  it('keeps hint and problem on one control when laid out beside it', () => {
    render(
      <Field label="Picture" aside hint="Under 2MB." problem="That file is a PDF.">
        {(ids) => <Input {...ids} />}
      </Field>,
    )
    const control = screen.getByLabelText('Picture')
    expect(control).toHaveAccessibleDescription('Under 2MB. That file is a PDF.')
    expect(control).toHaveAttribute('aria-invalid', 'true')
  })

  /**
   * `hideLabel` says the label is already drawn beside the control, so there is
   * nothing to put in the first column and the stacked shell is what renders.
   */
  it('ignores aside when the label is off screen', () => {
    const { container } = render(
      <Field label="Value" aside hideLabel hint="A hint.">
        {(ids) => <Input {...ids} />}
      </Field>,
    )
    expect(container.querySelector('.grid')).toBeNull()
    expect(screen.getByLabelText('Value')).toHaveAccessibleDescription('A hint.')
  })
})

describe('a field item', () => {
  /**
   * A `button[role=checkbox]` is exactly the case the docstring calls out: a
   * plain wrapping `<label>` does not reliably name it, so `FieldItem` wires
   * the pairing by id instead of by nesting.
   */
  it('names a button-shaped control the wrapping label does not reach', () => {
    render(
      <FieldItem>
        <button role="checkbox" aria-checked={false} type="button" />
        <FieldItemLabel>Germany</FieldItemLabel>
      </FieldItem>,
    )
    expect(screen.getByRole('checkbox', { name: 'Germany' })).toBeInTheDocument()
  })

  /** Two options on one screen do not fight over the same id. */
  it('gives two items on one screen different ids', () => {
    render(
      <>
        <FieldItem>
          <button role="checkbox" aria-checked={false} type="button" />
          <FieldItemLabel>One</FieldItemLabel>
        </FieldItem>
        <FieldItem>
          <button role="checkbox" aria-checked={false} type="button" />
          <FieldItemLabel>Two</FieldItemLabel>
        </FieldItem>
      </>,
    )
    const [one, two] = screen.getAllByRole('checkbox')
    expect(one?.id).not.toBe(two?.id)
  })

  /**
   * A control that already carries an id keeps it -- `FieldItem` only mints
   * one when the control has none, so a caller wiring its own id is never
   * overridden from underneath.
   */
  it('keeps the id a control set for itself rather than overwriting it', () => {
    render(
      <FieldItem>
        <button role="checkbox" aria-checked={false} type="button" id="member-de" />
        <FieldItemLabel>Germany</FieldItemLabel>
      </FieldItem>,
    )
    expect(screen.getByRole('checkbox', { name: 'Germany' })).toHaveAttribute('id', 'member-de')
  })
})

/**
 * The collision `FieldControlIds` documents: a React Aria control writes its
 * own `aria-labelledby`, which outranks a bare `<label for>`, so a control
 * that carries a name of its own must have the field's label merged back in
 * rather than relying on `for`/`id` alone.
 */
describe('a field beside a control that names itself', () => {
  it('keeps the control invalid and described even when it ignores id', () => {
    // A select-shaped control: it accepts the ids but points its own
    // `aria-labelledby` at its value, the way `VocabSelect` does.
    function SelfNaming({
      'aria-labelledby': labelledBy,
      'aria-describedby': describedBy,
      'aria-invalid': invalid,
    }: {
      id?: string | undefined
      'aria-labelledby'?: string | undefined
      'aria-describedby'?: string | undefined
      'aria-invalid'?: boolean | undefined
    }) {
      return (
        <button
          type="button"
          role="combobox"
          aria-expanded={false}
          aria-controls="kind-listbox"
          aria-labelledby={labelledBy}
          aria-describedby={describedBy}
          aria-invalid={invalid}
        >
          current value
        </button>
      )
    }

    render(
      <Field label="Kind" problem="Pick one.">
        {(ids) => <SelfNaming {...ids} />}
      </Field>,
    )
    expect(screen.getByRole('combobox')).toHaveAccessibleName(/Kind/)
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-invalid', 'true')
  })
})
