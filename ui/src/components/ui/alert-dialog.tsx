import { AlertTriangle } from 'lucide-react'
import { motion, type MotionProps } from 'motion/react'
import type { ComponentType, ReactNode } from 'react'
import {
  Dialog as AriaDialog,
  Modal as AriaModal,
  Heading,
  ModalOverlay,
  composeRenderProps,
  type ModalOverlayProps,
} from 'react-aria-components'

import {
  overlay as overlayMotion,
  scrim as scrimMotion,
  type MotionCollidingProps,
} from '@/lib/motion'

import { Button } from './button'
import { useOverlayExit, useOverlayIsOpen } from './dialog'

import { tv } from '@/lib/cn'

/**
 * A dialog that must be answered. Not dismissable by scrim or Escape.
 *
 * **While `isPending` runs there is no way out at all**, by design: the scrim
 * and Escape are already refused, and Cancel is held with the confirm because a
 * request in flight cannot be recalled. A dialog that let itself be dismissed
 * mid-act would report a stop it did not perform.
 *
 * `onConfirm` and `onCancel` are both required: an alert with one way out is a
 * `Dialog`.
 */
const overlay = tv({
  base: [
    'fixed inset-0 isolate z-50 flex items-center justify-center bg-scrim p-4',
    'supports-backdrop-filter:backdrop-blur-xs',
  ],
})

const modal = tv({
  base: [
    'w-full max-w-xs rounded-lg bg-popover sm:max-w-sm',
    'text-ink ring-1 ring-ink/10 bg-clip-padding outline-hidden',
  ],
})

const MotionModalOverlay = motion.create(ModalOverlay) as ComponentType<
  Omit<ModalOverlayProps, MotionCollidingProps> & MotionProps
>
const MotionModal = motion.create(AriaModal) as ComponentType<
  Omit<ModalOverlayProps, MotionCollidingProps> & MotionProps
>

export interface AlertDialogLook {
  /** `destructive` colours the confirm button and the mark. */
  tone?: 'default' | 'destructive'
}

export interface AlertDialogProps
  extends Omit<ModalOverlayProps, 'children' | MotionCollidingProps>,
    AlertDialogLook {
  title: string
  /** What the action does that the title cannot say. One or two lines. */
  consequence?: ReactNode
  confirmLabel: string
  cancelLabel?: string
  /**
   * The confirm's words while the act is in flight.
   *
   * Given to the button rather than swapped into `confirmLabel`, so it reserves
   * the wider of the two and the footer does not shift as the press lands.
   */
  confirmPendingLabel?: string
  onConfirm: () => void
  onCancel: () => void
  /** Blocks the confirm button while the work is in flight. */
  isPending?: boolean
}

export function AlertDialog({
  title,
  consequence,
  confirmLabel,
  cancelLabel = 'Cancel',
  confirmPendingLabel,
  onConfirm,
  onCancel,
  tone = 'default',
  isPending,
  ...props
}: AlertDialogProps) {
  const exit = useOverlayExit(useOverlayIsOpen(props))
  return (
    <MotionModalOverlay
      data-slot="alert-dialog"
      {...props}
      isDismissable={false}
      isKeyboardDismissDisabled
      isExiting={exit.isExiting}
      onAnimationComplete={exit.onAnimationComplete}
      variants={scrimMotion}
      initial={false}
      animate={exit.animate}
      className={composeRenderProps(props.className, (resolved) =>
        overlay({ className: resolved }),
      )}
    >
      <MotionModal variants={overlayMotion} className={modal()}>
        <AriaDialog role="alertdialog" className="flex flex-col gap-4 p-4 outline-hidden">
          <div className="flex gap-3">
            {tone === 'destructive' && (
              <span
                aria-hidden
                className="mb-2 inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-destructive/10 text-destructive"
              >
                <AlertTriangle className="size-6" />
              </span>
            )}
            <div className="flex min-w-0 flex-col gap-1.5">
              <Heading slot="title" className="text-base font-medium">
                {title}
              </Heading>
              {consequence !== undefined && (
                <div className="text-sm text-balance text-ink-muted">{consequence}</div>
              )}
            </div>
          </div>
          <div className="-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-lg border-t border-border bg-muted/50 p-4 sm:flex-row sm:items-center sm:justify-end">
            {/* **Held while the act is in flight, because it cannot stop it.**
                A request already on its way to the server completes whether or
                not this dialog is still on screen, so a live Cancel offers to
                undo something it has no reach over -- and the analyst who
                presses it is left on the screen behind believing they did. The
                scrim and Escape already refuse (`isDismissable={false}`), so
                holding this closes the last route that lied. */}
            <Button
              variant="outline"
              onPress={onCancel}
              {...(isPending === undefined ? {} : { isDisabled: isPending })}
            >
              {cancelLabel}
            </Button>
            <Button
              variant={tone === 'destructive' ? 'destructive' : 'default'}
              onPress={onConfirm}
              {...(isPending === undefined ? {} : { isPending })}
              {...(confirmPendingLabel === undefined
                ? {}
                : { pendingLabel: confirmPendingLabel })}
            >
              {confirmLabel}
            </Button>
          </div>
        </AriaDialog>
      </MotionModal>
    </MotionModalOverlay>
  )
}
