import { Pressable } from 'react-aria-components'

import { cn } from '@/lib/cn'

export interface OverlayAnchorProps {
  /** Where the overlay opens, in the coordinates named by `position`. */
  at: { left: number; top: number; width?: number | undefined; height?: number | undefined }
  /**
   * `fixed` for a viewport coordinate -- a pointer event's `clientX`/`clientY`.
   * `absolute` for one inside the nearest positioned ancestor.
   */
  position?: 'fixed' | 'absolute'
  /** The overlay's name: the anchor announces as a button. */
  label: string
  className?: string | undefined
}

/**
 * A box an overlay opens against, at coordinates the caller owns.
 *
 * For a trigger that is not one of React Aria's controls: a table row, a
 * region of a screen, a shape on a canvas. React Aria takes a trigger's ref
 * through context, so a plain element hands it nothing and the overlay opens
 * against the pane's corner instead of the thing pointed at; `Pressable` is
 * the escape hatch that carries the trigger behaviour onto it.
 *
 * Put it inside a trigger -- `MenuTrigger`, `HoverCard`, `DialogTrigger` --
 * driven by `isOpen`/`onOpenChange`, with the overlay as the next child.
 *
 * ```tsx
 * <MenuTrigger trigger="contextMenu" isOpen={at !== null} onOpenChange={close}>
 *   <OverlayAnchor at={{ left: at?.x ?? 0, top: at?.y ?? 0 }} label="WKS-FIN01" />
 *   <Menu aria-label="More for WKS-FIN01">{items}</Menu>
 * </MenuTrigger>
 * ```
 *
 * It takes no pointer events and is never tabbed to: nothing is drawn, and
 * whatever the anchor stands for is the thing that carries the keyboard route.
 */
export function OverlayAnchor({ at, position = 'absolute', label, className }: OverlayAnchorProps) {
  return (
    <Pressable>
      <span
        data-slot="overlay-anchor"
        role="button"
        aria-label={label}
        tabIndex={-1}
        className={cn(
          'pointer-events-none',
          position === 'fixed' ? 'fixed' : 'absolute',
          at.width === undefined && at.height === undefined && 'size-px',
          className,
        )}
        style={{
          left: at.left,
          top: at.top,
          ...(at.width === undefined ? {} : { width: at.width }),
          ...(at.height === undefined ? {} : { height: at.height }),
        }}
      />
    </Pressable>
  )
}
