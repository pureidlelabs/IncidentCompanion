import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { campaignCase } from '@/fixtures/campaign'

import { TimelineGraphScreen } from './timeline-graph'

/**
 * The run's severity stripe is the button's own paint.
 *
 * A child box with square corners paints over the corners the radius removes,
 * and it cannot be clipped away here: the clip would sit on the button and cut
 * its own focus ring. -> #915
 */
describe('a cascade run', () => {
  function run(): HTMLElement {
    const { container } = render(<TimelineGraphScreen kase={campaignCase} />)
    const found = container.querySelector('[data-part="cascade-run"]')
    if (!(found instanceof HTMLElement)) throw new Error('no run on the screen')
    return found
  }

  it('paints the stripe itself', () => {
    expect(run().className).toContain('[background-image:linear-gradient(')
  })

  it('takes the tone as a value, not as a fill class', () => {
    expect(run().className).toMatch(/\[--tone-stripe:var\(--/)
  })

  it('leaves the spacer unpainted', () => {
    const spacer = run().querySelector('span[aria-hidden]')
    expect(
      spacer?.className,
      'the spacer still carries a fill, so it paints past the corner',
    ).not.toMatch(/\bbg-/)
  })
})
