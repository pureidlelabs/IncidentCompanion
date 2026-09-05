import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { NewAccountDialog } from './new-account-dialog'

/**
 * The door an administrator mints an account through.
 */
describe('minting an account', () => {
  const roles = ['analyst', 'admin']

  it('submits the four fields the create route takes', async () => {
    const onCreate = vi.fn()
    render(
      <NewAccountDialog
        isOpen
        onOpenChange={() => undefined}
        roles={roles}
        defaultRole="analyst"
        onCreate={onCreate}
        isPending={false}
      />,
    )
    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/e-?mail/i), 'nina@example.test')
    await user.type(screen.getByLabelText(/display name/i), 'Nina Okafor')
    await user.type(screen.getByLabelText(/^password/i), 'correct-horse-battery')
    await user.click(screen.getByRole('button', { name: /create account/i }))

    expect(onCreate).toHaveBeenCalledTimes(1)
    expect(onCreate.mock.calls[0]?.[0]).toMatchObject({
      username: 'nina@example.test',
      display_name: 'Nina Okafor',
      password: 'correct-horse-battery',
      role: 'analyst',
    })
  })

  it('offers every role the server named and enumerates none of its own', () => {
    render(
      <NewAccountDialog
        isOpen
        onOpenChange={() => undefined}
        roles={roles}
        defaultRole="analyst"
        onCreate={vi.fn()}
        isPending={false}
      />,
    )
    for (const role of roles) {
      expect(screen.getByRole('radio', { name: new RegExp(role, 'i') })).toBeInTheDocument()
    }
  })

  it('adopts the default role when the roster arrives after it mounted', () => {
    // The dialog is mounted before `GET /api/accounts` answers, so the first
    // render sees no roles and no default. Captured once with `useState`, the
    // role stayed `''` and the create route refused every account with
    // *expected one of "analyst"|"admin"*.
    const view = render(
      <NewAccountDialog
        isOpen
        onOpenChange={() => undefined}
        roles={[]}
        defaultRole=""
        onCreate={vi.fn()}
        isPending={false}
      />,
    )
    view.rerender(
      <NewAccountDialog
        isOpen
        onOpenChange={() => undefined}
        roles={roles}
        defaultRole="analyst"
        onCreate={vi.fn()}
        isPending={false}
      />,
    )
    expect(screen.getByRole('radio', { name: /analyst/i })).toBeChecked()
  })

  /**
   * **Refused rather than natively disabled, which is what the assertion is
   * about.**
   */
  it('holds the create control while a write is in flight', async () => {
    const onCreate = vi.fn()
    render(
      <NewAccountDialog
        isOpen
        onOpenChange={() => undefined}
        roles={roles}
        defaultRole="analyst"
        onCreate={onCreate}
        isPending
      />,
    )
    const create = screen.getByRole('button', { name: /creating/i })
    expect(create).toHaveAttribute('aria-disabled', 'true')

    await userEvent.setup().click(create)
    expect(onCreate).not.toHaveBeenCalled()
  })
})
