import { AlertTriangle, CheckCircle2, InfoIcon, OctagonXIcon, XIcon } from 'lucide-react'
import { motion, type MotionProps, type PanInfo } from 'motion/react'
import { useContext, type ComponentType, type ReactNode } from 'react'
import {
  UNSTABLE_Toast as AriaToast,
  UNSTABLE_ToastRegion as AriaToastRegion,
  UNSTABLE_ToastContent as ToastContent,
  UNSTABLE_ToastQueue as ToastQueue,
  UNSTABLE_ToastStateContext as ToastStateContext,
  Text,
  composeRenderProps,
  type ToastProps as AriaToastProps,
  type ToastRegionProps as AriaToastRegionProps,
} from 'react-aria-components'
import { tv } from 'tailwind-variants'

import { spring, type MotionCollidingProps } from '@/lib/motion'

import { Button } from './button'
import { composeClassName, focusRing } from './rac'

/**
 * The four colour roles a toast is drawn in, matching `Alert`'s.
 */
export type ToastTone = 'default' | 'success' | 'warning' | 'destructive'

/** What one toast carries. The queue is typed on it, so `add` takes this shape. */
export interface ToastMessage {
  /**
   * One line, the thing that happened.
   */
  title: string
  /** A consequence the analyst cannot see from the screen. */
  description?: string | undefined
  /** `destructive` for a failure. Defaults to `default`. */
  tone?: ToastTone | undefined
  /**
   * Draw a card of the caller's own instead of the standard one, given the
   * function that dismisses it.
   */
  render?: ((close: () => void) => ReactNode) | undefined
}

/**
 * The card. `--shadow-lg`, because it floats over whatever it interrupts, and
 * a tone rail on the leading edge so the tone is legible before the words are.
 */
const card = tv({
  extend: focusRing,
  base: [
    'relative flex w-80 max-w-[calc(100vw-2rem)] items-start gap-3',
    'overflow-hidden rounded-xl bg-popover p-4 ps-5',
    'text-popover-foreground shadow-lg ring-1 ring-ink/10',
    // The rail. A pseudo-element rather than a border, so the card's own
    // border stays one weight the whole way round.
    'before:absolute before:inset-y-0 before:start-0 before:w-1 before:content-[\'\']',
  ],
  variants: {
    tone: {
      default: 'before:bg-primary',
      success: 'before:bg-action-contain',
      warning: 'before:bg-severity-medium',
      destructive: 'border-destructive/40 before:bg-destructive',
    },
  },
  defaultVariants: { tone: 'default' },
})

/**
 * A card with no chrome of its own, for a `render` that draws its own.
 */
const bare = tv({ extend: focusRing, base: 'rounded-lg' })

/** The tone chip, which is what carries the toast's colour into the body. */
const chip = tv({
  base: 'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md [&_svg]:size-3.5',
  variants: {
    tone: {
      default: 'bg-primary/12 text-primary',
      success: 'bg-action-contain/12 text-action-contain',
      warning: 'bg-severity-medium/12 text-severity-medium',
      destructive: 'bg-destructive/12 text-destructive',
    },
  },
  defaultVariants: { tone: 'default' },
})

/**
 * The mark each tone carries, so the tone survives a reader who cannot see
 * the colour and a screenshot that has lost it.
 */
const MARK = {
  default: InfoIcon,
  success: CheckCircle2,
  warning: AlertTriangle,
  destructive: OctagonXIcon,
} satisfies Record<ToastTone, ComponentType<{ className?: string }>>

const MotionToast = motion.create(AriaToast) as ComponentType<
  Omit<AriaToastProps<ToastMessage>, MotionCollidingProps> & MotionProps
>

/**
 * How far, or how fast, a toast has to be pushed aside to count as dismissed.
 */
const SWIPE_DISTANCE = 72
const SWIPE_VELOCITY = 360

export type ToastProps = Omit<AriaToastProps<ToastMessage>, MotionCollidingProps>

/**
 * One notification. Rendered by `ToastRegion`, not placed by hand.
 */
