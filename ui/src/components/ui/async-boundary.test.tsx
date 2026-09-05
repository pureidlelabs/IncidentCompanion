import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { AsyncBoundary } from './async-boundary'

const ready = { isPending: false, isError: false }

/** Stands in for the app's `ApiError` - the boundary reads `status` structurally. */
class HttpError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

describe('the async boundary', () => {
  it('announces loading rather than only drawing a skeleton', () => {
    render(
      <AsyncBoundary isPending isError={false}>
        <p>rows</p>
      </AsyncBoundary>,
    )
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByText('rows')).not.toBeInTheDocument()
  })

  it('shows the server\u2019s own message for a failure', () => {
    render(
      <AsyncBoundary
        isPending={false}
        isError
        error={new HttpError(422, 'That reference does not resolve.')}
      >
        <p>rows</p>
      </AsyncBoundary>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('That reference does not resolve.')
  })

  /**
   * **Re-anchored 2026-08-16: a read cannot produce a 409 on this server.**
   */
  it('shows the server message for a status it has no special treatment for', () => {
    render(
      <AsyncBoundary isPending={false} isError error={new HttpError(409, 'Version 3 is behind.')}>
        <p>rows</p>
      </AsyncBoundary>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Version 3 is behind.')
  })

  it('offers a retry only when it was given one', async () => {
    const refetch = vi.fn()
    const { rerender } = render(
      <AsyncBoundary isPending={false} isError error={new HttpError(500, 'x')} refetch={refetch}>
        <p>rows</p>
      </AsyncBoundary>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(refetch).toHaveBeenCalledOnce()

    rerender(
      <AsyncBoundary isPending={false} isError error={new HttpError(500, 'x')}>
        <p>rows</p>
      </AsyncBoundary>,
    )
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })

  it('states a refusal calmly and offers no retry', () => {
    const refetch = vi.fn()
    render(
      <AsyncBoundary
        isPending={false}
        isError
        error={new HttpError(403, 'Insufficient permissions')}
        refetch={refetch}
      >
        <p>rows</p>
      </AsyncBoundary>,
    )

    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  /** A 401 is not a refusal: the session is gone and signing in fixes it. */
  it('still treats a lost session as something that can change', () => {
    render(
      <AsyncBoundary
        isPending={false}
        isError
        error={new HttpError(401, 'Unauthorized')}
        refetch={vi.fn()}
      >
        <p>rows</p>
      </AsyncBoundary>,
    )
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('renders its children once there is data', () => {
    render(
      <AsyncBoundary {...ready}>
        <p>rows</p>
      </AsyncBoundary>,
    )
    expect(screen.getByText('rows')).toBeInTheDocument()
  })
})
