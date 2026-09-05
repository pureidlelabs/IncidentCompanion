import type { ComponentProps } from 'react'
import { Input as InputPrimitive, type InputProps } from 'react-aria-components'

import { cn } from '@/lib/cn'

/**
 * A single-line text box, drawing its own border, ground and height from
 * `controlBase`.
 */
/**
 * Typed against the native element rather than React Aria's `InputProps`.
 */
function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <InputPrimitive
      data-slot="input"
      className={cn(
        // **Its own box, on this project's tokens.** A caller that already
        // draws one passes `border-0 bg-transparent` down.
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
 */
export const invalidRing =
  'aria-[invalid=true]:border-destructive ' +
  'aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-destructive/40'

/**
 * The box a control draws for itself: border, ground, radius, padding and the
 * refused ring.
 */
export const controlBase =
  'w-full rounded-sm border border-input bg-background px-2 text-base ' +
  'transition-colors placeholder:text-ink-muted ' +
  'disabled:cursor-not-allowed disabled:opacity-50 ' +
  invalidRing

export { Input }

/*
 * The native `Select` that lived here is gone: `components/ui/select.tsx`'s
 * `VocabSelect` is every closed vocabulary in the tier, so this had no caller
 * left. It kept the platform picker on touch and free screen-reader
 * behaviour, which is the cost of the swap and is paid for in that file's
 * docstring - the option list was the one surface no token could reach.
 */
