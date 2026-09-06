import type { ComponentProps } from 'react'
import { Input as InputPrimitive, type InputProps } from 'react-aria-components'

import { cn } from '@/lib/cn'

/**
 * A single-line text box, drawing its own border, ground and height from
 * `controlBase`.
 *
 * A caller that already draws a box around it passes `border-0 bg-transparent`
 * down, so the field does not add a second rectangle inside the first.
 *
 * **No password-manager opt-out.** Spreading `autoComplete="off"` and a
 * manager's own ignore flags onto every input defends against a badge nobody
 * has seen, and a test asserting the attributes asserts no behaviour anyone
 * can observe. A credential field says what it holds through `autoComplete`,
 * which is what a manager reads to fill it correctly.
 */
/**
 * Typed against the native element rather than React Aria's `InputProps`.
 *
 * **A caller passing plain `React.ComponentProps<'input'>` decides this.**
 * With `exactOptionalPropertyTypes` on, a `className: string | undefined` is
 * one that `InputProps`'s narrower fields refuse to accept. Runtime does not
 * care: React drops an `undefined` prop either way, so the cast below asks
 * nothing of the DOM that was not already true.
 */
function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <InputPrimitive
      data-slot="input"
      className={cn(
        controlBase,
        'h-(--control-h-md) min-w-0 py-1 outline-none',
        'file:inline-flex file:border-0 file:bg-transparent file:text-ink',
        'disabled:pointer-events-none',
        className,
      )}
      {...(props as InputProps)}
    />
  )
}

/**
 * How a refused control looks.
 *
 * **A ring as well as the border, because a 1px edge is not a signal.** A
 * refused field has to be findable by looking at the form rather than by
 * reading every message under it - the analyst pressed Save and is looking for
 * what to fix. The weight matches the focus ring, so the two read as the same
 * kind of mark.
 *
 * Exported because a select's trigger and a file input draw their own box and
 * need the same one; the opacity is the sort of value that gets tuned once.
 */
export const invalidRing =
  'aria-[invalid=true]:border-destructive ' +
  'aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-destructive/40'

/**
 * The box a control draws for itself: border, ground, radius, padding and the
 * refused ring.
 *
 * `Input` and `Textarea` apply it. It is exported for the other controls that
 * must draw the same box -- a select's trigger, the archive's file input --
 * so the edge is defined once.
 */
export const controlBase =
  'w-full rounded-sm border border-input bg-background px-2 text-base ' +
  'transition-colors placeholder:text-ink-muted ' +
  'disabled:cursor-not-allowed disabled:opacity-50 ' +
  invalidRing

export { Input }
