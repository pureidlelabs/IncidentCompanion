import { motion } from 'motion/react'
import { tv } from 'tailwind-variants'

import { cn } from '@/lib/cn'
import { DURATION } from '@/lib/motion'

/**
 * A loading placeholder standing in for content that has not arrived.
 */
const skeleton = tv({
  base: 'relative overflow-hidden bg-muted',
  variants: {
    shape: {
      block: 'w-full rounded-md',
      text: 'h-3 w-full rounded-md last:w-2/3',
      circle: 'aspect-square rounded-full',
    },
    /** `pulse` is a plain opacity throb; `shimmer` runs a highlight across it. */
    motion: {
      pulse: 'motion-safe:animate-pulse',
      shimmer: '',
      none: '',
    },
  },
  defaultVariants: { shape: 'block', motion: 'shimmer' },
})

/** The look this component takes. Spelled out so the docs generator can read it. */
export interface SkeletonLook {
  /** What the placeholder stands in for: a box, a line of prose, or an avatar. */
  shape?: 'block' | 'text' | 'circle'
  /** How it signals that it is waiting. `none` for a page of many, where a wall of movement is worse than none. */
  motion?: 'pulse' | 'shimmer' | 'none'
}

export interface SkeletonProps
  extends Omit<React.ComponentProps<'div'>, 'onAnimationStart' | 'onDrag' | 'onDragStart' | 'onDragEnd'>,
    SkeletonLook {}

/**
 * A highlight travelling across the placeholder, left to right.
 */
function Shimmer() {
  return (
    <motion.span
      aria-hidden
      data-slot="skeleton-shimmer"
      className="absolute inset-y-0 -left-full w-full bg-gradient-to-r from-transparent via-ink/10 to-transparent"
      animate={{ x: ['0%', '200%'] }}
      transition={{
        duration: DURATION.slow * 5,
        ease: 'linear',
        repeat: Infinity,
        // A beat between passes, so a column of them does not read as a barcode.
        repeatDelay: DURATION.slow,
      }}
    />
  )
}

export function Skeleton({ shape, motion: how = 'shimmer', className, ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden
      data-slot="skeleton"
      className={cn(skeleton({ shape, motion: how }), className)}
      {...props}
    >
      {how === 'shimmer' && <Shimmer />}
    </div>
  )
}

export { skeleton as skeletonVariants }
