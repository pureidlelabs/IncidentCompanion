/**
 * **A password change is sent once, however many times the button is pressed.**
 *
 * The second press carries the `current` password the first one may already
 * have replaced, so it is refused -- and an analyst is told their change failed
 * for a change that in fact succeeded, which is the one answer that sends
 * somebody to reset a password they have already changed. -> #195
 *
 * Driven through the container rather than the section, because the flag has to
 * survive the whole chain: the write lives here, the button is three components
 * down, and a section that takes a `busy` nobody passes reads as fixed.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const changeOwnPassword = vi.hoisted(() => vi.fn())
vi.mock('@/api/client', () => ({ changeOwnPassword }))

/** Resolved by the test, so the write stays in flight for as long as it needs. */
let settle: (() => void) | null = null
vi.mock('@/api/appearance', () => ({
  useAppearances: () => ({ data: new Map() }),
  useUploadAvatar: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useClearAvatar: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSetAppearance: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/api/useSession', () => ({
  useSession: () => ({ userId: 'ada', username: 'Ada' }),
}))
vi.mock('@/lib/useGround', () => ({
  useGround: () => ({ theme: 'light', setTheme: vi.fn() }),
}))

const { AccountContainer } = await import('./AccountContainer')

/** The three fields filled with a change the screen itself will not refuse. */
async function fillIn(user: ReturnType<typeof userEvent.setup>) {
  const fields = screen.getAllByLabelText(/password/i)
  expect(fields.length, 'the password section did not render its three fields').toBeGreaterThanOrEqual(3)
  await user.type(fields[0]!, 'old-one')
  await user.type(fields[1]!, 'new-one')
  await user.type(fields[2]!, 'new-one')
}

beforeEach(() => {
  changeOwnPassword.mockReset()
  settle = null
  changeOwnPassword.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        settle = resolve
      }),
  )
})

describe('changing your own password', () => {
  it('sends one request however many times the button is pressed', async () => {
    const user = userEvent.setup()
    render(<AccountContainer isOpen onOpenChange={vi.fn()} />)

    await fillIn(user)
    const button = screen.getByRole('button', { name: /change password/i })

    await user.click(button)
    await waitFor(() => {
      expect(changeOwnPassword).toHaveBeenCalledTimes(1)
    })

    // The write has not resolved, so this is the double press an analyst makes
    // on a slow network rather than a second, deliberate change.
    await user.click(button)
    await user.click(button)

    expect(
      changeOwnPassword,
      'a press while the change was in flight sent a second request',
    ).toHaveBeenCalledTimes(1)
  })

  /**
   * The other direction, so the fix cannot be "disable it for ever": a refusal
   * has to leave the analyst able to correct the password and try again.
   */
  it('lets the analyst try again once the write has answered', async () => {
    const user = userEvent.setup()
    render(<AccountContainer isOpen onOpenChange={vi.fn()} />)

    await fillIn(user)
    const button = screen.getByRole('button', { name: /change password/i })
    await user.click(button)
    await waitFor(() => {
      expect(changeOwnPassword).toHaveBeenCalledTimes(1)
    })

    settle?.()
    await waitFor(() => {
      expect(button).toBeEnabled()
    })

    await user.click(button)
    expect(changeOwnPassword).toHaveBeenCalledTimes(2)
  })
})
