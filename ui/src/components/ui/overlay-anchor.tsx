import { createPortal } from 'react-dom'
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
 */
export function OverlayAnchor({ at, position = 'absolute', label, className }: OverlayAnchorProps) {
  const anchor = (
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

  // **`fixed` means the viewport, and only the body guarantees that.** Any
  // promoted ancestor -- a transform, a filter, a `will-change` -- becomes the
  // containing block for a fixed descendant, and the anchor then lands offset
  // by that box's own position. React context reaches through a portal, so the
  // trigger still finds it.
  return position === 'fixed' ? createPortal(anchor, document.body) : anchor
}
