import { motion } from 'motion/react'

import { draw } from '@/lib/motion'
import { cn } from '@/lib/cn'

/**
 * The tick's own geometry, as a path rather than an icon component.
 */
export const CHECK_PATH = 'M20 6 9 17l-5-5'

/**
 * A checkmark that draws itself on.
 */
export function DrawnCheck({
  className,
  ...props
}: {
  className?: string | undefined
  'data-slot'?: string | undefined
}) {
  return (
    <motion.svg
      {...props}
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('size-4 shrink-0', className)}
    >
      <motion.path d={CHECK_PATH} variants={draw} initial="hidden" animate="shown" />
    </motion.svg>
  )
}
