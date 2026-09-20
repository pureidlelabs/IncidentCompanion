import { expect, it } from 'vitest'

/**
 * Each case focuses a button, checks nothing stale arrived with the event, and
 * leaves that focused button removed for whoever runs next -- both halves in
 * both cases, so their order cannot decide whether anything is checked. What
 * keeps it green is the scratch focus/blur in `setup.ts`. -> #1001
 */
function inheritsNothingStale(): void {
  let from: Node | null | undefined
  document.addEventListener(
    'focusin',
    (event) => {
      from = event.relatedTarget as Node | null
    },
    { once: true },
  )

  const button = document.createElement('button')
  document.body.append(button)
  button.focus()

  expect(from === null ? 'null' : (from?.nodeName ?? 'no focusin')).toBe('null')

  button.remove()
}

it('names no stale element as the one that lost focus', inheritsNothingStale)
it('does so whichever of the two runs second', inheritsNothingStale)
