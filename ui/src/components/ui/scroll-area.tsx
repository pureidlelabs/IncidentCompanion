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
