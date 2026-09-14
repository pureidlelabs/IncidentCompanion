/**
 * **A case field's select draws the words the install served, not the wire
 * value behind them.**
 *
 * The served form carries `optionLabels` beside its `options`, and every
 * entity dialog draws them -- `field-control.tsx` passes the prop and
 * `VocabSelect` reads it. The case renderer dropped it, so the two doors that
 * create a case showed `data_breach` where every other screen shows *Data
 * breach*. -> #661
 *
 * **Both renderers exist on purpose**, because the case form and an entity
 * form are different shapes; what drifted is one of them silently losing a
 * field the spec carries. That is why this asserts against the served spec
 * rather than against a list of labels.
 *
 * **What this does not cover:** which labels an install serves, which is the
 * server's, and the entity renderer, which passes the prop already.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { FormSpec } from '@/api/specs'

import { CaseFields } from './case-fields'

/** A served form with one select whose values are not what a person reads. */
const FORM = {
  name: 'CASE_FIELDS',
  fields: [
    {
      name: 'rsitClass',
      label: 'Classification',
      kind: 'select',
      options: ['data_breach', 'availability'],
      optionLabels: { data_breach: 'Data breach', availability: 'Availability' },
    },
  ],
} as unknown as FormSpec

const draw = (value = 'data_breach') =>
  render(
    <CaseFields
      form={FORM}
      names={['rsitClass']}
      values={{ rsitClass: value }}
      onChange={() => undefined}
    />,
  )

/**
 * What the closed control reads as.
 *
 * **The trigger, not the document.** The kit draws a button over a native
 * `<select>`, so every option's text is in the tree whether or not it is the
 * one chosen -- a document-wide search finds the wire value either way and
 * says nothing about what an analyst sees.
 */
const shown = () => screen.getByRole('button').textContent

describe('a case field drawn from the served form', () => {
  it('shows the label an install gave the value', () => {
    draw()

    expect(
      shown(),
      'the select drew the wire value, so the two doors that create a case read differently ' +
        'from every dialog that edits one',
    ).toContain('Data breach')
  })

  it('does not show the wire value in its place', () => {
    draw()

    expect(shown()).not.toContain('data_breach')
  })

  /**
   * **A value the install labelled nothing still draws.** A pack that names
   * fewer options than the vocabulary must not blank the control.
   */
  it('falls back to the value where the install labelled none', () => {
    const bare = {
      name: 'CASE_FIELDS',
      fields: [{ name: 'rsitClass', label: 'Classification', kind: 'select', options: ['other'] }],
    } as unknown as FormSpec

    render(
      <CaseFields
        form={bare}
        names={['rsitClass']}
        values={{ rsitClass: 'other' }}
        onChange={() => undefined}
      />,
    )

    expect(shown()).toContain('other')
  })
})
