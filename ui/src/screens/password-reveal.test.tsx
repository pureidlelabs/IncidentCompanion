/**
 * Every password box on an auth screen offers a temporary reveal.
 *
 * That split was not always here. This file used to press the reveal and assert
 * that it toggles, that it masks again, that siblings stay hidden, that it does
 * not submit and that a fresh mount starts hidden. All five are properties of
 * the control rather than of any screen, and all five ran in jsdom, which this
 * file's own note said "cannot see whether the control is *visible*". They are
 * demonstrated in the browser now, where that limit does not apply.
 */
import { render, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ChangePasswordScreen } from './change-password'
import { FirstRunScreen } from './first-run'
import { SignInScreen } from './sign-in'

/**
 * The boxes that hold a secret, found by the attribute rather than the label.
 */
function secretBoxes(): HTMLInputElement[] {
  return [...document.querySelectorAll<HTMLInputElement>('input[type="password"]')]
}

/** The reveal that belongs to one box: the one inside the same field group. */
function revealFor(box: HTMLElement): HTMLElement {
  const group = box.closest('[data-slot="field-group"]')
  if (!group) throw new Error('a password box outside a field group')
  return within(group as HTMLElement).getByRole('button', { name: /password/i })
}

const SCREENS = [
  ['sign in', () => <SignInScreen />, 1],
  ['change password', () => <ChangePasswordScreen />, 3],
  ['first run', () => <FirstRunScreen />, 2],
] as const

describe('every auth screen offers a reveal on every password box', () => {
  it.each(SCREENS)('draws the expected boxes on %s, each with a reveal', (name, draw, count) => {
    render(draw())
    const boxes = secretBoxes()
    expect(boxes, `${name} draws the wrong number of password boxes`).toHaveLength(count)
    for (const box of boxes) {
      // Present, and a toggle rather than a one-way control. Whether pressing
      // it works is `PasswordField`'s own story.
      expect(revealFor(box).getAttribute('aria-pressed'), `${name}: not a toggle`).toBe('false')
    }
  })
})
