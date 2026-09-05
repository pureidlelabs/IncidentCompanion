/**
 * What the auth and account forms do when they are submitted.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { AccountPanel } from '@/components/blocks/account-dialog'
import { ChangePasswordScreen } from './change-password'
import { FirstRunScreen } from './first-run'
import { SignInScreen } from './sign-in'

describe('sign in', () => {
  it('refuses an empty form rather than submitting it', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<SignInScreen onSubmit={onSubmit} />)

    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    // Refused per field rather than by one banner: both boxes are marked, so
    // the analyst is told which is empty and a screen reader reaches it.
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('hands a complete form over, once', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<SignInScreen onSubmit={onSubmit} />)

    await user.type(screen.getByLabelText('Email'), 'r.okonkwo@example.test')
    await user.type(screen.getByLabelText('Password'), 'a-real-password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({
      email: 'r.okonkwo@example.test',
      password: 'a-real-password',
    })
  })

  /** The server folds every reason into one answer, and it outranks ours. */
  it('leaves the refusal from the server standing', async () => {
    const user = userEvent.setup()
    render(<SignInScreen refusal="That did not work." />)

    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(screen.getByText('That did not work.')).toBeVisible()
    expect(screen.queryByText(/Enter your email address/)).toBeNull()
  })

  it('opens the About door', async () => {
    const user = userEvent.setup()
    render(<SignInScreen />)
    expect(screen.queryByRole('dialog')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'About IncidentCompanion' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('first run', () => {
  /** The first thing wrong, in the order the server judges them. */
  it.each([
    { name: 'no token', fill: {}, says: /Enter the setup token/ },
    { name: 'no username', fill: { 'Setup token': 'abc' }, says: /Enter a username/ },
    {
      name: 'a short password',
      fill: { 'Setup token': 'abc', Username: 'admin', Password: 'short' },
      says: /at least 12 characters/i,
    },
    {
      name: 'a repeat left blank',
      fill: { 'Setup token': 'abc', Username: 'admin', Password: 'a-long-enough-password' },
      says: /do not match/,
    },
  ])('refuses $name', async ({ fill, says }) => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<FirstRunScreen onSubmit={onSubmit} />)

    for (const [label, value] of Object.entries(fill)) {
      await user.type(screen.getByLabelText(label), value)
    }
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    // Scoped to the band the refusal lands in: the password field's own
    // description states the same length, and a bare text query matches it
    // whether or not the form refused anything.
    expect(screen.getByRole('alert').textContent).toMatch(says)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  /**
   * **Two that disagree never reach the submit handler**, and the field's own
   * live `isInvalid` is what the analyst reads while typing.
   */
  it('does not submit while the repeat field says it disagrees', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<FirstRunScreen onSubmit={onSubmit} />)

    await user.type(screen.getByLabelText('Setup token'), 'abc')
    await user.type(screen.getByLabelText('Username'), 'admin')
    await user.type(screen.getByLabelText('Password'), 'a-long-enough-password')
    await user.type(screen.getByLabelText('Repeat password'), 'something-else')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('The passwords do not match')).toBeVisible()
  })

  it('hands a complete claim over', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<FirstRunScreen onSubmit={onSubmit} />)

    await user.type(screen.getByLabelText('Setup token'), 'abc')
    await user.type(screen.getByLabelText('Username'), 'admin')
    await user.type(screen.getByLabelText('Password'), 'a-long-enough-password')
    await user.type(screen.getByLabelText('Repeat password'), 'a-long-enough-password')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
  })
})

