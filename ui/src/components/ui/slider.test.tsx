import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Slider } from './slider'

/** What a screen reader would read out for `el`, following `aria-labelledby`. */
function announced(el: HTMLElement): string {
  const own = el.getAttribute('aria-label')
  const ids = (el.getAttribute('aria-labelledby') ?? '').split(/\s+/).filter(Boolean)
  // `aria-labelledby` wins over `aria-label` wherever both are present, which
  // is the whole of this defect: a per-grip `aria-label` React Aria never
  // stops pointing past is dead text.
  if (ids.length > 0) {
    return ids
      .map((id) => el.ownerDocument.getElementById(id)?.textContent ?? '')
      .join(' ')
      .trim()
  }
  return own ?? ''
}

describe('a range slider names each grip', () => {
  /**
   * **The two ends are told apart.**
   *
   * Asserted on what an assistive technology would resolve rather than on the
   * attribute: the bug is that the wrong attribute wins, so reading the one
   * that lost would pass over it.
   */
  it('gives the low and high grips different names', () => {
    render(
      <Slider
        label="Window"
        thumbLabels={['Start', 'End']}
        defaultValue={[10, 20]}
        aria-label="Window"
      />,
    )
    const [low, high] = screen.getAllByRole('slider')
    expect(announced(low!)).toContain('Start')
    expect(announced(high!)).toContain('End')
    expect(announced(low!)).not.toBe(announced(high!))
  })

  /**
   * A vertical slider's name is not inside a `display: none` box.
   */
  it('does not hide the name outright when the track stands up', () => {
    render(<Slider label="Confidence" orientation="vertical" defaultValue={40} />)
    const grip = screen.getByRole('slider')
    expect(announced(grip)).toContain('Confidence')
    for (let el = screen.getByText('Confidence').parentElement; el; el = el.parentElement) {
      expect(el.className).not.toContain('orientation-vertical:hidden')
    }
  })
})
