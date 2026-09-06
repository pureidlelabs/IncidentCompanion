import { TriangleAlertIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import {
  Label as AriaLabel,
  Meter as AriaMeter,
  composeRenderProps,
  type MeterProps as AriaMeterProps,
} from 'react-aria-components'
import { tv } from 'tailwind-variants'

/**
 * A quantity within a known range, over React Aria - a disk allowance, a
 * retention budget, a clock running towards a deadline.
 *
 * **A meter is not a progress bar.** It reports a level that can go down as
 * well as up; a task running to completion is `ProgressBar`, and a screen
 * reader announces the two differently.
 *
 * **React Aria drops the `label` prop and takes a `Label` child instead.**
 * `MeterProps` omits it, and the component publishes a label context that the
 * rendered `Label` fills. So `label` here is this wrapper's own prop, and turns
 * into that child. Pass `aria-label` instead when the meter sits
 * beside a heading that already names it; with neither, the meter is announced
 * with no name at all and nothing complains.
 *
 * **`valueText` is formatted by React Aria, not by the caller.** It follows
 * `formatOptions` and the locale, so a percentage and a byte count are both
 * announced correctly without the call site building a string.
 */
const meter = tv({
  base: 'flex w-full flex-col gap-1',
})

const meterTrack = tv({
  base: 'w-full overflow-hidden rounded-full bg-muted',
  variants: {
    size: {
      sm: 'h-0.5',
      md: 'h-1',
      lg: 'h-2',
    },
  },
  defaultVariants: { size: 'md' },
})

const meterFill = tv({
  base: 'h-full rounded-full transition-[width] duration-(--duration-base) ease-(--ease-out) motion-reduce:transition-none forced-colors:bg-[Highlight]',
  variants: {
    tone: {
      default: 'bg-primary',
      caution: 'bg-severity-medium',
      breach: 'bg-destructive',
    },
  },
  defaultVariants: { tone: 'default' },
})

const meterValue = tv({
  base: 'ml-auto inline-flex items-center gap-1 font-mono text-xs tabular-nums',
  variants: {
    tone: {
      default: 'text-ink-muted',
      caution: 'text-ink-muted',
      breach: 'text-destructive',
    },
  },
  defaultVariants: { tone: 'default' },
})

export interface MeterLook {
  /** Track height. */
  size?: 'sm' | 'md' | 'lg'
  /** `caution` warns, `breach` says the level is past its limit. */
  tone?: 'default' | 'caution' | 'breach'
}

export interface MeterProps extends Omit<AriaMeterProps, 'children'>, MeterLook {
  /** The visible name. Omit it only when `aria-label` names the meter instead. */
  label?: string
  /**
   * What the figure reads as, where the formatted number is not what the caller
   * means.
   *
   * **A pair, not a percentage.** `412 MiB / 1.0 GiB` is the reading somebody
   * decides on; the bar already says what share of the ceiling that is, and
   * `Intl.NumberFormat` cannot render two quantities. Announced text stays
   * React Aria's own - this replaces what is drawn, not what is read out, so
   * pass `aria-valuetext` as well where the two would disagree.
   */
  valueText?: ReactNode
}

export function Meter({ label, size, tone, valueText: override, ...props }: MeterProps) {
  return (
    <AriaMeter
      data-slot="meter"
      {...props}
      className={composeRenderProps(props.className, (className, renderProps) =>
        meter({ ...renderProps, className }),
      )}
    >
      {({ percentage, valueText }) => (
        <>
          {(label !== undefined || valueText !== undefined) && (
            <div data-slot="meter-readout" className="flex items-baseline justify-between gap-3">
              {label !== undefined && (
                <AriaLabel className="text-sm font-medium text-ink">{label}</AriaLabel>
              )}
              <span className={meterValue({ tone })}>
                {tone === 'breach' && <TriangleAlertIcon aria-hidden className="size-3" />}
                {override ?? valueText}
              </span>
            </div>
          )}
          <div data-slot="meter-track" className={meterTrack({ size })}>
            <div data-slot="meter-fill" className={meterFill({ tone })} style={{ width: `${String(percentage)}%` }} />
          </div>
        </>
      )}
    </AriaMeter>
  )
}

export { meterTrack as meterTrackVariants, meterFill as meterFillVariants }
