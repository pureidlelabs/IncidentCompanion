import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { ToastQueue, ToastRegion, type ToastMessage } from './toast'

/**
 * The kit's own guarantee about a card it did not draw.
 */
const queue = new ToastQueue<ToastMessage>()

afterEach(() => {
  queue.clear()
})

describe('a toast whose card the caller drew', () => {
  it('is announced even when the card carries no live region', async () => {
    render(<ToastRegion queue={queue} />)
    queue.add({
      title: 'Systems was not saved.',
      tone: 'destructive',
      render: () => <div>The write was refused.</div>,
    })

    const drawn = await screen.findByText('The write was refused.')
    expect(
      drawn.closest('[role="alert"]'),
      'a card the caller drew was rendered outside the live region',
    ).not.toBeNull()
  })
})

/**
 * **`data-tone` is read by the browser tier and by nothing else in this repo.**
 */
describe('the attribute the browser tier classifies a toast by', () => {
  /** The exact strings `complaints()` names. Change one and change both. */
  const REPORTED = ['destructive', 'warning'] as const

  it.each(REPORTED)('marks a %s toast as one the sweep should report', async (tone) => {
    render(<ToastRegion queue={queue} />)
    queue.add({ title: 'Systems was not saved.', tone })

    const raised = await screen.findByText('Systems was not saved.')
    const card = raised.closest('[data-slot="toast"]')
    expect(card, 'the toast rendered outside the kit\'s card').not.toBeNull()
    expect(card).toHaveAttribute('data-tone', tone)
  })

  /**
   * The other half, and the one a per-tone assertion cannot make: a tone that is
   * *not* a complaint must not carry a reported value.
   */
  it.each(['default', 'success'] as const)('leaves a %s toast unreported', async (tone) => {
    render(<ToastRegion queue={queue} />)
    queue.add({ title: 'Timeline entry saved', tone })

    const raised = await screen.findByText('Timeline entry saved')
    const card = raised.closest('[data-slot="toast"]')
    expect(card).toHaveAttribute('data-tone', tone)
    expect(
      REPORTED.some((reported) => card?.getAttribute('data-tone') === reported),
      'a toast about a write that landed reads to the sweep as a refusal',
    ).toBe(false)
  })
})
