import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ENTRA, SsoSignIn } from './sso-sign-in'

/**
 * The rule is the block's, not the screen's, and `soleMeans` is the only thing
 * that takes it away. A screen drawing its own would put a provider button
 * against a username field with nothing between them.
 */
describe('the SSO door', () => {
  it('draws a rule under the providers, so they read as an alternative', () => {
    const { container } = render(<SsoSignIn providers={[ENTRA]} />)
    expect(container.querySelector('[data-slot="labelled-separator"]')).not.toBeNull()
    expect(screen.getByText('or')).toBeInTheDocument()
  })

  it('takes the rule away where there is nothing on the other side of it', () => {
    const { container } = render(<SsoSignIn providers={[ENTRA]} soleMeans />)
    expect(container.querySelector('[data-slot="labelled-separator"]')).toBeNull()
    expect(screen.getByRole('button', { name: /Entra ID/ })).toBeInTheDocument()
  })

  /** An install with no providers draws no rule and no gap, not an empty band. */
  it('draws nothing at all where no provider is offered', () => {
    const { container } = render(<SsoSignIn providers={[]} />)
    expect(container.querySelector('[data-slot="sso-sign-in"]')).toBeNull()
  })

  /** Offered but unwired: the button says the install has it and refuses the press. */
  it('disables a provider it was given no way to choose', () => {
    render(<SsoSignIn providers={[ENTRA]} />)
    expect(screen.getByRole('button', { name: /Entra ID/ })).toBeDisabled()
  })
})
