import { X } from 'lucide-react'
import { motion, type MotionProps } from 'motion/react'
import { useContext, useState, type ComponentType, type ReactNode } from 'react'
import {
  Dialog as AriaDialog,
  Modal as AriaModal,
  DialogTrigger,
  Heading,
  ModalOverlay,
  OverlayTriggerStateContext,
  composeRenderProps,
  type DialogProps as AriaDialogProps,
  type ModalOverlayProps,
} from 'react-aria-components'

import {
  overlay as overlayMotion,
  scrim as scrimMotion,
  type MotionCollidingProps,
} from '@/lib/motion'

import { Button } from './button'

import { tv } from '@/lib/cn'

/**
 * A modal dialog.
 *
 * Wrap a trigger and a `Dialog` in `DialogTrigger`, or drive it with
 * `isOpen`/`onOpenChange` on the `Dialog`. Dismissal, focus trapping and
 * scroll locking are React Aria's.
 *
 * **Animated by Motion rather than by keyframes**, for the reason
 * `popover.tsx` records: a keyframe animation is not interruptible, so opening
 * and closing quickly jumps to the end state instead of turning round.
 * -> https://react-aria.adobe.com/styling#motion
 */
const overlay = tv({
  base: [
    'fixed inset-0 isolate z-50 flex items-center justify-center bg-scrim p-4',
    'supports-backdrop-filter:backdrop-blur-xs',
  ],
  variants: {
    /** `finder` sits high so a list growing downward does not move what you read. */
    size: {
      compact: 'items-center',
      form: 'items-center',
      workbench: 'items-center',
      finder: 'items-start pt-[12vh]',
    },
  },
  defaultVariants: { size: 'compact' },
})

/**
 * Widths are archetypes, not free numbers: a dialog is picked by what it holds,
 * so a field added to a served spec widens its dialog without anybody choosing.
 */
const modal = tv({
  base: [
    'flex w-full flex-col overflow-hidden bg-popover text-sm text-ink',
    'rounded-lg ring-1 ring-ink/10 bg-clip-padding outline-hidden',
  ],
  variants: {
    size: {
      /** One column: a prompt, a decision, a short form. */
      compact: 'max-w-[512px] max-h-[calc(100vh-4rem)]',
      /** Two columns. */
      form: 'max-w-[860px] max-h-[calc(100vh-4rem)]',
      /** Three columns, or fields beside a panel. Fixed, so it does not resize under the cursor. */
      workbench: 'max-w-[1080px] h-[min(760px,calc(100vh-4rem))]',
      /** A list you scan and dismiss. */
      finder: 'max-w-[640px] h-[min(520px,calc(100vh-8rem))]',
    },
  },
  defaultVariants: { size: 'compact' },
})

/**
 * Created once at module scope: `motion.create()` inside a render builds a new
 * component type every frame, which remounts the overlay mid-animation.
 *
 * The cast drops the props both libraries claim under different types --
 * `MotionCollidingProps` names the set and says why.
 */
const MotionModalOverlay = motion.create(ModalOverlay) as ComponentType<
  Omit<ModalOverlayProps, MotionCollidingProps> & MotionProps
>
const MotionModal = motion.create(AriaModal) as ComponentType<
  Omit<ModalOverlayProps, MotionCollidingProps> & MotionProps
>

/**
 * Holds a closed overlay on screen while its closing animation runs.
 *
 * React Aria unmounts an overlay the moment its state closes, and its own
 * detection only looks for a CSS animation -- Motion animates in JavaScript, so
 * nothing holds the element and the exit is never seen. Passing `isExiting`
 * does hold it, and this computes that **during render**: an effect runs after
 * the render that already decided to unmount, which is one render too late.
 *
 * Returns the props to spread on the outermost motion overlay. `animate` is a
 * variant name, so it reaches the panel inside without being passed down.
 *
 * @param isOpen Whether the overlay's own state says it is open.
 */
export function useOverlayExit(isOpen: boolean): {
  isExiting: boolean
  animate: 'shown' | 'gone'
  onAnimationComplete: (definition: unknown) => void
} {
  const [mounted, setMounted] = useState(isOpen)
  if (isOpen && !mounted) setMounted(true)
  return {
    isExiting: mounted && !isOpen,
    animate: isOpen ? 'shown' : 'gone',
    onAnimationComplete: (definition: unknown) => {
      if (definition === 'gone') setMounted(false)
    },
  }
}

/**
 * Whether the overlay is open, from whichever of the three places says so.
 *
 * A `DialogTrigger` publishes its state on context; a controlled overlay
 * carries `isOpen`; one opened with `defaultOpen` and no trigger keeps its
 * state inside React Aria, where nothing can read it -- that last one enters
 * animated and leaves without.
 */
