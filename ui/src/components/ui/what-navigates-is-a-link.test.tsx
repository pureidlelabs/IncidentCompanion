/**
 * A control that takes the analyst somewhere announces itself as a link.
 *
 * **The sweep is the half a component test cannot cover**, and it lives beside
 * this in `navigating-controls-are-links.rule.test.ts`: asserting that
 * `ButtonLink` renders an anchor says nothing about the screen that reached for
 * `Button` and gave it an `href` instead, which is where this rule is actually
 * broken. It is a separate file because a sweep needs `import.meta.url` to be a
 * file URL, and in this project it is not.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Button, ButtonLink } from './button'

describe('a control that navigates', () => {
  it('is announced as a link, not a button', () => {
    render(
      <ButtonLink href="/cases/somewhere" variant="outline">
        Go to the case
      </ButtonLink>,
    )

    const control = screen.getByRole('link', { name: 'Go to the case' })
    expect(
      control.tagName,
      'what navigates is not an anchor, so a screen reader announces it as a button and ' +
        'the analyst cannot open it in a new tab',
    ).toBe('A')
    expect(control.getAttribute('href')).toBe('/cases/somewhere')
  })

  it('is still a button when it acts rather than navigates', () => {
    render(<Button variant="outline">Do the thing</Button>)

    const control = screen.getByRole('button', { name: 'Do the thing' })
    expect(control.tagName).toBe('BUTTON')
  })

})
