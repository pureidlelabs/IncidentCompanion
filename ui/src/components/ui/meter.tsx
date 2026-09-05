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
