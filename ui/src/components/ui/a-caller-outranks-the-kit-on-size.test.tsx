import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Stepper, StepperItem, StepperNav, StepperSeparator } from './stepper'
import { Timeline, TimelineItem, TimelineSeparator } from './timeline'

/**
 * A caller's size wins against the kit's own.
 *
 * A variant-prefixed class compiles to an attribute selector, which outranks
 * a caller's bare class whatever `cn` does: the two carry different variants,
 * so tailwind-merge keeps both and the stylesheet decides. The component knows
 * its own orientation, so it picks and emits the default unprefixed, and the
 * two then sit at equal specificity where the merge can settle it. -> #897
 *
 * jsdom resolves no CSS, so what is read is the class list. A prefixed size
 * surviving beside the caller's is the defect: both are in the attribute, and
 * only a browser would show which won.
 */
const sizes = (el: Element, axis: 'h' | 'w') =>
  el.className.split(/\s+/).filter((one) => new RegExp(`(^|:)${axis}-`).test(one))

/** Every class the part drew, so a branch rendering the other axis is visible. */
const drawn = (el: Element) => new Set(el.className.split(/\s+/).filter(Boolean))

describe('a caller outranks the kit on size', () => {
  it.each([
    ['vertical', 'h'],
    ['horizontal', 'w'],
  ] as const)('lets a caller set the timeline separator %s size', (orientation, axis) => {
    const { container } = render(
      <Timeline orientation={orientation}>
        <TimelineItem step={1}>
          <TimelineSeparator className={`${axis}-4`} />
        </TimelineItem>
      </Timeline>,
    )
    const separator = container.querySelector('[data-part="timeline-separator"]')!

    expect(
      sizes(separator, axis),
      'the kit keeps a size of its own beside the one the caller asked for',
    ).toEqual([`${axis}-4`])

    // The axis the caller did not set. Asserting only their own leaves a
    // branch rendering the other orientation's classes entirely green.
    const other = orientation === 'vertical' ? 'w-0.5' : 'h-0.5'
    expect(drawn(separator), `the ${orientation} line drew the other axis`).toContain(other)
  })

  it.each([
    ['vertical', 'h', 'w-0.5'],
    ['horizontal', 'h', 'flex-1'],
  ] as const)('lets a caller set the stepper separator size, %s', (orientation, axis, other) => {
    const { container } = render(
      <Stepper orientation={orientation}>
        <StepperNav>
          <StepperItem step={1}>
            <StepperSeparator className={`${axis}-4`} />
          </StepperItem>
        </StepperNav>
      </Stepper>,
    )
    const separator = container.querySelector('[data-part="stepper-separator"]')!

    expect(sizes(separator, axis)).toEqual([`${axis}-4`])
    expect(drawn(separator), `the ${orientation} line drew the other axis`).toContain(other)
  })
})
