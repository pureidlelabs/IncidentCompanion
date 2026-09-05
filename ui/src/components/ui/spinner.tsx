import { LoaderCircle } from 'lucide-react'
import { tv } from 'tailwind-variants'

import { cn } from '@/lib/cn'

/**
 * A busy indicator.
 *
 * Announces itself as `role="status"` with a default label of `Loading`; pass
 * `aria-label` for something a reader can act on, or `aria-hidden` where
 * something beside it already says what is happening. The `pane` size is the
 * one drawn on its own rather than inside a control.
 */
const spinner = tv({
  // **Guarded, because a busy state does not depend on it.** A caller pairs
  // the glyph with words -- the button does -- so an analyst who asked their
  // system for less motion is told what is happening rather than shown it.
  base: 'motion-safe:animate-spin text-current',
  variants: {
    size: {
      xs: 'size-3',
      sm: 'size-3.5',
      default: 'size-4',
      lg: 'size-5',
      pane: 'size-control-lg',
    },
  },
  defaultVariants: { size: 'default' },
})

/** The look this component takes. Spelled out so the docs generator can read it. */
export interface SpinnerLook {
  /** Glyph size. `pane` is the `--spacing-control-lg` tier, for a spinner standing alone. */
  size?: 'xs' | 'sm' | 'default' | 'lg' | 'pane'
}

export interface SpinnerProps extends React.ComponentProps<'svg'>, SpinnerLook {}

export function Spinner({ size, className, ...props }: SpinnerProps) {
  // **`aria-hidden` makes it decorative, and takes the role with it.** A busy
  // indicator beside words that already say what is happening is a second copy
  // of the same fact, and a hidden node carrying `role="status"` is a live
  // region announcing into nothing. So the caller marks it hidden and the
  // component stops claiming to be a status.
  const decorative = props['aria-hidden'] === true || props['aria-hidden'] === 'true'
  return (
    <LoaderCircle
      data-slot="spinner"
      {...(decorative ? {} : { role: 'status', 'aria-label': 'Loading' })}
      className={cn(spinner({ size }), className)}
      {...props}
    />
  )
}

export { spinner as spinnerVariants }