describe('the forced password change', () => {
  it('refuses a new password that is the old one', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<ChangePasswordScreen onSubmit={onSubmit} />)

    await user.type(screen.getByLabelText('Current password'), 'the-same-one')
    await user.type(screen.getByLabelText('New password'), 'the-same-one')
    await user.type(screen.getByLabelText('Repeat new password'), 'the-same-one')
    await user.click(screen.getByRole('button', { name: 'Change password' }))

    expect(screen.getByText(/not used here/)).toBeVisible()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

describe('the account panel', () => {
  it('refuses a password change whose repeat disagrees', async () => {
    const user = userEvent.setup()
    const onChangePassword = vi.fn()
    render(<AccountPanel onChangePassword={onChangePassword} />)

    await user.type(screen.getByLabelText('Current password'), 'old-password')
    await user.type(screen.getByLabelText('New password'), 'new-password')
    await user.type(screen.getByLabelText('Repeat the new password'), 'mistyped')
    await user.click(screen.getByRole('button', { name: 'Change password' }))

    expect(screen.getByText('The passwords do not match.')).toBeVisible()
    expect(onChangePassword).not.toHaveBeenCalled()
  })

  it('hands a change over once the three agree', async () => {
    const user = userEvent.setup()
    const onChangePassword = vi.fn()
    render(<AccountPanel onChangePassword={onChangePassword} />)

    await user.type(screen.getByLabelText('Current password'), 'old-password')
    await user.type(screen.getByLabelText('New password'), 'new-password')
    await user.type(screen.getByLabelText('Repeat the new password'), 'new-password')
    await user.click(screen.getByRole('button', { name: 'Change password' }))

    expect(onChangePassword).toHaveBeenCalledTimes(1)
  })

  /**
   * The picker is the browser's; storing the image is not. So the row states
   * what it holds and never that it was uploaded.
   */
  it('names the file the picture door chose', async () => {
    const user = userEvent.setup()
    render(<AccountPanel />)

    const file = new File(['x'], 'avatar.png', { type: 'image/png' })
    const input = document.querySelector('input[type="file"]')
    expect(input).not.toBeNull()
    await user.upload(input as HTMLInputElement, file)

    expect(screen.getByText(/avatar\.png/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Remove' }))
    expect(screen.queryByText(/avatar\.png/)).toBeNull()
  })
})

/**
 * Enter, from inside the last box, submits the form.
 */
describe('the keyboard alone', () => {
  it('submits sign in from the password box', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<SignInScreen onSubmit={onSubmit} />)

    await user.type(screen.getByLabelText('Email'), 'r.okonkwo@example.test')
    await user.type(screen.getByLabelText('Password'), 'a-real-password{Enter}')

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({
      email: 'r.okonkwo@example.test',
      password: 'a-real-password',
    })
  })

  it('refuses an incomplete sign in from the keyboard, as it does from the button', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<SignInScreen onSubmit={onSubmit} />)

    await user.type(screen.getByLabelText('Email'), 'r.okonkwo@example.test{Enter}')

    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits the forced password change from the last box', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<ChangePasswordScreen onSubmit={onSubmit} />)

    await user.type(screen.getByLabelText('Current password'), 'the-old-one')
    await user.type(screen.getByLabelText('New password'), 'a-different-one')
    await user.type(screen.getByLabelText('Repeat new password'), 'a-different-one{Enter}')

    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('refuses a forced change whose repeat disagrees', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<ChangePasswordScreen onSubmit={onSubmit} />)

    await user.type(screen.getByLabelText('Current password'), 'the-old-one')
    await user.type(screen.getByLabelText('New password'), 'a-different-one')
    await user.type(screen.getByLabelText('Repeat new password'), 'mistyped')
    await user.click(screen.getByRole('button', { name: 'Change password' }))

    expect(screen.getByText(/do not match/)).toBeVisible()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('refuses a first run whose repeat disagrees', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<FirstRunScreen onSubmit={onSubmit} />)

    await user.type(screen.getByLabelText('Setup token'), 'a-setup-token')
    await user.type(screen.getByLabelText('Username'), 'r.okonkwo@example.test')
    await user.type(screen.getByLabelText('Password'), 'a-long-enough-one')
    await user.type(screen.getByLabelText('Repeat password'), 'mistyped')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(screen.getByText(/do not match/)).toBeVisible()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits the first run from the last box', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<FirstRunScreen onSubmit={onSubmit} />)

    await user.type(screen.getByLabelText('Setup token'), 'a-setup-token')
    await user.type(screen.getByLabelText('Username'), 'r.okonkwo@example.test')
    await user.type(screen.getByLabelText('Password'), 'a-long-enough-one')
    await user.type(screen.getByLabelText('Repeat password'), 'a-long-enough-one{Enter}')

    expect(onSubmit).toHaveBeenCalledTimes(1)
  })
})

/**
 * The defect this file's "keyboard alone" tests once documented as a wall: a
 * mismatched repeat's `isInvalid` wrote a native custom validity onto the
 * input, `form.checkValidity()` read `false`, and the browser refused the
 * `submit` event before any handler ran.
 */
describe('the form stays submittable while a field is invalid', () => {
  it("does not fail the change-password form's own checkValidity", async () => {
    const user = userEvent.setup()
    render(<ChangePasswordScreen />)

    await user.type(screen.getByLabelText('Current password'), 'the-old-one')
    await user.type(screen.getByLabelText('New password'), 'a-different-one')
    await user.type(screen.getByLabelText('Repeat new password'), 'mistyped')

    const form = document.querySelector<HTMLFormElement>('form')
    expect(form).not.toBeNull()
    expect(form!.checkValidity()).toBe(true)
  })

  it("does not fail the first-run form's own checkValidity", async () => {
    const user = userEvent.setup()
    render(<FirstRunScreen />)

    await user.type(screen.getByLabelText('Setup token'), 'a-setup-token')
    await user.type(screen.getByLabelText('Username'), 'r.okonkwo@example.test')
    await user.type(screen.getByLabelText('Password'), 'a-long-enough-one')
    await user.type(screen.getByLabelText('Repeat password'), 'mistyped')

    const form = document.querySelector<HTMLFormElement>('form')
    expect(form).not.toBeNull()
    expect(form!.checkValidity()).toBe(true)
  })
})
