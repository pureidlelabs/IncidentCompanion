import { motion, type MotionProps } from 'motion/react'
import { useContext, type ComponentType, type ReactNode } from 'react'
import {
  Button as AriaButton,
  MenuTrigger,
  OverlayTriggerStateContext,
  composeRenderProps,
  type ButtonProps as AriaButtonProps,
  type MenuTriggerProps,
} from 'react-aria-components'
import { tv } from 'tailwind-variants'

import { spring, type MotionCollidingProps } from '@/lib/motion'

import { OverlayAnchor } from './overlay-anchor'
import { focusRing } from './rac'

/**
 * A menu opened by right click, long press, or the platform's context-menu
 * key. React Aria positions it at the pointer.
 */
const target = tv({
  extend: focusRing,
  // `min-h-6`: the 24px target floor. `plain` draws nothing of its own, so a
  // one-line region is a bare line box some 3px short of it -- and the region
  // is the only thing on screen that takes the right click. `outline` and
  // `dashed` clear it on their own padding, so the floor changes nothing there.
  base: 'block min-h-6 w-full select-none rounded-lg text-left',
  variants: {
    variant: {
      plain: '',
      outline: 'border border-border bg-background p-4',
      dashed: 'border border-dashed border-border bg-background p-4',
    },
    isDisabled: { true: 'pointer-events-none opacity-50' },
  },
  defaultVariants: { variant: 'plain' },
})

/**
 * Pairs a `ContextMenuTarget` with a `Menu`.
 */
export type ContextMenuTriggerProps = Omit<MenuTriggerProps, 'trigger'>

export function ContextMenuTrigger(props: ContextMenuTriggerProps) {
  return <MenuTrigger {...props} trigger="contextMenu" />
}

export interface ContextMenuTargetLook {
  /** Chrome around the region. `plain` draws nothing of its own. */
  variant?: 'plain' | 'outline' | 'dashed'
}

/**
 * Two collisions past `MotionCollidingProps`, both of them local to a
 * component that takes a press.
 */
type ButtonColliding = MotionCollidingProps | 'onHoverStart' | 'onHoverEnd'

const MotionButton = motion.create(AriaButton) as ComponentType<
  Omit<AriaButtonProps, ButtonColliding | 'children'> &
    Omit<MotionProps, 'children'> &
    Pick<AriaButtonProps, 'children'>
>

/**
 * What the region does while its menu is open, and while it is being reached
 * for.
 */
const arming = {
  idle: { scale: 1 },
  /**
   * Held while the menu stands open, saying which region it will act on -- the
   * menu opens at the pointer, which can be some way from the region's edges.
   */
  armed: { scale: 0.994 },
} as const

export interface ContextMenuTargetProps
  extends Omit<AriaButtonProps, ButtonColliding>, ContextMenuTargetLook {}

/**
 * The region the menu belongs to. Announces as a button, so it needs a name
 * from its children or from `aria-label`.
 */
export function ContextMenuTarget({ variant, ...props }: ContextMenuTargetProps) {
  const state = useContext(OverlayTriggerStateContext)
  const isOpen = state?.isOpen ?? false
  return (
    <MotionButton
      data-slot="context-menu-target"
      {...props}
      variants={arming}
      initial="idle"
      animate={isOpen ? 'armed' : 'idle'}
      transition={spring.control}
      className={composeRenderProps(props.className, (className, renderProps) =>
        target({ ...renderProps, variant, className }),
      )}
    />
  )
}

/** Where a right click landed, in viewport coordinates. */
export interface PointerAt {
  x: number
  y: number
}

export interface PointerContextMenuProps {
  /** Open, and where. `null` closes it. */
  at: PointerAt | null
  onClose: () => void
  /** What the menu names, for the anchor's accessible name. */
  label: string
  /** The kit `Menu` and its rows. */
  children: ReactNode
}

/**
 * A context menu for an element that cannot be a button -- a table row, a list
 * item, a region of a screen.
 */
export function PointerContextMenu({ at, onClose, label, children }: PointerContextMenuProps) {
  const onOpenChange = (open: boolean) => {
    if (!open) onClose()
  }
  return (
    // **Keyed on the position, so a second right click is a second opening.**
    // `isOpen` stays true when the pointer moves to another row, so without
    // this the overlay only slides across and the enter transition, which runs
    // on open, never runs again.
    <MenuTrigger
      key={at === null ? 'closed' : `${String(at.x)},${String(at.y)}`}
      trigger="contextMenu"
      isOpen={at !== null}
      onOpenChange={onOpenChange}
    >
      {/* The trigger for a context menu is the place the pointer was, not a
          control, so the menu opens against a box at those coordinates. */}
      <OverlayAnchor
        position="fixed"
        at={{ left: at?.x ?? 0, top: at?.y ?? 0 }}
        label={`More for ${label}`}
      />
      {children}
    </MenuTrigger>
  )
}

export { target as contextMenuTargetVariants }
