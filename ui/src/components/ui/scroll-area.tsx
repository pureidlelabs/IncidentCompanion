import { tv } from 'tailwind-variants'

import { cn } from '@/lib/cn'

const scrollArea = tv({
  base: [
    'relative min-h-0 overflow-auto overscroll-contain',
  ],
  variants: {
    orientation: {
      vertical: 'overflow-x-hidden',
      horizontal: 'overflow-y-hidden',
      both: '',
    },
  },
  defaultVariants: { orientation: 'vertical' },
})

/** The look this component takes. Spelled out so the docs generator can read it. */
export interface ScrollAreaLook {
  /** Which axis may scroll. The other is hidden. */
  orientation?: 'vertical' | 'horizontal' | 'both'
}

export interface ScrollAreaProps extends React.ComponentProps<'div'>, ScrollAreaLook {}

/**
 * A region that scrolls, with the app's scrollbar rather than the platform's.
 *
 * Native overflow, not a virtualised or JavaScript scroller: React Aria has no
 * scroll-area primitive because there is no behaviour to own. Keyboard
 * scrolling, momentum and the scroll anchor are the browser's.
 *
 * - Give it a height. Without a `max-h`, `h-` or a flex parent that bounds it,
 *   nothing overflows and it renders as a plain `div`.
 * - `overscroll-contain`: a scroll reaching the end does not chain to the page
 *   behind it, which matters inside a popover.
 * - Not focusable. Wrap in a `tabIndex={0}` element where the region must be
 *   reachable by keyboard on its own.
 */
export function ScrollArea({ orientation, className, ...props }: ScrollAreaProps) {
  return (
    <div
      data-slot="scroll-area"
      data-orientation={orientation ?? 'vertical'}
      className={cn(scrollArea({ orientation }), className)}
      {...props}
    />
  )
}

export { scrollArea as scrollAreaVariants }
