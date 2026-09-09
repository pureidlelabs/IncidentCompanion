import { AnimatePresence, motion, type MotionProps } from 'motion/react'
import type { ComponentProps } from 'react'

import { spring, swap } from '@/lib/motion'

import { tv } from '@/lib/cn'

/**
 * A small label: a severity, a verdict, a marking. Square-cornered; the pill
 * is the pressable shape.
 *
 * Each variant has a job. `solid` is a tone the analyst must not miss - a
 * severity, a verdict, a refused write - and carries no fill of its own, so
 * the caller sets one from the severity ramp, the verdicts or the action
 * classes. `soft` classifies without alarming and is the default. `outlined`
 * is metadata that should recede: an origin, a template name, a scope.
 */
const badge = tv({
  base: [
    // `max-w-full` caps the badge at its container, which is what the clip
    // below and a caller's `truncate` both need to fire.
    'inline-flex h-5 w-fit max-w-full shrink-0 items-center justify-center gap-1 rounded-xs',
    'overflow-hidden whitespace-nowrap align-middle',
    'border border-transparent font-medium transition-[color,background-color,border-color,box-shadow]',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0 icon-3',
  ],
  variants: {
    variant: {
      solid: '',
      outlined: 'border-border text-ink-muted',
      soft: 'bg-secondary text-on-secondary',
    },
    size: {
      sm: 'px-2 py-0.5 text-2xs',
      xs: 'px-1.5 text-2xs',
    },
    uppercase: { true: 'uppercase tracking-micro', false: '' },
  },
  defaultVariants: { variant: 'soft', size: 'sm', uppercase: false },
})

export interface BadgeLook {
  /** The job. `solid` must not be missed and carries no fill of its own; `soft` classifies; `outlined` recedes. */
  variant?: 'solid' | 'outlined' | 'soft'
  /** Density. */
  size?: 'sm' | 'xs'
  /** Uppercase, at the micro tracking. */
  uppercase?: boolean
}

export interface BadgeProps extends ComponentProps<'span'>, BadgeLook {
  /** Name the state the content is showing; changing it animates the swap and the resize. */
  stateKey?: string | number
}

/**
 * The props both libraries claim with different types. A badge needs none of
 * them, and under `exactOptionalPropertyTypes` none of them reconcile - the
 * same set `popover.tsx` drops for the same reason.
 */
type Colliding =
  | 'style'
  | 'onAnimationStart'
  | 'onAnimationEnd'
  | 'onAnimationIteration'
  | 'onDrag'
  | 'onDragStart'
  | 'onDragEnd'

/**
 * A badge. Not focusable and not pressable - wrap it if it has to be.
 *
 * **`stateKey` turns it into a multi-state badge.** Without it this is a
 * plain `span` and nothing animates. With it the badge is laid out by Motion,
 * so its width follows the content, and the content itself is swapped through
 * `AnimatePresence` - the outgoing state leaves while the incoming one arrives,
 * over a box that is already the right size. That is the whole trick: a
 * `Queued` chip becoming `Uploading 3 of 12` becoming `Done` reads as one
 * object changing rather than three badges replacing each other.
 *
 * `mode="popLayout"` is what keeps the two states on top of one another instead
 * of side by side for a frame.
 * -> https://motion.dev/examples/react-multi-state-badge
 */
export function Badge({ variant, size, uppercase, className, stateKey, ...props }: BadgeProps) {
  const painted = badge({ variant, size, uppercase, className })
  if (stateKey === undefined) {
    return <span data-part="badge" {...props} className={painted} />
  }
  const { children, ...rest } = props
  return (
    <motion.span
      data-part="badge"
      {...(rest as unknown as Omit<ComponentProps<'span'>, Colliding | 'children'> & MotionProps)}
      layout
      transition={spring.control}
      className={painted}
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={stateKey}
          data-part="badge-state"
          className="inline-flex items-center gap-1"
          variants={swap}
          initial="hidden"
          animate="shown"
          exit="gone"
        >
          {children}
        </motion.span>
      </AnimatePresence>
    </motion.span>
  )
}

export { badge as badgeVariants }
