import { motion } from 'motion/react'

import { draw } from '@/lib/motion'
import { cn } from '@/lib/cn'

/**
 * The tick's own geometry, as a path rather than an icon component.
 *
 * `pathLength` animates on a `motion.path`, and an icon component renders its
 * own `path` that nothing outside it can drive.
 */
export const CHECK_PATH = 'M20 6 9 17l-5-5'

/**
 * A checkmark that draws itself on.
 *
 * **The stroke arriving is what says the thing just happened**, rather than a
 * glyph that was always going to be there appearing all at once. It is the
 * difference between a control reporting a result and a control showing an
 * icon.
 *
 * Decorative: it carries no label, so whatever it sits beside says what
 * finished. `Button` puts it next to the settled words and `CopyButton` swaps
 * it for the clipboard.
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
