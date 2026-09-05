import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Button } from './button'

/**
 * **`onClick` is not a spelling this `Button` accepts, and the type is what
 * says so.**
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
