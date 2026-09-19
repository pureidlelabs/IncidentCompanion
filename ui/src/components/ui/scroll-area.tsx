import { cn, tv } from '@/lib/cn'

const scrollArea = tv({
  base: ['relative min-h-0 overflow-auto overscroll-contain'],
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

export interface ScrollAreaProps extends React.ComponentProps<'div'>, ScrollAreaLook {
  /** Names the region, which makes it one. Omitted, it is a focus stop and no landmark. */
  label?: string | undefined
}

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
 * - Focusable, because arrow keys move the focused element's nearest
 *   scrollable ancestor: a wrapper around the scroller scrolls the page
 *   instead. Pass `tabIndex={-1}` where the content already takes focus and a
 *   second stop is noise.
 * - `label` makes it a named region. Without a name it stays a focus stop and
 *   claims no landmark, since an unnamed one announces nothing. -> #929
 */
export function ScrollArea({ orientation, className, label, ...props }: ScrollAreaProps) {
  return (
    <div
      data-part="scroll-area"
      data-orientation={orientation ?? 'vertical'}
      tabIndex={0}
      {...(label === undefined ? {} : { role: 'region', 'aria-label': label })}
      className={cn(scrollArea({ orientation }), className)}
      {...props}
    />
  )
}

export { scrollArea as scrollAreaVariants }
