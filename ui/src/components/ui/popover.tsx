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
 *
 * The ring is always `ring-1 ring-ink/10`. The shadow says how the
 * surface arrived:
 *
 * | Arrives | Lift |
 * | --- | --- |
 * | behind a scrim -- dialog, alert dialog | none; the scrim is the separation |
 * | anchored to what was just touched -- popover, hover card, tooltip | `shadow-md` |
 * | unannounced over live content -- toast, sheet | `shadow-lg` |
 */

/**
 * A surface anchored to a trigger. The base for `Menu`, `Select` and `ComboBox`.
 *
 * **Animated by Motion rather than by keyframes.** React Aria's own styling
 * guide is explicit that a keyframe animation is not interruptible -- open and
 * close a popover quickly and it jumps to the end state before the next one
 * starts. `motion.create()` wraps the component so `isEntering`/`isExiting`
 * drive an interruptible animation instead, and `isExiting` is what holds the
 * element in the DOM until it finishes.
 * -> https://react-aria.adobe.com/styling#motion
 */
const popover = tv({
  base: [
    'bg-popover text-popover-foreground rounded-lg shadow-md ring-1 ring-ink/10',
    'bg-clip-padding outline-hidden',
  ],
  variants: {
    /**
     * `OverlayArrow` renders outside the popover's own box, so an `overflow`
     * on the root clips it away entirely. A surface with an arrow leaves its
     * content to scroll itself -- `Menu` and `ListBox` already do.
     */
    showArrow: { true: '', false: 'overflow-auto' },
  },
  defaultVariants: { showArrow: false },
})

/**
 * Created once at module scope: `motion.create()` inside a render builds a new
 * component type every frame, which remounts the overlay mid-animation.
 *
 * The cast drops the props whose names both libraries claim with different
 * types: `style` (a React Aria render prop against Motion's `MotionStyle`),
 * the three DOM animation events against Motion's callbacks of the same name,
 * and the drag events. Under `exactOptionalPropertyTypes` none of them
 * reconcile, and a popover needs none of them -- it is positioned by React
 * Aria and painted by `className`.
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
 * and combo-box surfaces are painted on. A hover card and a plain popover stay
 * opaque, so this is passed as a `className` rather than being in the base.
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
   * `MenuTrigger` supplies `offset: 0` through `PopoverContext` when its
   * `trigger` is `contextMenu`, because a context menu opens at the cursor
   * rather than off an anchor. Setting `offset` unconditionally here overrode
   * that and stood every context menu 8px away from the pointer.
   */
  const inherited = useSlottedContext(PopoverContext)
  const offset =
    props.offset ?? (inherited?.offset ?? (showArrow === true ? 12 : 8))

  /**
   * **The exit is the `isExiting` hold, the same one `Dialog`, `Sheet` and
   * `Tooltip` take.**
   *
   * React Aria unmounts an overlay the moment its state closes, and its own
   * detection looks only for a CSS animation - Motion animates in JavaScript,
   * so nothing held the element. An `exit` prop cannot answer it either:
   * Motion runs `exit` only for a child of `AnimatePresence`, and an overlay
   * cannot be wrapped in one because React Aria owns the unmount.
   *
   * **This changes the unmount timing of every menu, select and combo box**:
   * the surface stays in the DOM until the animation finishes. A test that
   * asserted a list was gone in the same tick asserts it becomes gone.
   * -> https://react-aria.adobe.com/styling#motion
   */

  // `?? 'bottom'` is React Aria's own default for a popover, spelled here
  // because it differs per component - a tooltip's is `top`.
  const { variants, origin } = anchored(props.placement ?? 'bottom')
  const exit = useOverlayExit(useOverlayIsOpen(props))

  return (
    <MotionPopover
      // **Before `{...props}`, so a caller can still name its own surface.**
      // Written after it, this would silently overwrite whatever the call site
      // set.
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
 *
 * `isOpen`/`onOpenChange` drive it from outside, for a trigger the caller owns
 * -- an `OverlayAnchor` at a point on a canvas, say. Left uncontrolled, the
 * first child opens it on press.
 */
export function PopoverTrigger(props: PopoverTriggerProps) {
  return <DialogTrigger {...props} />
}

export { popover as popoverStyles }
