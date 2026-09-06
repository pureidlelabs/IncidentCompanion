import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { ToastQueue, ToastRegion, type ToastMessage } from './toast'

/**
 * The kit's own guarantee about a card it did not draw.
 *
 * **`notify-render.test.tsx` cannot make this claim, and its break-verify said
 * so.** Deleting the `ToastContent` wrapper from the custom-card path left
 * every case in that file green: the one caller there is `WriteFailure`, whose
 * `Alert` carries `role="alert"` itself, so the announcement survived the
 * clause being removed. That is a true fact about that caller and not about
 * the kit - a card with no live region of its own is announced only because
 * the region puts one round it, and nothing would have caught its loss.
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
 *
 * `complaints()` in `server/e2e/support/app.ts` is how the browser specs ask
 * what the page says went wrong, and since React Aria puts `role="alert"` on
 * every toast it tells a refusal from a confirmation by this attribute alone. Drop it or
 * rename a tone and `prodding.spec.ts` reports every section's Add dialog as
 * having refused an empty form in silence - a failure that names the sections
 * and is about neither them nor the dialog.
 *
 * The whole of the coupling is asserted here rather than in the browser tier,
 * because the tier that reads it needs a stack, a build and a demo case, and
 * this needs none of them.
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
   * The other half, and the one a per-tone assertion cannot make: a tone that
   * is *not* a complaint must not carry a reported value. A mapping that sent
   * every toast to `destructive` passes both cases above, and every successful
   * write in the sweep would then be reported as a refusal.
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
