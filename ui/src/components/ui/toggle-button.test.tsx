import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ToggleButton } from './toggle-button'

/**
 * The selected ground, and the one thing about it that has no other tier.
 *
 * The ground is `absolute inset-0 -z-10`, and a negative-z child paints *above
 * its parent's background* -- so on a caller that has its own selected
 * background it covers it rather than sitting behind. jsdom lays nothing out
 * and cannot see the result, so the check is on whether the element is drawn
 * at all.
 */
const indicator = () => document.querySelector('[data-slot="toggle-button-indicator"]')

describe('the selected ground', () => {
  it('is drawn when the button is selected', () => {
    render(<ToggleButton isSelected>Outline</ToggleButton>)

    expect(screen.getByRole('button', { name: 'Outline' })).toBeInTheDocument()
    expect(indicator()).not.toBeNull()
  })

  it('is absent when the button is not selected', () => {
    render(<ToggleButton>Outline</ToggleButton>)

    expect(indicator()).toBeNull()
  })

  /**
   * The filter chip paints `bg-ink text-background` itself.
   */
  it('is withheld where the caller paints its own', () => {
    render(
      <ToggleButton isSelected ground={false} className="bg-ink text-background">
        Sign-in
      </ToggleButton>,
    )

    expect(screen.getByRole('button', { name: 'Sign-in' })).toBeInTheDocument()
    expect(indicator()).toBeNull()
  })
})
