import { AnimatePresence, motion, type MotionProps } from 'motion/react'
import type { ComponentProps } from 'react'
import { tv } from 'tailwind-variants'

import { spring, swap } from '@/lib/motion'

/**
 * A small label: a severity, a verdict, a marking, a count.
 */
const badge = tv({
  base: [
    // `max-w-full` caps the badge at its container, which is what the clip
    // below and a caller's `truncate` both need to fire.
    'inline-flex h-5 w-fit max-w-full shrink-0 items-center justify-center gap-1 rounded-sm',
    'overflow-hidden whitespace-nowrap align-middle',
    'border border-transparent font-medium transition-[color,background-color,border-color,box-shadow]',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-3',
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
      // A count is a chip rather than a label, so it keeps the softer corner.
      count: 'min-w-4 rounded-md px-1 text-2xs tabular-nums',
    },
    uppercase: { true: 'uppercase tracking-micro', false: '' },
  },
  defaultVariants: { variant: 'soft', size: 'sm', uppercase: false },
})

export interface BadgeLook {
  /** The job. `solid` must not be missed and carries no fill of its own; `soft` classifies; `outlined` recedes. */
  variant?: 'solid' | 'outlined' | 'soft'
  /** Density. `count` is sized for a number rather than a word. */
  size?: 'sm' | 'xs' | 'count'
  /** Uppercase, at the micro tracking. */
  uppercase?: boolean
}

export interface BadgeProps extends ComponentProps<'span'>, BadgeLook {
  /** Name the state the content is showing; changing it animates the swap and the resize. */
  stateKey?: string | number
}

/**
 * The props both libraries claim with different types.
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
 */
export function Badge({ variant, size, uppercase, className, stateKey, ...props }: BadgeProps) {
  const painted = badge({ variant, size, uppercase, className })
  if (stateKey === undefined) {
    return <span data-slot="badge" {...props} className={painted} />
  }
  const { children, ...rest } = props
  return (
    <motion.span
      data-slot="badge"
      {...(rest as unknown as Omit<ComponentProps<'span'>, Colliding | 'children'> & MotionProps)}
      layout
      transition={spring.control}
      className={painted}
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={stateKey}
          data-slot="badge-state"
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
