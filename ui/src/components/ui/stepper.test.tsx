import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Stepper } from './stepper'

/**
 * The width, which is the whole of what orientation changes about the frame.
 *
 * **What this cannot see is the defect itself.** jsdom lays nothing out, so a
 * rail that eats the row and pushes the body off the viewport measures the same
 * as one that does not: the vertical rail takes the row and the wizard's body
 * renders past the viewport. What is asserted here is the class that causes
 * it; the geometry belongs to the story tier.
 *
 * **A caller cannot correct this from the outside**, so it is the component's
 * business: `cn` merges by property, so a `shrink-0` passed in by `wizard.tsx`
 * never conflicts with a width and both survive.
 */
const frame = (el: HTMLElement) => el.querySelector('[data-slot="stepper"]')

describe('the stepper frame', () => {
  it('fills the row when horizontal, which is what a step bar is', () => {
    const { container } = render(
      <Stepper value={1} orientation="horizontal" aria-label="Steps">
        <div />
      </Stepper>,
    )

    expect(frame(container)?.className).toContain('w-full')
  })

  it('sizes to its content when vertical, so the body keeps the rest', () => {
    const { container } = render(
      <Stepper value={1} orientation="vertical" aria-label="Steps">
        <div />
      </Stepper>,
    )

    expect(frame(container)?.className).not.toContain('w-full')
  })
})
