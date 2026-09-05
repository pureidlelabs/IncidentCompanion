import { X } from 'lucide-react'
import {
  motion,
  useDragControls,
  type MotionProps,
  type PanInfo,
} from 'motion/react'
import { useContext, type ComponentType, type PointerEvent, type ReactNode } from 'react'
import {
  Dialog as AriaDialog,
  Modal as AriaModal,
  Heading,
  ModalOverlay,
  OverlayTriggerStateContext,
  composeRenderProps,
  type ModalOverlayProps,
} from 'react-aria-components'
import { tv } from 'tailwind-variants'

import {
  scrim as scrimMotion,
  slide,
  spring,
  type MotionCollidingProps,
} from '@/lib/motion'

import { Button } from './button'
import { useOverlayExit, useOverlayIsOpen } from './dialog'

/**
 * A panel that slides in from an edge. Use it where a dialog would be too small
 * and a page too much.
 */
const overlay = tv({
  base: 'fixed inset-0 z-50 flex bg-scrim supports-backdrop-filter:backdrop-blur-xs',
  variants: {
    side: {
      right: 'justify-end',
      left: 'justify-start',
      bottom: 'items-end',
    },
  },
  defaultVariants: { side: 'right' },
})

const panel = tv({
  base: [
    'flex flex-col overflow-hidden bg-popover text-sm text-popover-foreground',
    'bg-clip-padding shadow-lg ring-1 ring-ink/10 outline-hidden',
  ],
  variants: {
    side: {
      right: 'h-full w-3/4 border-l border-border sm:max-w-sm',
      left: 'h-full w-3/4 border-r border-border sm:max-w-sm',
      bottom: 'max-h-[80vh] w-full border-t border-border',
    },
  },
  defaultVariants: { side: 'right' },
})

const MotionModalOverlay = motion.create(ModalOverlay) as ComponentType<
  Omit<ModalOverlayProps, MotionCollidingProps> & MotionProps
>
const MotionModal = motion.create(AriaModal) as ComponentType<
  Omit<ModalOverlayProps, MotionCollidingProps> & MotionProps
>

/** Which axis a side is dragged on, and which direction dismisses it. */
const THROW = {
  right: { axis: 'x', sign: 1, elastic: { left: 0, right: 0.6, top: 0, bottom: 0 } },
  left: { axis: 'x', sign: -1, elastic: { left: 0.6, right: 0, top: 0, bottom: 0 } },
  bottom: { axis: 'y', sign: 1, elastic: { left: 0, right: 0, top: 0, bottom: 0.6 } },
} as const

/**
 * How far, and how fast, counts as thrown away.
 */
const THROW_DISTANCE = 120
const THROW_VELOCITY = 480

export interface SheetLook {
  /** Which edge it enters from. */
  side?: 'right' | 'left' | 'bottom'
}

export interface SheetProps
  extends Omit<ModalOverlayProps, 'children' | MotionCollidingProps>,
    SheetLook {
  title: string
  /** One line under the title. */
  description?: string
  children: ReactNode
  onClose?: () => void
}

export function Sheet({
  title,
  description,
  children,
  onClose,
  side = 'right',
  ...props
}: SheetProps) {
  const exit = useOverlayExit(useOverlayIsOpen(props))
  const state = useContext(OverlayTriggerStateContext)
  /**
   * The panel drags, the title bar starts it.
   */
  const controls = useDragControls()
  const throwable = THROW[side]

  function dismiss() {
    if (state !== null) state.close()
    else props.onOpenChange?.(false)
  }

  function onThrowEnd(_event: unknown, info: PanInfo) {
    const distance = info.offset[throwable.axis] * throwable.sign
    const speed = info.velocity[throwable.axis] * throwable.sign
    if (distance > THROW_DISTANCE || speed > THROW_VELOCITY) dismiss()
  }

  return (
    <MotionModalOverlay
      data-slot="sheet"
      {...props}
      isDismissable={props.isDismissable ?? true}
      isExiting={exit.isExiting}
      onAnimationComplete={exit.onAnimationComplete}
      variants={scrimMotion}
      initial={false}
      animate={exit.animate}
      className={composeRenderProps(props.className, (resolved, renderProps) =>
        overlay({ ...renderProps, side, className: resolved }),
      )}
    >
      <MotionModal
        variants={slide(side)}
        transition={spring.panel}
        drag={throwable.axis}
        dragControls={controls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0, left: 0, right: 0 }}
        dragElastic={throwable.elastic}
        onDragEnd={onThrowEnd}
        className={(renderProps) => panel({ ...renderProps, side })}
      >
        <AriaDialog className="flex min-h-0 flex-1 flex-col outline-hidden">
          {/* The panel's own slide says the sheet arrived; its contents
              arriving separately says nothing further, and it is paid on every
              open. */}
          <div className="flex min-h-0 flex-1 flex-col">
            <div
              onPointerDown={(event: PointerEvent<HTMLDivElement>) => {
                controls.start(event)
              }}
              className="shrink-0 cursor-grab touch-none active:cursor-grabbing"
            >
              {side === 'bottom' && (
                <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-border" aria-hidden />
              )}
              <div className="flex items-start justify-between gap-4 p-4">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <Heading slot="title" className="text-base font-medium text-ink">
                    {title}
                  </Heading>
                  {description !== undefined && (
                    <p className="text-sm text-ink-muted">{description}</p>
                  )}
                </div>
                {onClose !== undefined && (
                  <Button variant="ghost" size="icon-sm" aria-label="Close" onPress={onClose}>
                    <X />
                  </Button>
                )}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
          </div>
        </AriaDialog>
      </MotionModal>
    </MotionModalOverlay>
  )
}
