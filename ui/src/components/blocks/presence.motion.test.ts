import { describe, expect, it } from 'vitest'

import { joining } from './presence'
import { SCALE, transition } from '@/lib/motion'

/**
 * The shape of a person arriving and leaving, held where nothing races.
 *
 * **The story cannot assert this and the attempt is recorded there.** Checking
 * that a leaver is still drawn while its exit plays means running inside the
 * 280ms the exit lasts: with `userEvent` the click's own delays can outlast it
 * on a loaded machine, and with `fireEvent` the assertion runs before React has
 * re-rendered at all -- measured, deleting `exit="gone"` left that version
 * green. So the story asserts the end state, and the decision lives here.
 */
describe('a person arriving and leaving', () => {
  it('leaves more slowly than it arrives', () => {
    // The decision this file exists for, and it inverts the project's usual
    // rule that exit is the faster half. A departure is the event an analyst
    // has to notice and the one nothing else on screen reports.
    const shown = joining.shown as { transition?: unknown }
    const gone = joining.gone as { transition?: unknown }
    expect(shown.transition).toBe(transition.base)
    expect(gone.transition).toBe(transition.slow)
    expect(transition.slow.duration).toBeGreaterThan(transition.base.duration)
  })

  it('arrives from the glyph scale, not the surface one', () => {
    // A disc is 24px across, where the surface value's four percent is nothing.
    const hidden = joining.hidden as { scale?: number; opacity?: number }
    expect(hidden.scale).toBe(SCALE.glyph)
    expect(hidden.opacity).toBe(0)
  })

  it('has all three states, so `exit` has something to name', () => {
    // Without this the two above pass over an absent key: `undefined.transition`
    // would throw, but a renamed state would leave `gone` missing and the
    // component silently loses its exit.
    expect(Object.keys(joining).sort()).toEqual(['gone', 'hidden', 'shown'])
  })
})
