import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { TONE_FILL, TONE_STRIPE } from '@/components/blocks/severity-badge'
import { campaignCase } from '@/fixtures/campaign'

import { TimelineGraphScreen } from './timeline-graph'

/**
 * The run's severity stripe is the button's own paint.
 *
 * A child box with square corners paints over the corners the radius removes.
 * Clipping the child is the fix a reader reaches for, and `probe.js` skips a
 * clipped box rather than reading it, so it buys silence. -> #915
 *
 * jsdom resolves no CSS, so none of this sees a pixel: the stripe is read as
 * the classes that would draw it. Colour fidelity and the corner itself are
 * the browser tier's.
 */
describe('a cascade run', () => {
  function runs(): HTMLElement[] {
    const { container } = render(<TimelineGraphScreen kase={campaignCase} />)
    const found = container.querySelectorAll('[data-part="cascade-run"]')
    if (found.length === 0) throw new Error('no run on the screen')
    return [...found].filter((node): node is HTMLElement => node instanceof HTMLElement)
  }

  it('paints the stripe itself, on every run', () => {
    for (const run of runs()) {
      expect(run.className).toContain('[background-image:linear-gradient(')
    }
  })

  /**
   * A response is the case the severity does not decide: it reads `none` and
   * stripes `done`, so the two are asserted apart rather than together.
   */
  it('takes the tone from the run rather than from one constant', () => {
    const seen = new Set<string>()
    for (const run of runs()) {
      const tone = run.className.includes('flex-row-reverse')
        ? 'done'
        : (run.dataset.severity ?? '')
      const expected = TONE_STRIPE[tone as keyof typeof TONE_STRIPE]
      expect(expected, `no stripe declared for the tone ${tone}`).toBeDefined()
      expect(run.className, `the run reading ${tone} paints another tone`).toContain(expected)
      seen.add(tone)
    }
    expect(
      seen.size,
      'every run painted one tone, so nothing ties the stripe to the run',
    ).toBeGreaterThan(1)
  })

  it('paints the stripe on the side the run reads from', () => {
    for (const run of runs()) {
      const reversed = run.className.includes('flex-row-reverse')
      expect(
        run.className,
        `a run laid out ${reversed ? 'in reverse' : 'forwards'} stripes the far side`,
      ).toContain(reversed ? 'to_left' : 'to_right')
    }
  })

  it('declares a stripe for every tone that has a fill', () => {
    expect(Object.keys(TONE_STRIPE).sort()).toEqual(Object.keys(TONE_FILL).sort())
  })

  it('leaves the spacer unpainted', () => {
    for (const run of runs()) {
      const spacer = run.querySelector('span[aria-hidden]')
      expect(
        spacer?.className,
        'the spacer still carries a fill, so it paints past the corner',
      ).not.toMatch(/\bbg-/)
    }
  })
})
