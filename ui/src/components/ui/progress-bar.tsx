import {
  ProgressBar as AriaProgressBar,
  type ProgressBarProps as AriaProgressBarProps,
} from 'react-aria-components'
import { motion, useSpring } from 'motion/react'
import { useEffect } from 'react'
import { tv } from 'tailwind-variants'

import { spring } from '@/lib/motion'

import { Label } from './field'
import { composeClassName } from './rac'

/** The groove. Its own geometry: a bar, not a control on the `--control-h-*` scale. */
const track = tv({
  base: 'relative w-full overflow-hidden rounded-full bg-muted',
  variants: {
    size: {
      sm: 'h-0.5',
      md: 'h-1',
      lg: 'h-2',
    },
  },
  defaultVariants: { size: 'md' },
})

/**
 * How much of the groove the value covers.
 *
 * **Indeterminate pulses rather than sweeps, on the token layer's terms.** A
 * sweep needs about a second per pass and the scale stops at
 * `--duration-base` (180ms), so drawing one means writing a timing no token
 * owns - which `tokens.test.ts` refuses. `animate-pulse` carries its own,
 * exactly as the pending button's `animate-spin` does.
 */
const fill = tv({
  base: 'absolute top-0 h-full rounded-full bg-primary forced-colors:bg-[Highlight]',
  variants: {
    isIndeterminate: {
      // No Tailwind transition: the width is a spring driven by Motion, and a
      // transition on the same property fights it and reads as stutter.
      false: 'left-0 origin-left',
      true: 'left-0 w-full bg-primary/70 motion-safe:animate-pulse',
    },
  },
})

export interface ProgressBarLook {
  /** Track thickness: 2px, 4px or 8px. `md` is the tier the app's tables draw. */
  size?: 'sm' | 'md' | 'lg'
}

export interface ProgressBarProps
  extends Omit<AriaProgressBarProps, 'children'>,
    ProgressBarLook {
  /** The name of the task, above the track. Without one, pass `aria-label`. */
  label?: string | undefined
  /**
   * Draw the track alone, with no readout above it.
   *
   * For a caller that already states the number beside the bar -- a table cell
   * showing `1/3` -- where the kit's own percentage would be the same fact
   * twice and a second line in a 32px row. The value still reaches assistive
   * technology through `aria-label`, so this hides a duplicate rather than the
   * information.
   */
  hideValue?: boolean | undefined
}

/**
 * A task running to completion.
 *
 * Determinate with `value` (and `minValue`/`maxValue`), indeterminate with
 * `isIndeterminate` when the end is not known. `formatOptions` decides how the
 * value reads. Use a `Meter` for a level that can fall as well as rise.
 */
export function ProgressBar({ label, size, hideValue = false, ...props }: ProgressBarProps) {
  return (
    <AriaProgressBar
      data-slot="progress-bar"
      {...props}
      className={composeClassName(props.className, 'flex w-full flex-col gap-1.5')}
    >
      {({ percentage, valueText, isIndeterminate }) => (
        <>
          {hideValue || (label === undefined && valueText === undefined) ? null : (
            <div className="flex items-baseline justify-between gap-3">
              {label === undefined ? <span /> : <Label>{label}</Label>}
              <span className="ml-auto text-sm text-ink-muted tabular-nums">
                {valueText}
              </span>
            </div>
          )}
          <div data-slot="progress-track" className={track({ size })}>
            {isIndeterminate ? (
              <div data-slot="progress-fill" className={fill({ isIndeterminate })} />
            ) : (
              <Fill percentage={percentage ?? 0} />
            )}
          </div>
        </>
      )}
    </AriaProgressBar>
  )
}

/**
 * The determinate fill, on `spring.fill`.
 *
 * Progress arrives in discrete jumps -- a file at a time, a page at a time --
 * and a spring carries those as one movement rather than a series of steps. `scaleX` rather than `width`, so the browser composites it instead
 * of laying the bar out again on every frame.
 */
function Fill({ percentage }: { percentage: number }) {
  const scale = useSpring(percentage / 100, spring.fill)

  useEffect(() => {
    scale.set(percentage / 100)
  }, [percentage, scale])

  return (
    <motion.div
      data-slot="progress-fill"
      className={fill({ isIndeterminate: false })}
      style={{ scaleX: scale, width: '100%' }}
    />
  )
}

export { track as progressTrackVariants, fill as progressFillVariants }
