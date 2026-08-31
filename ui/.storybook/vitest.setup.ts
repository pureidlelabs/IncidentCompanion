/**
 * The Storybook project's setup, run in the browser rather than in jsdom.
 *
 * `setProjectAnnotations` hands the preview's decorators, globals and
 * parameters to the portable-story machinery, so a story tested here renders
 * inside the same `Grounds` wrapper it renders inside in Storybook. Without it
 * every story is tested against the default ground and the token layer is
 * never exercised.
 *
 * The a11y addon's own annotations register an `afterEach` that runs axe and
 * fails on a violation, which is the capability this project exists for -
 * `parameters.a11y.test` in `preview.tsx` decides whether it errors or only
 * reports.
 */
import * as a11yAnnotations from '@storybook/addon-a11y/preview'
import { setProjectAnnotations } from '@storybook/react-vite'
import { afterEach, beforeAll, beforeEach } from 'vitest'

import previewAnnotations from './preview'

const project = setProjectAnnotations([a11yAnnotations, previewAnnotations])

beforeAll(project.beforeAll)

/**
 * A React warning fails the story that printed it.
 *
 * The story tier renders every story in a real browser and asserts whatever
 * its `play` asserts, which for a story with no `play` is nothing at all. A
 * render warning is the one defect class that surface still emits: React
 * reports a nullish `key`, a bad prop, a nested `<p>` and an act violation
 * through `console.error`, and a tier that only watches for thrown errors
 * counts every one of them as a pass.
 *
 * The message is attached with the story's own name because the console line
 * has already scrolled past by the time the run summarises.
 */
/**
 * React's `act(...)` warning, exempted for the three Base UI internals that
 * emit it and for nothing else.
 *
 * React formats this message with `%s`, so the component's name arrives as the
 * *second argument* rather than inside the text. That is what makes a precise
 * exemption possible: a substring match on the joined line exempts every act
 * warning from every component, including one an app component earns by
 * setting state after its own story has finished.
 *
 * The three names were measured over the whole tier rather than guessed, and
 * all three resolve to `@base-ui/react`. Each updates from an effect that
 * settles after the play function returns, so no `act` the runner could open
 * would contain it.
 *
 * **They fire non-deterministically**: three consecutive runs of the same two
 * files gave `PopoverPositioner` alone, then all three, then `PopoverPositioner`
 * alone. A flaky warning is exactly what must not be the gate, and exactly why
 * the exemption has to be narrow enough that a real one still lands.
 */
const ACT_WARNING = 'not wrapped in act('
const ACT_EXEMPT = new Set(['PopoverPositioner', 'FieldError', 'FieldRootInner'])

/** Whether this `console.error` is an act warning from a Base UI internal. */
function isExemptActWarning(args: unknown[]): boolean {
  const [message, component] = args
  return (
    typeof message === 'string' &&
    message.includes(ACT_WARNING) &&
    typeof component === 'string' &&
    ACT_EXEMPT.has(component)
  )
}

const seen: string[] = []
let realError: typeof console.error | undefined

beforeEach(() => {
  seen.length = 0
  realError = console.error
  console.error = (...args: unknown[]) => {
    if (!isExemptActWarning(args)) {
      seen.push(
        args.map((arg) => (arg instanceof Error ? arg.message : String(arg))).join(' '),
      )
    }
    realError?.(...args)
  }
})

afterEach(() => {
  if (realError !== undefined) console.error = realError
  realError = undefined
  if (seen.length > 0) {
    const lines = seen.join('\n')
    seen.length = 0
    throw new Error(`console.error during this story:\n${lines}`)
  }
})
