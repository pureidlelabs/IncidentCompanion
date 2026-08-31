import { AnimatePresence, motion, type MotionProps } from 'motion/react'
import type { ComponentProps } from 'react'
import { tv } from 'tailwind-variants'

import { spring, swap } from '@/lib/motion'

/**
 * A small label: a severity, a verdict, a marking, a count.
 *
 * Each variant has a job. `solid` is a tone the analyst must not miss - a
 * severity, a verdict, a refused write - and carries no fill of its own, so
 * the caller sets one from the severity ramp, the verdicts or the action
 * classes. `soft` classifies without alarming and is the default. `outlined`
 * is metadata that should recede: an origin, a template name, a scope.
 */
const badge = tv({
  base: [
    'inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 rounded-sm',
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

// Spelled out rather than derived from `VariantProps`: react-docgen-typescript
// cannot follow a generated type, and the props vanish from the docs page.
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
