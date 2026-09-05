import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Button } from './button'

/**
 * **`onClick` is not a spelling this `Button` accepts, and the type is what
 * says so.**
 *
 * React Aria declares `onClick` on `PressEvents` as a deliberate alias for
 * `onPress`, so a handler written that way does fire and does go through the
 * same press handling -- it is not a raw DOM click. What it loses is the
 * `PressEvent`: the handler is handed a `MouseEvent`, so `pointerType` and the
 * modifier state a keyboard or touch activation would carry are not there.
 *
 * **And it walks past `isRefused`.** The refusal works by withholding
 * `onPress`; an `onClick` rides in on the prop spread, so a refused control
 * wired that way fires. That is the reason the prop is refused at the type
 * rather than left as a style preference: `onClick` to `onPress` is the most
 * repeated rename in the migration onto this kit, and one left behind reads
 * correctly in review.
 *
 * This assertion is `tsc`'s rather than vitest's -- a `@ts-expect-error` that
 * stops erroring is itself an error, so widening `ButtonProps` again turns
 * `npm run typecheck` red.
 *
 * **The behaviour this file used to assert is asserted in the story tier
 * instead** -- `Button`'s `Disabled` and `Refused` stories. Both claims are
 * about the tab order and about a tooltip firing, and jsdom gives every element
 * a zero box and portals nothing, so the browser is the only tier that can
 * judge them.
 */
describe('the press handler has one spelling', () => {
  it('refuses `onClick` at the type', () => {
    render(
      // @ts-expect-error `onPress`, not `onClick` -- see this describe's note
      <Button onClick={() => undefined} aria-label="edit">
        Edit
      </Button>,
    )

    expect(screen.getByLabelText('edit')).toBeInTheDocument()
  })
})
