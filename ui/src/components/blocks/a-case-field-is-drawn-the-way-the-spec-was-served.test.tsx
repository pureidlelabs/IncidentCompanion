/**
 * **The case renderer honours the served field, the way its sibling does.**
 *
 * `case-fields.tsx` and `field-control.tsx` both draw a `FieldSpec`, on
 * purpose: a case form and a collection row are different shapes. What is not
 * on purpose is one of them silently dropping a property the other reads, and
 * this holds the narrower one to the wider one on the properties a case form
 * actually carries. -> #661
 *
 * **Built from the served document**, so a field named here has to be one an
 * install serves. `specs.controller.test.ts` holds `fixtures/specs.json` equal
 * to what `GET /api/specs` answers, which is what stops a hand-written fixture
 * proving a defect no install can produce.
 *
 * **What this does not cover:** the layout a lifted cap buys, which jsdom
 * cannot see, and the entity renderer, which reads these already.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { fieldOf, formSpec, type FormSpec } from '@/api/specs'
import { specsFixture } from '@/fixtures/specs'

import { CaseFields } from './case-fields'
import { spansRow } from './form-section'

const CASE_FORM: FormSpec = formSpec(specsFixture, 'CASE_FIELDS')

/** The field's own root, where `Field` puts the width cap. */
const draw = (names: readonly string[]) =>
  render(<CaseFields form={CASE_FORM} names={names} values={{}} onChange={() => undefined} />)
    .container

describe('a case field drawn from the served form', () => {
  /**
   * **The cap is the whole of what spanning a row buys.** `Field` caps every
   * field at `--field-max`, and `spansRow` is the shared rule for lifting it -
   * the entity renderer passes `max-w-none` on exactly that rule. A case
   * renderer ignoring it draws a 4000-character summary in a 24rem box.
   */
  it('lifts the width cap on a field the spec says spans its row', () => {
    const summary = fieldOf(CASE_FORM, 'summary')
    expect(summary, 'the served form carries no summary, so this asserts nothing').toBeDefined()
    expect(
      spansRow(summary!),
      'summary no longer spans its row, so this case is pointed at the wrong field',
    ).toBe(true)

    const root = draw(['summary']).querySelector('[data-field="summary"]')

    expect(
      root?.className,
      'the case renderer kept the cap on a field the spec spans, so the same served field ' +
        'draws narrower here than in every dialog that edits one',
    ).toContain('max-w-none')
  })

  it('keeps the cap on a field the spec does not span', () => {
    const customer = fieldOf(CASE_FORM, 'customer')
    expect(spansRow(customer!), 'customer now spans its row, so this case proves nothing').toBe(
      false,
    )

    const root = draw(['customer']).querySelector('[data-field="customer"]')

    expect(root?.className).not.toContain('max-w-none')
  })

  /**
   * **Hardening rather than a reported symptom.** No form serves an option
   * label today - every one in the served document belongs to the compliance
   * form, which `compliance-field.tsx` draws - so this asserts the
   * pass-through rather than a sentence an analyst has read. -> #689
   */
  it('passes an option label through to the control that reads it', () => {
    const labelled = {
      ...CASE_FORM,
      fields: [
        {
          name: 'status',
          label: 'Status',
          kind: 'select',
          options: ['open', 'closed'],
          optionLabels: { open: 'Still open' },
        },
      ],
    } as unknown as FormSpec

    render(
      <CaseFields
        form={labelled}
        names={['status']}
        values={{ status: 'open' }}
        onChange={() => undefined}
      />,
    )

    expect(screen.getByRole('button').textContent).toContain('Still open')
  })
})
