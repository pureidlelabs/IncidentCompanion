import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { CaseKeyTimesSheet } from './case-key-times-sheet'

/**
 * **The trigger is a glyph, and its name is not on screen.**
 */
describe('the key times trigger', () => {
  it('carries its name without drawing it', () => {
    render(<CaseKeyTimesSheet />)
    const trigger = screen.getByRole('button', { name: 'Key times' })
    expect(
      trigger.textContent.trim(),
      'the trigger draws its label, so the header carries a word rather than a glyph',
    ).toBe('')
  })
})
