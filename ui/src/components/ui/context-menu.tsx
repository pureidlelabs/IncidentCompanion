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
 *
 * Wrap a `ContextMenuTarget` and the kit's `Menu` in a `ContextMenuTrigger`.
 * The rows are `MenuItem`, `MenuSectionGroup` and `MenuShortcut` from
 * `./menu`; there is no separate row component here.
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
 *
 * `trigger` is fixed to `contextMenu`; for a menu that opens on press, use
 * `MenuTrigger` from `./menu`.
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
 *
 * `children` cannot simply be dropped or the region would take none: React
 * Aria's is a render function as well as a node, Motion's is a node or a
 * `MotionValue`, and the intersection accepts neither -- so React Aria's is
 * kept and Motion's discarded, which is safe because Motion never reads them.
 * `onHoverStart`/`onHoverEnd` are React Aria's `HoverEvent` against Motion's
 * pointer callbacks; the region wants neither, so both go.
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
 *
 * A context menu is the one control with no visible affordance -- nothing on
 * the region says a right click will do anything. The hover lift is the
 * affordance, and `armed` is the region saying it is the thing the open menu
 * will act on, which matters when the menu opens at the pointer some distance
 * away from the region's own edges.
 */
const arming = {
  idle: { scale: 1 },
  /**
   * Held while the menu stands open, saying which region it will act on -- the
   * menu opens at the pointer, which can be some way from the region's edges.
   *
   * There is no hover state. It was 1.004, four tenths of a percent, which
   * nobody perceives; and a region is not a control that wants press feedback
   * of its own, since pressing it is what opens the menu.
   */
  armed: { scale: 0.994 },
} as const

export interface ContextMenuTargetProps
  extends Omit<AriaButtonProps, ButtonColliding>, ContextMenuTargetLook {}

/**
 * The region the menu belongs to. Announces as a button, so it needs a name
 * from its children or from `aria-label`.
 *
 * A button rather than a plain element on purpose: it is what carries the
 * keyboard route to the menu on platforms whose context-menu key needs a
 * focused control.
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
 *
 * `ContextMenuTarget` above announces as a button and so cannot legally wrap a
 * `<tr>` or an `<li>` with interactive content of its own. This takes the
 * position instead of the element: the caller handles `contextmenu` on
 * whatever it owns and hands over the coordinates, and the menu opens there.
 * React Aria's own escape hatch, `Pressable`, is what carries the press
 * behaviour onto the anchor -- the documented way to trigger a menu from
 * something that is not one of its own controls.
 *
 * ```tsx
 * const [at, setAt] = useState<PointerAt | null>(null)
 * <tr onContextMenu={(e) => { e.preventDefault(); setAt({ x: e.clientX, y: e.clientY }) }}>
 * <PointerContextMenu at={at} onClose={() => setAt(null)} label="WKS-FIN01">
 *   <Menu aria-label="More for WKS-FIN01">{items}</Menu>
 * </PointerContextMenu>
 * ```
 *
 * The keyboard route comes free: the context-menu key and Shift+F10 both fire
 * `contextmenu` at the focused element, so a caller that handles the event
 * rather than the right button gets both.
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