export function useOverlayIsOpen(props: {
  isOpen?: boolean | undefined
  defaultOpen?: boolean | undefined
}): boolean {
  const state = useContext(OverlayTriggerStateContext)
  return props.isOpen ?? state?.isOpen ?? props.defaultOpen ?? false
}

export interface DialogLook {
  /** Which archetype. Picks the width, the height rule and the vertical placing. */
  size?: 'compact' | 'form' | 'workbench' | 'finder'
}

export interface DialogProps
  extends Omit<ModalOverlayProps, 'children' | MotionCollidingProps>, DialogLook {
  children: ReactNode
  /** Passed to the inner `Dialog`, for `aria-label` and the like. */
  dialogProps?: Omit<AriaDialogProps, 'children'>
}

export function Dialog({ children, size = 'compact', dialogProps, ...props }: DialogProps) {
  const exit = useOverlayExit(useOverlayIsOpen(props))
  return (
    <MotionModalOverlay
      data-part="dialog"
      {...props}
      isDismissable={props.isDismissable ?? true}
      isExiting={exit.isExiting}
      onAnimationComplete={exit.onAnimationComplete}
      variants={scrimMotion}
      // `false`, not a variant name: entering from one needs the transition
      // after it to run, and StrictMode's double-mount in development loses
      // it, leaving the overlay at `opacity: 0`. `Popover` and `Sheet` too.
      initial={false}
      animate={exit.animate}
      className={composeRenderProps(props.className, (resolved, renderProps) =>
        overlay({ ...renderProps, size, className: resolved }),
      )}
    >
      <MotionModal
        variants={overlayMotion}
        className={(renderProps) => modal({ ...renderProps, size })}
      >
        <AriaDialog {...dialogProps} className="flex min-h-0 flex-1 flex-col outline-hidden">
          {children}
        </AriaDialog>
      </MotionModal>
    </MotionModalOverlay>
  )
}

/** Title row. `onClose` draws the dismiss control; omit it for a dialog that must be answered. */
export function DialogHeader({
  title,
  description,
  onClose,
}: {
  title: string
  description?: string
  onClose?: () => void
}) {
  return (
    <div className="flex shrink-0 items-start justify-between gap-4 px-4 pt-4 pb-2">
      <div className="flex min-w-0 flex-col gap-2">
        <Heading slot="title" className="text-base leading-none font-medium">
          {title}
        </Heading>
        {description !== undefined && <p className="text-sm text-ink-muted">{description}</p>}
      </div>
      {onClose !== undefined && (
        <Button variant="ghost" size="icon-sm" aria-label="Close" onPress={onClose}>
          <X />
        </Button>
      )}
    </div>
  )
}

/** The scrolling middle. The header and footer stay put. */
export function DialogBody({ children }: { children: ReactNode }) {
  return (
    // **Said, because CSS decides this axis if nothing else does.** A box
    // scrolling one axis has the other promoted from `visible` to `auto`, so
    // any child bleeding a pixel sideways draws a scrollbar the width of the
    // dialog. `Section fills` always bleeds - ring room each side, plus the
    // gutter its own scrollport reserves on the right - which measured 2px
    // past this box on the importer's door.
    //
    // Padding is the wrong lever: that gutter is the platform's, and a wider
    // scrollbar makes the overflow worse rather than better. `clip` is what
    // this wants and not what it gets - beside `overflow-y: auto` it is
    // demoted to `hidden`, so the box stays a scroll container that draws no
    // bar. What that withholds is the ring room, never a row: the wizard's own
    // content box ends 27px inside this one.
    //
    // **Said on the shared body rather than on the one dialog that overflows**,
    // because sideways is not an axis a dialog scrolls in this kit: anything
    // wide enough to need one carries its own scroller, as the importer's
    // listing does at `scroll="box"`. Counted before widening it that far -
    // `import-sentinel` is the only one of the fourteen call sites holding a
    // `Section fills`, which is the construct that bleeds, and none holds a
    // table directly. So nothing else is clipped today, and a future dialog
    // wide enough to be is a layout to fix rather than one to scroll.
    <div
      // The scroller takes focus itself: a body of plain prose overflows and
      // holds nothing else to reach it by. -> #929
      tabIndex={0}
      className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 pt-2 pb-4"
    >
      {children}
    </div>
  )
}

/** Action row, right-aligned on its own ground. One filled button at most. */
export function DialogFooter({ children }: { children: ReactNode }) {
  return (
    <div
      data-part="dialog-footer"
      className="flex shrink-0 flex-col-reverse gap-2 rounded-b-lg border-t border-border bg-muted/50 p-4 sm:flex-row sm:items-center sm:justify-end"
    >
      {children}
    </div>
  )
}

export { DialogTrigger }
