import { motion, type MotionProps } from 'motion/react'
import { useContext, useState, type ComponentType, type ReactNode } from 'react'
import {
  OverlayArrow,
  Tooltip as AriaTooltip,
  TooltipTrigger,
  TooltipTriggerStateContext,
  composeRenderProps,
  type TooltipProps as AriaTooltipProps,
  type TooltipTriggerComponentProps as AriaTooltipTriggerProps,
} from 'react-aria-components'
import { tv } from 'tailwind-variants'

import { anchored, type MotionCollidingProps } from '@/lib/motion'

/**
 * A hint on hover or focus. Wrap the trigger and this in `TooltipTrigger`.
 *
 * The trigger must be focusable. A tooltip is not announced on touch, so it
 * carries no information the control needs.
 *
 * **Animated by Motion rather than by keyframes.** A tooltip is the surface
 * most likely to be interrupted -- a pointer crossing a toolbar opens and
 * closes several within a second, and a keyframe animation cannot turn round
 * mid-flight. -> https://react-aria.adobe.com/styling#motion
 */
const tooltip = tv({
  base: [
    // The theme's own ground, not its inverse. Its border and its size are
    // what keep it from reading as a menu.
    'group inline-flex w-fit max-w-xs items-center gap-1.5 rounded-md',
    'bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md',
    'border border-border',
    // A `Kbd` inside a tooltip is lifted out of the panel's own stacking
    // context rather than being tinted by it.
    'has-data-[slot=kbd]:pr-1.5 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:rounded-sm',
  ],
})

const MotionTooltip = motion.create(AriaTooltip) as ComponentType<
  Omit<AriaTooltipProps, MotionCollidingProps> & MotionProps
>

export interface TooltipProps extends Omit<AriaTooltipProps, 'children' | MotionCollidingProps> {
  children: ReactNode
}

export function Tooltip({ children, ...props }: TooltipProps) {
  const state = useContext(TooltipTriggerStateContext)
  const isOpen = props.isOpen ?? state?.isOpen ?? props.defaultOpen ?? false

  /**
   * The same hold `Dialog` uses, spelled here rather than imported: a tooltip
   * has no scrim and no panel, so it needs the flag and not the two-element
   * arrangement that goes with it.
   */
  const [mounted, setMounted] = useState(isOpen)
  if (isOpen && !mounted) setMounted(true)

  /**
   * The shared anchored arrival, at a tooltip's settings.
   *
   * The scale is the shared `SCALE.surface`. It stood at 0.92 for no recorded
   * reason, and four percent below the class it belongs to is a number nobody
   * can read on a surface this size.
   *
   * `fast`, where the other overlays take `base` or `slow`, and a travel of
   * four tenths of the usual: a tooltip is the most repeated surface in the
   * app - a pointer crossing one toolbar opens several - and the rule for a
   * repeated motion is under `--duration-fast` or nothing.
   *
   * `?? 'top'` is React Aria's own default for a tooltip, and differs from the
   * popover's `bottom`. `anchored` therefore takes a resolved placement rather
   * than guessing one.
   */
  const { variants: states, origin } = anchored(props.placement ?? 'top', {
    distance: 'calc(var(--motion-rise) * 0.4)',
    speed: 'fast',
  })

  return (
    <MotionTooltip
      data-slot="tooltip"
      offset={8}
      {...props}
      isExiting={mounted && !isOpen}
      onAnimationComplete={(definition: unknown) => {
        if (definition === 'gone') setMounted(false)
      }}
      variants={states}
      initial={false}
      animate={isOpen ? 'shown' : 'gone'}
      style={{ transformOrigin: origin }}
      className={composeRenderProps(props.className, (resolved, renderProps) =>
        tooltip({ ...renderProps, className: resolved }),
      )}
    >
      <OverlayArrow>
        <svg
          width={8}
          height={8}
          viewBox="0 0 8 8"
          aria-hidden
          className="fill-popover stroke-border block group-placement-bottom:rotate-180 group-placement-left:-rotate-90 group-placement-right:rotate-90"
        >
          <path d="M0 0 L4 4 L8 0" />
        </svg>
      </OverlayArrow>
      {children}
    </MotionTooltip>
  )
}

/** Long enough that a pointer crossing a rail opens nothing on the way past. */
const REST_BEFORE_OPEN = 750

/** `closeDelay` 0 shuts the warm window, in which the next trigger opens instantly. */
function AppTooltipTrigger(props: AriaTooltipTriggerProps) {
  return <TooltipTrigger delay={REST_BEFORE_OPEN} closeDelay={0} {...props} />
}

export { AppTooltipTrigger as TooltipTrigger }
