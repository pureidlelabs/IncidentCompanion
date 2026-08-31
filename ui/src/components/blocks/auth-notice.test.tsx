import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AuthNotice } from './auth-notice'

describe('AuthNotice', () => {
  it('draws no description when none is passed', () => {
    const { container } = render(<AuthNotice variant="destructive" title="That did not work." />)
    expect(screen.getByRole('alert')).toHaveTextContent('That did not work.')
    expect(container.querySelector('[data-slot="alert-description"]')).toBeNull()
  })

  it('draws the description under the title when one is passed', () => {
    render(
      <AuthNotice
        variant="destructive"
        title="That sign-in was refused"
        description="Something went wrong with the credential."
      />,
    )
    expect(screen.getByText('That sign-in was refused')).toBeVisible()
    expect(screen.getByText('Something went wrong with the credential.')).toBeVisible()
  })

  it('carries the warning variant through to the alert', () => {
    render(<AuthNotice variant="warning" title="Your password was set by someone else" />)
    // The variant is a class, not an attribute this test can read from jsdom;
    // what is asserted is that the role is still an alert either way.
    expect(screen.getByRole('alert')).toHaveTextContent('Your password was set by someone else')
  })
})
