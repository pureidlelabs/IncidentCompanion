import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { campaignCase } from '@/fixtures/campaign'

import { TimelineGraphScreen } from './timeline-graph'

/**
 * The card behind the cascade clips to its own radius, so the readout stuck to
 * its top cannot paint over the corners the border curves away from.
 *
 * **The readout is `sticky`, which is why the clip is a `clip-path` and not
 * `overflow-hidden`**: a scrollport is what a sticky child positions against,
 * so hiding overflow here would move the thing it is meant to leave alone.
 *
 * jsdom has no geometry, and a `clip-path` is paint-only, so nothing in this
 * suite can see the clip cut. What it does, and what it is worth, are measured
 * in the commit that added it.
 */
describe('the cascade card', () => {
  function card(): HTMLElement {
    const { container } = render(<TimelineGraphScreen kase={campaignCase} />)
    const found = container.querySelector('[data-part="cascade-readout"]')?.parentElement
    if (!(found instanceof HTMLElement)) throw new Error('the readout has no card around it')
    return found
  }

  it('clips itself to the radius it draws', () => {
    expect(
      card().className,
      'the card no longer clips to its radius, so the readout stuck to its top paints ' +
        'over the corners the border curves away from',
    ).toContain('[clip-path:inset(0_round_var(--radius-sm))]')
  })

  it('still draws the radius it clips to', () => {
    expect(
      card().className,
      'the clip rounds to a radius the card no longer has, which clips a square box to ' +
        'a curve nothing draws',
    ).toContain('rounded-sm')
  })
})
