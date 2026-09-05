import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Input } from './input'

describe('the bare input', () => {
  /**
   * **Whether the box is drawn is not decidable here, and saying so is the
   * point.** jsdom computes no styles, so a class-name assertion is a promise
   * made somewhere else -- this file held one against `.cn-input` and stayed
   * green through the stylesheet behind it being deleted, over a control that
   * rendered with no edge at all.
   *
   * `input.stories.tsx` asserts the rendered border instead, in the
   * browser tier, where a computed style exists.
   */

  /**
   * `exactOptionalPropertyTypes` makes an `undefined`-valued prop a distinct
   * type from an absent one, which is exactly what a `placeholder={maybe}`
   * caller passes. The cast in `input.tsx` exists to carry that value through
   * to React Aria's stricter `InputProps` -- prove it still reaches the DOM.
   */
  it('passes an explicitly undefined optional prop through to the control', () => {
    const placeholder: string | undefined = undefined
    render(<Input aria-label="Title" placeholder={placeholder} />)
    expect(screen.getByLabelText('Title')).not.toHaveAttribute('placeholder')
  })

  it('still sets a placeholder when one is given', () => {
    render(<Input aria-label="Title" placeholder="INC-0000" />)
    expect(screen.getByLabelText('Title')).toHaveAttribute('placeholder', 'INC-0000')
  })
})
