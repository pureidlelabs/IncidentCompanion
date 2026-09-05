/**
 * What the auth containers do with a server that answers, refuses, or is not
 * there at all.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/api/client'
import type * as ApiClient from '@/api/client'

import { ChangePasswordContainer } from './ChangePasswordContainer'
import { FirstRunContainer } from './FirstRunContainer'
import { SignInContainer } from './SignInContainer'

const signIn = vi.fn<(email: string, password: string) => Promise<{ mustChangePassword: boolean }>>()
const claimInstall = vi.fn<(fields: Record<string, string>) => Promise<void>>()
const changeOwnPassword = vi.fn<(fields: Record<string, string>) => Promise<void>>()

vi.mock('@/api/client', async (importOriginal) => {
  const real = await importOriginal<typeof ApiClient>()
  return {
    ...real,
    signIn: (...args: [string, string]) => signIn(...args),
    claimInstall: (fields: Record<string, string>) => claimInstall(fields),
    changeOwnPassword: (fields: Record<string, string>) => changeOwnPassword(fields),
  }
})

beforeEach(() => {
  signIn.mockReset()
  claimInstall.mockReset()
  changeOwnPassword.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** A complete sign-in, typed the way an analyst types it. */
async function signInAs(user: ReturnType<typeof userEvent.setup>, password = 'a-real-password') {
  await user.type(screen.getByLabelText('Email'), 'r.okonkwo@example.test')
  await user.type(screen.getByLabelText('Password'), password)
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
}

describe('signing in', () => {
  it('shows what the server said, rather than a guess', async () => {
    const user = userEvent.setup()
    signIn.mockRejectedValue(
      new ApiError(401, 'That username and password do not match.', null),
    )
    render(<SignInContainer onMustChangePassword={vi.fn()} />)

    await signInAs(user)

    expect(
      await screen.findByText('That username and password do not match.'),
    ).toBeVisible()
  })

  /**
   * A dropped connection reaches the same `catch` as a 401 and carries no
   * `message` an analyst can act on.
   */
  it('says the server did not answer when the call throws no ApiError', async () => {
    const user = userEvent.setup()
    signIn.mockRejectedValue(new TypeError('fetch failed'))
    render(<SignInContainer onMustChangePassword={vi.fn()} />)

    await signInAs(user)

    expect(await screen.findByText('IncidentCompanion did not answer.')).toBeVisible()
    expect(screen.queryByText(/fetch failed/)).toBeNull()
  })

  /**
   * The attack: a refusal that outlives the attempt it was about.
   */
  it('drops the previous refusal when the form is submitted again', async () => {
    const user = userEvent.setup()
    signIn.mockRejectedValueOnce(new ApiError(401, 'That sign-in was refused.', null))
    render(<SignInContainer onMustChangePassword={vi.fn()} />)

    await signInAs(user)
    expect(await screen.findByText('That sign-in was refused.')).toBeVisible()

    let release: () => void = () => {
      /* replaced below, before anything calls it */
    }
    signIn.mockReturnValueOnce(
      new Promise((resolve) => {
        release = () => {
          resolve({ mustChangePassword: false })
        }
      }),
    )
    await user.click(screen.getByRole('button', { name: /Signing in|Sign in/ }))

    await waitFor(() => {
      expect(screen.queryByText('That sign-in was refused.')).toBeNull()
    })
    release()
  })

  /**
   * A refused sign-in leaves the button reading "Signing in..." forever if the
   * pending flag is only cleared on the success path, and there is no second
   * attempt from a control that never comes back.
   */
  it('stops being pending after a refusal', async () => {
    const user = userEvent.setup()
    signIn.mockRejectedValue(new ApiError(401, 'No.', null))
    render(<SignInContainer onMustChangePassword={vi.fn()} />)

    await signInAs(user)

    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeEnabled()
  })

  /**
   * The account is signed in and reaches exactly one route.
   */
  it('reports a held account upward rather than letting the workspace mount', async () => {
    const user = userEvent.setup()
    const held = vi.fn()
    signIn.mockResolvedValue({ mustChangePassword: true })
    render(<SignInContainer onMustChangePassword={held} />)

    await signInAs(user)

    await waitFor(() => {
      expect(held).toHaveBeenCalledTimes(1)
    })
  })

  it('leaves a sign-in that is not held alone', async () => {
    const user = userEvent.setup()
    const held = vi.fn()
    signIn.mockResolvedValue({ mustChangePassword: false })
    render(<SignInContainer onMustChangePassword={held} />)

    await signInAs(user)

    await waitFor(() => {
      expect(signIn).toHaveBeenCalledTimes(1)
    })
    expect(held).not.toHaveBeenCalled()
  })

  /** The credential goes to the call and nowhere near the refusal surface. */
  it('never puts the typed password on screen', async () => {
    const user = userEvent.setup()
    signIn.mockRejectedValue(new ApiError(401, 'That sign-in was refused.', null))
    render(<SignInContainer onMustChangePassword={vi.fn()} />)

    await signInAs(user, 'correct-horse-battery')
    await screen.findByText('That sign-in was refused.')

    const alert = screen.getByRole('alert')
    expect(alert.textContent).not.toContain('correct-horse-battery')
  })
})

