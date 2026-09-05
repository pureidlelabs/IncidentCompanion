import { fireEvent } from '@testing-library/react'

/**
 * Open a Base UI trigger - a menu, a select, a popover.
 */
export function pressTrigger(trigger: HTMLElement): void {
  fireEvent.click(trigger)
}

/**
 * Press something outside an open overlay, to dismiss it - a dialog's
 * backdrop, the page behind a popover.
 */
export function pressOutside(target: HTMLElement): void {
  fireEvent.pointerDown(target)
  fireEvent.mouseDown(target)
  fireEvent.click(target)
}
