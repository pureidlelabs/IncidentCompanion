import {
  DialogTrigger,
  OverlayArrow,
  Popover as AriaPopover,
  PopoverContext,
  composeRenderProps,
  useSlottedContext,
  type DialogTriggerProps,
  type PopoverProps as AriaPopoverProps,
} from 'react-aria-components'
import { motion, type MotionProps } from 'motion/react'
import type { ComponentType, ReactNode } from 'react'
import { tv } from 'tailwind-variants'

import { anchored } from '@/lib/motion'

import { useOverlayExit, useOverlayIsOpen } from './dialog'

/**
 * **How a floating surface separates itself, in one rule for all six.**
 */

/**
 * A surface anchored to a trigger. The base for `Menu`, `Select` and `ComboBox`.
 */
const popover = tv({
  base: [
    'bg-popover text-popover-foreground rounded-lg shadow-md ring-1 ring-ink/10',
    'bg-clip-padding outline-hidden',
  ],
  variants: {
    /**
     * `OverlayArrow` renders outside the popover's own box, so an `overflow` on
     * the root clips it away entirely.
     */
    showArrow: { true: '', false: 'overflow-auto' },
  },
  defaultVariants: { showArrow: false },
})

/**
 * Created once at module scope: `motion.create()` inside a render builds a new
 * component type every frame, which remounts the overlay mid-animation.
 */
type Colliding =
  | 'style'
  | 'onAnimationStart'
  | 'onAnimationEnd'
  | 'onAnimationIteration'
  | 'onDrag'
  | 'onDragStart'
  | 'onDragEnd'

const MotionPopover = motion.create(AriaPopover) as ComponentType<
  Omit<AriaPopoverProps, Colliding> & MotionProps
>

/**
 * The menu ground: a 70% panel over a blur, which is what the dropdown, select
 * and combo-box surfaces are painted on.
 */
export const MENU_SURFACE = 'bg-popover/70 backdrop-blur-2xl backdrop-saturate-150'

export interface PopoverLook {
  /** Draw a pointer at the anchored edge. Adds 4px to the offset. */
  showArrow?: boolean
}

export interface PopoverProps extends Omit<AriaPopoverProps, 'children' | Colliding>, PopoverLook {
  children: ReactNode
}

export function Popover({ children, showArrow, className, ...props }: PopoverProps) {
  /**
   * **A prop beats context, so the default has to stand down for one.**
   */
  const inherited = useSlottedContext(PopoverContext)
  const offset =
    props.offset ?? (inherited?.offset ?? (showArrow === true ? 12 : 8))

  /**
   * **The exit is the `isExiting` hold, the same one `Dialog`, `Sheet` and
   * `Tooltip` take.**
   */

  // `?? 'bottom'` is React Aria's own default for a popover, spelled here
  // because it differs per component - a tooltip's is `top`.
  const { variants, origin } = anchored(props.placement ?? 'bottom')
  const exit = useOverlayExit(useOverlayIsOpen(props))

  return (
    <MotionPopover
      // **Before `{...props}`, so a caller can still name its own surface.**
      // Written after it, this would silently overwrite whatever the call site
      // set -- the fault `button.tsx` still carries.
      data-slot="popover"
      {...props}
      offset={offset}
      isExiting={exit.isExiting}
      onAnimationComplete={exit.onAnimationComplete}
      variants={variants}
      initial={false}
      animate={exit.animate}
      style={{ transformOrigin: origin }}
      className={composeRenderProps(className, (resolved) =>
        popover({ showArrow: showArrow === true, className: resolved }),
      )}
    >
      {showArrow === true && (
        <OverlayArrow className="group">
          <svg
            width={12}
            height={12}
            viewBox="0 0 12 12"
            aria-hidden
            className="fill-popover stroke-ink/10 block stroke-1 group-placement-bottom:rotate-180 group-placement-left:-rotate-90 group-placement-right:rotate-90"
          >
            <path d="M0 0 L6 6 L12 0" />
          </svg>
        </OverlayArrow>
      )}
      {children}
    </MotionPopover>
  )
}

/** Pairs a trigger with a `Popover`. The trigger is the first child. */
export type PopoverTriggerProps = DialogTriggerProps

/**
 * A trigger and the `Popover` it opens.
 */
export function PopoverTrigger(props: PopoverTriggerProps) {
  return <DialogTrigger {...props} />
}

export { popover as popoverStyles }
