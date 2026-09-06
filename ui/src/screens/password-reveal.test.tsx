/**
 * Every password box on an auth screen offers a temporary reveal.
 *
 * **OWASP ASVS V2.1.12** requires one *"on platforms that do not have this as
 * built-in functionality"*, and Chrome, Firefox and Safari provide none - so
 * it lands on the application. The three aria auth screens each drew a plain
 * `TextField`, so a password typed on any of them could not be read back.
 *
 * **What this tier asks is whether each screen reaches for the right control**,
 * and how many boxes it draws. How the control behaves once reached is settled
 * where the control is defined - `PasswordField`'s own stories, in a browser -
 * and every screen inherits the answer.
 *
 * A reveal that toggles, masks again, leaves its siblings hidden, does not
 * submit and starts hidden on a fresh mount is the control's property rather
 * than any screen's, and none of it is decidable in jsdom -- which cannot see
 * whether the control is *visible*. Those are demonstrated in the browser.
 *
 * The one thing a screen adds is the count: three boxes on the change-password
 * screen is a fact about that screen, and a reveal missing from one of them is
 * a screen defect rather than a control defect.
 */
import { render, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ChangePasswordScreen } from './change-password'
import { FirstRunScreen } from './first-run'
import { SignInScreen } from './sign-in'

/**
 * The boxes that hold a secret, found by the attribute rather than the label.
 *
 * A label list would be a copy of the screen's own copy, and would go green
 * the moment a field was renamed.
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
