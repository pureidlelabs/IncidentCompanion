/**
 * The refusal row, which the field and the dialog now share.
 *
 * Written when they were two components: the dialog's copy had these three
 * properties under test and the field's copy had none, so the field's row
 * could have lost its reserved height without anything going red.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Field } from './field'
import { Input } from './input'
import { Problem } from './problem'

describe('the problem row', () => {
  /**
   * **Reserved before there is anything to say.** A refusal appearing from
   * nothing pushes the footer down at the moment somebody is reaching for the
   * button in it, which is the frame moving when it matters most.
   */
  it('holds its height while empty', () => {
    render(<Problem data-testid="p">{null}</Problem>)
    const row = screen.getByTestId('p')
    expect(row).toHaveClass('min-h-4')
    expect(row).toHaveTextContent('')
  })

  /** An empty live region announces nothing; a filled one announces once. */
  it('is a live region only when it has something to announce', () => {
    const { rerender } = render(<Problem data-testid="p">{null}</Problem>)
    expect(screen.getByTestId('p')).not.toHaveAttribute('role')

    rerender(<Problem data-testid="p">That title is already taken.</Problem>)
    expect(screen.getByRole('alert')).toHaveTextContent('That title is already taken.')
  })

  it('does not scroll away with the body', () => {
    render(<Problem data-testid="p">something</Problem>)
    expect(screen.getByTestId('p')).toHaveClass('shrink-0')
  })
})

describe('a field refusal row', () => {
  /** The same three properties, through the component that renders it. */
  it('reserves its height and announces only once filled', () => {
    const { container, rerender } = render(
      <Field label="Title" problem={undefined}>
        {(ids) => <Input {...ids} readOnly value="" />}
      </Field>,
    )
    expect(screen.queryByRole('alert'), 'nothing to announce yet').toBeNull()
    // The row is there and empty. Asserting only the filled state cannot see
    // the reservation disappear, which is the whole property.
    expect(container.querySelector('.min-h-4'), 'the room is already held').not.toBeNull()

    rerender(
      <Field label="Title" problem="That title is already taken.">
        {(ids) => <Input {...ids} readOnly value="" />}
      </Field>,
    )
    const row = screen.getByRole('alert')
    expect(row).toHaveClass('min-h-4')
    expect(screen.getByLabelText('Title')).toHaveAttribute(
      'aria-describedby',
      row.getAttribute('id'),
    )
  })

  /** A field that can never refuse spends no row on the possibility. */
  it('is absent from a field with no problem prop', () => {
    const { container } = render(
      <Field label="Title">{(ids) => <Input {...ids} readOnly value="" />}</Field>,
    )
    expect(container.querySelector('.min-h-4')).toBeNull()
  })
})
