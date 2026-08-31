import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { NewPasswordPair } from './new-password-pair'

describe('NewPasswordPair', () => {
  it('does not mark a blank repeat invalid', () => {
    render(
      <NewPasswordPair
        newLabel="Password"
        repeatLabel="Repeat password"
        secret="a-long-enough-one"
        onSecretChange={() => undefined}
        repeat=""
        onRepeatChange={() => undefined}
      />,
    )
    expect(screen.getByLabelText('Repeat password')).not.toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByText('The passwords do not match')).toBeNull()
  })

  it('marks the repeat invalid once it disagrees with the secret', () => {
    render(
      <NewPasswordPair
        newLabel="Password"
        repeatLabel="Repeat password"
        secret="a-long-enough-one"
        onSecretChange={() => undefined}
        repeat="something-else"
        onRepeatChange={() => undefined}
      />,
    )
    const repeat = screen.getByLabelText('Repeat password')
    expect(repeat).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('The passwords do not match')).toBeVisible()
  })

  it('draws no description on the repeat box when none is passed', () => {
    render(
      <NewPasswordPair
        newLabel="New password"
        repeatLabel="Repeat new password"
        secret=""
        onSecretChange={() => undefined}
        repeat=""
        onRepeatChange={() => undefined}
      />,
    )
    expect(screen.queryByText(/characters/)).toBeNull()
  })

  it('draws the repeat description when one is passed', () => {
    render(
      <NewPasswordPair
        newLabel="Password"
        repeatLabel="Repeat password"
        repeatDescription="At least 12 characters."
        secret=""
        onSecretChange={() => undefined}
        repeat=""
        onRepeatChange={() => undefined}
      />,
    )
    expect(screen.getByText('At least 12 characters.')).toBeVisible()
  })

  it('carries each label to its own box', () => {
    render(
      <NewPasswordPair
        newLabel="New password"
        repeatLabel="Repeat new password"
        secret=""
        onSecretChange={() => undefined}
        repeat=""
        onRepeatChange={() => undefined}
      />,
    )
    expect(screen.getByLabelText('New password')).toBeVisible()
    expect(screen.getByLabelText('Repeat new password')).toBeVisible()
  })
})