describe('claiming the install', () => {
  /**
   * `POST /setup` parses a body carrying `repeat`, and the screen's `onSubmit`
   * does not have one - it judges the two passwords itself and hands over the
   * one it kept.
   */
  it('sends the repeat the route demands', async () => {
    const user = userEvent.setup()
    claimInstall.mockResolvedValue()
    render(<FirstRunContainer />)

    await user.type(screen.getByLabelText('Setup token'), 'a-setup-token')
    await user.type(screen.getByLabelText('Username'), 'first.admin')
    await user.type(screen.getByLabelText('Password'), 'a-long-enough-password')
    await user.type(screen.getByLabelText('Repeat password'), 'a-long-enough-password')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    await waitFor(() => {
      expect(claimInstall).toHaveBeenCalledTimes(1)
    })
    expect(claimInstall.mock.calls[0]?.[0]).toEqual({
      token: 'a-setup-token',
      username: 'first.admin',
      password: 'a-long-enough-password',
      repeat: 'a-long-enough-password',
    })
  })

  it('shows the refusal for a token the server will not take', async () => {
    const user = userEvent.setup()
    claimInstall.mockRejectedValue(
      new ApiError(403, 'That setup token is not the one printed at startup.', null),
    )
    render(<FirstRunContainer />)

    await user.type(screen.getByLabelText('Setup token'), 'a-wrong-token')
    await user.type(screen.getByLabelText('Username'), 'first.admin')
    await user.type(screen.getByLabelText('Password'), 'a-long-enough-password')
    await user.type(screen.getByLabelText('Repeat password'), 'a-long-enough-password')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(
      await screen.findByText('That setup token is not the one printed at startup.'),
    ).toBeVisible()
  })
})

describe('changing a password somebody else chose', () => {
  async function fillChange(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText('Current password'), 'the-issued-password')
    await user.type(screen.getByLabelText('New password'), 'a-password-of-my-own')
    await user.type(screen.getByLabelText('Repeat new password'), 'a-password-of-my-own')
    await user.click(screen.getByRole('button', { name: 'Change password' }))
  }

  it('sends the repeat the route demands', async () => {
    const user = userEvent.setup()
    changeOwnPassword.mockResolvedValue()
    render(<ChangePasswordContainer onChanged={vi.fn()} />)

    await fillChange(user)

    await waitFor(() => {
      expect(changeOwnPassword).toHaveBeenCalledTimes(1)
    })
    expect(changeOwnPassword.mock.calls[0]?.[0]).toEqual({
      current: 'the-issued-password',
      password: 'a-password-of-my-own',
      repeat: 'a-password-of-my-own',
    })
  })

  /**
   * The hold is state the caller keeps, and nothing else clears it: the boot
   * probe runs once per mount and the sign-in answer is remembered.
   */
  it('tells the caller the hold is over', async () => {
    const user = userEvent.setup()
    const changed = vi.fn()
    changeOwnPassword.mockResolvedValue()
    render(<ChangePasswordContainer onChanged={changed} />)

    await fillChange(user)

    await waitFor(() => {
      expect(changed).toHaveBeenCalledTimes(1)
    })
  })

  /** A refused change is not a change: releasing the hold here strands the
   *  analyst in a workspace the server refuses on every request. */
  it('keeps the hold when the change is refused', async () => {
    const user = userEvent.setup()
    const changed = vi.fn()
    changeOwnPassword.mockRejectedValue(
      new ApiError(400, 'That is not your current password.', null),
    )
    render(<ChangePasswordContainer onChanged={changed} />)

    await fillChange(user)

    expect(await screen.findByText('That is not your current password.')).toBeVisible()
    expect(changed).not.toHaveBeenCalled()
  })
})

/**
 * `App`'s own hold, against a stand-in for its one ternary.
 */
describe('the hold `App` keeps', () => {
  function Held() {
    const [chosenOwn, setChosenOwn] = useState(false)
    // `App` ORs the boot probe and the sign-in answer here; the stand-in
    // holds that half constant, since what is under test is the release.
    return !chosenOwn ? (
      <ChangePasswordContainer
        onChanged={() => {
          setChosenOwn(true)
        }}
      />
    ) : (
      <p>Workspace</p>
    )
  }

  async function fill(user: ReturnType<typeof userEvent.setup>, current: string) {
    await user.type(screen.getByLabelText('Current password'), current)
    await user.type(screen.getByLabelText('New password'), 'a-password-of-my-own')
    await user.type(screen.getByLabelText('Repeat new password'), 'a-password-of-my-own')
    await user.click(screen.getByRole('button', { name: 'Change password' }))
  }

  /**
   * The defect this is named for: the hold is set from the boot probe and from
   * the sign-in answer, neither of which is asked again.
   */
  it('lets the analyst through once the password is their own', async () => {
    const user = userEvent.setup()
    changeOwnPassword.mockResolvedValue()
    render(<Held />)

    await fill(user, 'the-issued-password')

    expect(await screen.findByText('Workspace')).toBeVisible()
  })

  it('keeps the change screen up when the change is refused', async () => {
    const user = userEvent.setup()
    changeOwnPassword.mockRejectedValue(new ApiError(400, 'That is not your password.', null))
    render(<Held />)

    await fill(user, 'a-wrong-password')

    await screen.findByText('That is not your password.')
    expect(screen.queryByText('Workspace')).toBeNull()
  })
})
