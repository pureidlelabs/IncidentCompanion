/**
 * The pane's scroll container carries no vertical padding.
 *
 * A sticky offset is measured from the scrollport's **padding** edge, so
 * padding on the scroller puts every `top-0` inside the pane that far below
 * the top of the box and leaves a strip the rows scroll visibly through.
 *
 * That strip cannot be covered from inside a sticky element: no selector tells
 * a stuck one from a resting one, so a band drawn upward for the stuck case is
 * painted over the heading in the resting case. It was, and it took the foot
 * off the case timeline's title and the bottom eight pixels off the report
 * index's blurb.
 *
 * The inset belongs to a wrapper inside the scroller instead, which is the
 * arrangement this asserts. Read from the source because the alternative is a
 * browser: jsdom resolves no Tailwind class to a box.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

/** Resolved against the working directory, as the sibling rule tests are. */
const SHELL = 'src/components/blocks/app-shell.tsx'

/** Vertical padding in Tailwind's spellings, including the arbitrary form. */
const VERTICAL_PADDING = /\b(?:py|pt|pb)-(?:\(|\[|[\w.]+)/

/**
 * The class strings given to the pane's scroller, which is the `cn(...)` call
 * on the element carrying `data-slot="pane-scroll"`.
 */
function paneScrollClasses(source: string): string {
  const at = source.indexOf('data-slot="pane-scroll"')
  expect(at, 'the shell no longer has a pane-scroll slot').toBeGreaterThan(-1)

  const open = source.indexOf('className={cn(', at)
  expect(open, 'the pane no longer builds its classes with cn()').toBeGreaterThan(-1)

  const close = source.indexOf(')}', open)
  expect(close).toBeGreaterThan(open)
  return source.slice(open, close)
}

describe('the pane scroller', () => {
  const source = readFileSync(SHELL, 'utf8')

  it('is the file this rule thinks it is', () => {
    // A rule reading the wrong file passes over nothing at all.
    expect(source).toContain('data-slot="pane-scroll"')
    expect(source).toContain('--pane-inset-y')
  })

  it('sets no vertical padding, so a sticky top-0 means the top', () => {
    const classes = paneScrollClasses(source)

    expect(classes, 'padding here displaces every sticky offset in the pane').not.toMatch(
      VERTICAL_PADDING,
    )
  })

  it('still insets its content vertically, somewhere below the scroller', () => {
    // Removing the padding altogether would satisfy the rule above and lose
    // the inset the shell owes every screen.
    const classes = paneScrollClasses(source)
    const rest = source.slice(source.indexOf(classes) + classes.length)

    expect(rest, 'the inset was dropped rather than moved').toMatch(VERTICAL_PADDING)
  })
})