export function Toast(props: ToastProps) {
  const { title, description, tone = 'default', render } = props.toast.content
  const state = useContext(ToastStateContext)
  const Mark = MARK[tone]

  function close() {
    state?.close(props.toast.key)
  }

  function onSwipeEnd(_event: unknown, info: PanInfo) {
    if (info.offset.x > SWIPE_DISTANCE || info.velocity.x > SWIPE_VELOCITY) {
      close()
    }
  }

  return (
    <MotionToast
      data-slot="toast"
      data-tone={tone}
      // **The name, and only where the card draws its own heading.** React Aria
      // prefers `slot="title"` and falls back to `aria-label`; setting both
      // would announce the title twice.
      {...(render === undefined ? {} : { 'aria-label': title })}
      {...props}
      // `position`, not full `layout`: this element also animates `scale`, and
      // a scale distorts the box a layout animation measures -- so it
      // re-measures, re-scales, and never settles. With `drag` on top it burns
      // a core. Position-only measures the offset and leaves the size alone.
      layout="position"
      // Enters on the axis it is dismissed on. Everything else about this card
      // is rightward -- `drag="x"`, a swipe right to dismiss, and a
      // `dragElastic` that barely yields left and gives freely right -- so an
      // entry from below was the one part disagreeing with the gesture.
      //
      // Not `slide('right')`, which carries a tween and a `gone` state: this
      // card needs the spring, and it has no exit to animate. React Aria's
      // `ToastRegion` owns the unmount and there is no `AnimatePresence`.
      //
      // `spring.toast` rather than a duration, because the card can be
      // released mid-swipe: a spring settles from whatever velocity the hand
      // let go at, where a tween restarts from a standstill and reads as a
      // snag. The entry and the release are then the same motion.
      //
      // No entry `scale`. Travelling and growing at once reads as two things
      // happening to one card; the scale that survives is the press feedback
      // below, which is a different claim.
      initial={{ opacity: 0, x: 'var(--motion-travel)' }}
      animate={{ opacity: 1, x: 0 }}
      transition={spring.toast}
      whileHover={{ scale: 1.015 }}
      whileTap={{ scale: 0.995 }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={{ left: 0.02, right: 0.7, top: 0, bottom: 0 }}
      onDragEnd={onSwipeEnd}
      className={composeRenderProps(props.className, (className, renderProps) =>
        render === undefined
          ? card({ ...renderProps, tone, className })
          : bare({ ...renderProps, className }),
      )}
    >
      {render === undefined ? (
        <>
          <span aria-hidden className={chip({ tone })}>
            <Mark />
          </span>
          <ToastContent className="flex min-w-0 flex-1 flex-col gap-1">
            <Text slot="title" className="text-sm font-semibold text-ink">
              {title}
            </Text>
            {description === undefined ? null : (
              <Text slot="description" className="text-xs leading-snug text-ink-muted">
                {description}
              </Text>
            )}
          </ToastContent>
          <Button
            slot="close"
            variant="ghost"
            size="icon-xs"
            aria-label="Dismiss"
            className="-me-1 -mt-1 text-ink-muted"
          >
            <XIcon />
          </Button>
        </>
      ) : (
        // **Inside `ToastContent`, which is where `role="alert"` lives.** A
        // card rendered as a sibling of it draws identically and is never
        // announced. `display: contents` so the card's own box is the one that
        // lays out.
        <ToastContent className="contents">{render(close)}</ToastContent>
      )}
    </MotionToast>
  )
}

/**
 * A toast's appearance, with no queue and no region behind it.
 */
export function ToastCard({
  title,
  description,
  tone = 'default',
  className,
}: Omit<ToastMessage, 'render'> & { className?: string }) {
  const Mark = MARK[tone]
  return (
    <div aria-hidden data-slot="toast-card" data-tone={tone} className={card({ tone, className })}>
      <span className={chip({ tone })}>
        <Mark />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-sm font-semibold text-ink">{title}</p>
        {description === undefined ? null : (
          <p className="text-xs leading-snug text-ink-muted">{description}</p>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Dismiss"
        isDisabled
        className="-me-1 -mt-1 text-ink-muted"
      >
        <XIcon />
      </Button>
    </div>
  )
}

export type ToastRegionProps = Omit<AriaToastRegionProps<ToastMessage>, 'children'>

/**
 * The landmark every toast is rendered into. Mount one, at the app root.
 *
 * Takes the `ToastQueue` the rest of the app calls `add` on. Newest is drawn
 * nearest the corner, which is what `flex-col-reverse` buys.
 */
export function ToastRegion(props: ToastRegionProps) {
  return (
    <AriaToastRegion<ToastMessage>
      data-slot="toast-region"
      {...props}
      className={composeClassName(
        props.className,
        'fixed bottom-4 right-4 z-50 flex flex-col-reverse gap-2',
      )}
    >
      {({ toast }) => <Toast toast={toast} />}
    </AriaToastRegion>
  )
}

/**
 * The queue toasts are added to.
 */
export { ToastQueue }

export { card as toastVariants }
