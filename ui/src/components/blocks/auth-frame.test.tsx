import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { TextField } from '@/components/ui/text-field'

import { AuthFrame } from './auth-frame'

/**
 * Where the corner cluster sits in the DOM, and what the masthead emits.
 *
 * The corner is *positioned* into the top right and *ordered* after `main`, and
 * only the second half is asserted here - a position is geometry and belongs to
 * `e2e/`. DOM order is what decides the tab sequence, which is the reason the
 * order was chosen: a theme control taking the first tab stop on the sign-in
 * screen is a once-a-day control in front of the credential every time.
 *
 * `toHaveFocus` after a tab is not used, because `AuthFrame` renders no
 * focusable element of its own - the order is the whole of what it controls.
 */

// The kit's field rather than a raw `<input type="password">`:
// `password-fields.test.ts` refuses one anywhere under `src`, and a harness
// standing in for the sign-in form should hold what that form holds.
const form = (
  <form>
    <TextField label="Password" type="password" />
  </form>
)

describe('the corner cluster', () => {
  it('renders after main in DOM order, so the credential is the first tab stop', () => {
    render(
      <AuthFrame title="Sign in" corner={<button type="button">Theme</button>}>
        {form}
      </AuthFrame>,
    )
    const theme = screen.getByRole('button', { name: 'Theme' })
    const credential = screen.getByLabelText('Password')
    // `DOCUMENT_POSITION_FOLLOWING` on the credential's own comparison means
    // the corner comes after it, which is the tab order the browser derives.
    expect(
      credential.compareDocumentPosition(theme) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('draws no corner element when none is passed', () => {
    const { container } = render(<AuthFrame title="Sign in">{form}</AuthFrame>)
    const root = container.querySelector('[data-slot="auth-layout"]')
    expect(root?.lastElementChild?.tagName).toBe('MAIN')
  })
})

describe('the masthead', () => {
  it('emits exactly one h1, which is the title', () => {
    render(<AuthFrame title="Sign in">{form}</AuthFrame>)
    const headings = screen.getAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent('Sign in')
  })

  it('draws no lede paragraph when none is passed', () => {
    render(<AuthFrame title="Sign in">{form}</AuthFrame>)
    expect(screen.queryByRole('paragraph')).toBeNull()
  })

  it('draws the lede under the title when one is passed', () => {
    render(
      <AuthFrame title="Sign in" lede="Use the account your administrator gave you.">
        {form}
      </AuthFrame>,
    )
    expect(screen.getByText('Use the account your administrator gave you.')).toBeInTheDocument()
  })
})
