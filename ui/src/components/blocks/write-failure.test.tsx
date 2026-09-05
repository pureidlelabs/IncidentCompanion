import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/api/client'

import { WriteFailure } from './write-failure'

/**
 * The card a refused write is drawn on.
 */
const REFUSED = new ApiError(422, 'Validation failed', {
  message: 'Validation failed',
  errors: [
    { code: 'too_small', path: ['value'], message: 'Too small: expected >=1 characters' },
    { code: 'invalid_value', path: ['triage'], message: 'Invalid option' },
  ],
})

describe('WriteFailure', () => {
  it('names what was not saved, and why', () => {
    render(<WriteFailure what="Indicators" error={REFUSED} onDismiss={() => undefined} />)

    expect(screen.getByText('Indicators was not saved.')).toBeInTheDocument()
    expect(screen.getByText('Validation failed')).toBeInTheDocument()
  })

  it('lists every field the server refused, with its own sentence', () => {
    render(<WriteFailure what="Indicators" error={REFUSED} onDismiss={() => undefined} />)

    const details = screen.getByRole('list', { name: 'Fields refused' })
    const rows = within(details).getAllByRole('listitem')

    expect(rows.map((row) => row.textContent)).toEqual([
      'valueToo small: expected >=1 characters',
      'triageInvalid option',
    ])
  })

  it('sets the field name in the data face and the sentence in sans', () => {
    render(<WriteFailure what="Indicators" error={REFUSED} onDismiss={() => undefined} />)

    const first = within(screen.getByRole('list', { name: 'Fields refused' })).getAllByRole(
      'listitem',
    )[0]!

    expect(within(first).getByText('value').className).toContain('font-mono')
    expect(within(first).getByText('Too small: expected >=1 characters').className).not.toContain(
      'font-mono',
    )
  })

  /**
   * A refusal carrying no field list - a 500, a network failure, a 409 - draws
   * the sentence and the way out and nothing between them.
   */
  it('draws no field list when the refusal named none', () => {
    render(
      <WriteFailure
        what="Indicators"
        error={new ApiError(500, 'IncidentCompanion did not answer.', null)}
        onDismiss={() => undefined}
      />,
    )

    expect(screen.queryByRole('list', { name: 'Fields refused' })).not.toBeInTheDocument()
    expect(screen.getByText('IncidentCompanion did not answer.')).toBeInTheDocument()
  })

  /**
   * **Retrying a refused write repeats it exactly.**
   */
  it('offers no Retry for a refusal that named fields, even when one is passed', () => {
    render(
      <WriteFailure
        what="Indicators"
        error={REFUSED}
        onRetry={() => undefined}
        onDismiss={() => undefined}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument()
  })

  it('offers Retry only where the caller can retry, and Dismiss always', async () => {
    const retry = vi.fn()
    const dismiss = vi.fn()
    const unanswered = new ApiError(0, 'IncidentCompanion did not answer.', null)
    const { rerender } = render(
      <WriteFailure what="Indicators" error={unanswered} onRetry={retry} onDismiss={dismiss} />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(retry).toHaveBeenCalledOnce()

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(dismiss).toHaveBeenCalledOnce()

    rerender(<WriteFailure what="Indicators" error={unanswered} onDismiss={dismiss} />)
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument()
  })

  /**
   * **Both controls answer the keyboard, which is the half a click cannot
   * see.**
   */
  it('runs both handlers from the keyboard, not only from a pointer', async () => {
    const retry = vi.fn()
    const dismiss = vi.fn()
    render(
      <WriteFailure
        what="Indicators"
        error={new ApiError(0, 'IncidentCompanion did not answer.', null)}
        onRetry={retry}
        onDismiss={dismiss}
      />,
    )

    screen.getByRole('button', { name: 'Retry' }).focus()
    await userEvent.keyboard('{Enter}')
    expect(retry).toHaveBeenCalledOnce()

    screen.getByRole('button', { name: 'Dismiss' }).focus()
    await userEvent.keyboard(' ')
    expect(dismiss).toHaveBeenCalledOnce()
  })

  /**
   * **The cap is stated, not silent.**
   */
  it('counts the fields it did not draw rather than dropping them quietly', () => {
    const many = new ApiError(422, 'Validation failed', {
      errors: Array.from({ length: 7 }, (_, n) => ({
        path: [`field${String(n)}`],
        message: 'Invalid option',
      })),
    })
    render(<WriteFailure what="Indicators" error={many} onDismiss={() => undefined} />)

    const rows = within(screen.getByRole('list', { name: 'Fields refused' })).getAllByRole(
      'listitem',
    )
    expect(rows).toHaveLength(4)
    expect(screen.getByText('and 3 more')).toBeInTheDocument()
  })

  it('says nothing about a count when every field fits', () => {
    render(<WriteFailure what="Indicators" error={REFUSED} onDismiss={() => undefined} />)
    expect(screen.queryByText(/more$/)).not.toBeInTheDocument()
  })
})
