import { expect, waitFor, within } from 'storybook/test'

import { MOBILE_BREAKPOINT } from '@/hooks/use-mobile'

/**
 * Whether the story is drawn below the shell's breakpoint, which the sweep's
 * second width is. A play that measures a wide layout asks this first and
 * asserts what the narrow one owes instead.
 */
export function narrow(): boolean {
  return window.innerWidth < MOBILE_BREAKPOINT
}

/** Whether an element has a box, which one under a `display: none` ancestor has not. */
export function drawn(el: Element): boolean {
  return el.getClientRects().length > 0
}

/** Unfold a rail the width folded, so a story about its rows can read them. */
export async function unfoldRail(
  canvasElement: HTMLElement,
  user: { click: (element: Element) => Promise<void> },
): Promise<void> {
  const rail = canvasElement.querySelector('[data-part="rail"]')
  if (!rail?.hasAttribute('data-folded')) return
  await user.click(within(canvasElement).getByRole('button', { name: 'Unfold the rail' }))
  await waitFor(() => {
    void expect(rail).not.toHaveAttribute('data-folded')
  })
}
