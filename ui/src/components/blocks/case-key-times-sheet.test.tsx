import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { CaseKeyTimesSheet } from './case-key-times-sheet'

/**
 * **The trigger is a glyph, and its name is not on screen.**
 *
 * A labelled button spends the header on a word the analyst reads once, and
 * the panel is one of several a screen can pull out. What the accessible name
 * has to survive is the label being deleted: an icon button whose name went
 * with its text announces itself as nothing at all, and no story catches that
 * because a story finds the button by the name it is asserting.
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
