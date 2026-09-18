import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Slider } from './slider'

/**
 * A width the caller passes is the width the slider takes.
 *
 * **Asserted on the class list, because the harness cannot see a box.** jsdom
 * gives every element a zero rectangle, so the rendered width is not available
 * to read; what is readable is whether the component left a rival width in
 * place. It did: `orientation-horizontal:w-full` and `w-64` are different
 * variants, so the merge keeps both and the attribute selector outranks the
 * bare class -- which no ordering on the caller's side can undo.
 *
 * The walk is what can see the consequence, and reported it as `asks for 256px
 * and computes 96.9px`.
 */
describe('a caller can size the slider', () => {
  function root(className: string): HTMLElement {
    const { container } = render(<Slider label="Confidence" defaultValue={60} className={className} />)
    const found = container.querySelector('[data-part="slider"]')
    if (!(found instanceof HTMLElement)) throw new Error('the slider root is not in the markup')
    return found
  }

  it('keeps the width it was given', () => {
    expect(root('w-64').className).toContain('w-64')
  })

  it('leaves no width of its own that applies lying down', () => {
    const classes = root('w-64').className.split(/\s+/)
    // `orientation-vertical:` is the one rival that belongs here: standing up
    // is meant to outrank the lying-down width, caller's or component's.
    const rivals = classes.filter(
      (one) =>
        /(^|:)w-(full|auto|screen|\d)/.test(one) &&
        one !== 'w-64' &&
        !one.startsWith('orientation-vertical:'),
    )
    expect(
      rivals,
      'the slider carries another width alongside the one it was given, and a variant ' +
        'outranks a bare class however the merge orders them',
    ).toEqual([])
  })

  it('still fills its row when the caller asks for no width', () => {
    expect(root('min-w-0').className).toContain('w-full')
  })
})
