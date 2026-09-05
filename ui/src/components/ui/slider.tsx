import type { ReactNode } from 'react'
import {
  Slider as AriaSlider,
  SliderFill,
  SliderOutput,
  SliderThumb,
  SliderTrack,
  Label,
  type SliderProps as AriaSliderProps,
} from 'react-aria-components'
import { tv } from 'tailwind-variants'

import { composeClassName } from './rac'

/** The groove. Its own geometry: a bar, not a control on the `--spacing-control-*` scale. */
const groove = tv({
  base: 'relative overflow-hidden rounded-full',
  variants: {
    orientation: {
      horizontal: 'h-1 w-full',
      vertical: 'h-full w-1',
    },
    isDisabled: {
      false: 'bg-muted',
      true: 'bg-muted forced-colors:bg-[GrayText]',
    },
  },
})

/** How much of the groove the value covers. */
const fill = tv({
  base: 'rounded-full',
  variants: {
    isDisabled: {
      false: 'bg-primary forced-colors:bg-[Highlight]',
      true: 'bg-ink-muted forced-colors:bg-[GrayText]',
    },
  },
})

/**
 * The grip, one per value.
 *
 * The ring rather than an outline, so hovering, dragging and keyboard focus all
 * thicken the same mark instead of drawing two.
 */
const grip = tv({
  base: [
    'size-3 rounded-full border border-ring bg-background ring-ring/50',
    'outline-none transition-[color,box-shadow] hover:ring-3',
    'group-orientation-horizontal:top-1/2 group-orientation-vertical:left-1/2',
  ],
  variants: {
    isFocusVisible: { true: 'ring-3' },
    isDragging: { true: 'ring-3' },
    isDisabled: { true: 'border-border forced-colors:border-[GrayText]' },
  },
})

export interface SliderProps<T> extends AriaSliderProps<T> {
  /** The name of the value, above the track. */
  label?: string | undefined
  /** One accessible name per grip. Required for a range: the label names neither end. */
  thumbLabels?: string[] | undefined
  /** Where the fill starts, when not the low end. Defaults to 0. */
  fillOffset?: number | undefined
  /**
   * What to print beside the label, in place of the formatted number.
   *
   * For a value whose *reading* is not its number - a moment on a scrubber,
   * where the domain is minutes and the answer is a clock. It replaces the
   * printed text only: a thumb announces itself from the value and
   * `formatOptions`, so both stay true of the same number rather than
   * disagreeing.
   */
  output?: ReactNode
  /**
   * Painted in the groove, in place of the bar and its fill.
   *
   * For a domain the caller has to draw -- a density strip, a waveform, a
   * coverage bar. It replaces the groove rather than sitting behind it: a
   * picture inside a filled bar is a slab of grey with a drawing in it, which
   * reads as a container rather than as a scale.
   */
  track?: ReactNode
}

/**
 * A value chosen by dragging, with the formatted number beside its label.
 *
 * A number in `value`/`defaultValue` draws one grip, an array of them draws
 * one per entry. `formatOptions` sets how the output reads;
 * `orientation="vertical"` stands the track up and hides the output.
 */
export function Slider<T extends number | number[]>({
  label,
  thumbLabels,
  fillOffset,
  output,
  track,
  ...props
}: SliderProps<T>) {
  return (
    <AriaSlider
      data-slot="slider"
      {...props}
      className={composeClassName(
        props.className,
        'flex flex-col gap-2 orientation-horizontal:w-full orientation-vertical:h-40 orientation-vertical:w-auto orientation-vertical:items-center',
      )}
    >
      {/* **`sr-only` on the vertical row, never `hidden`.** React Aria points
          every grip's `aria-labelledby` at this label element, and
          `display: none` takes its contents out of the accessibility tree - so
          a standing slider had no name at all while reading correctly in the
          markup. `sr-only` hides the row and keeps what it says. */}
      <div className="flex items-baseline justify-between gap-2 orientation-vertical:sr-only">
        {label === undefined ? null : (
          <Label className="text-sm font-medium text-ink">{label}</Label>
        )}
        <SliderOutput className="text-sm text-ink-muted tabular-nums">
          {output === undefined ? undefined : () => output}
        </SliderOutput>
      </div>
      <SliderTrack
        data-slot="slider-track"
        className="group relative flex items-center orientation-horizontal:h-4 orientation-horizontal:w-full orientation-vertical:h-full orientation-vertical:w-4 orientation-vertical:justify-center"
      >
        {({ state, ...renderProps }) => (
          <>
            {track === undefined ? (
              <div className={groove(renderProps)}>
                {/* Spread, because `exactOptionalPropertyTypes` refuses an
                    explicit `undefined` where the prop has its own default. */}
                <SliderFill
                  {...(fillOffset === undefined ? {} : { offset: fillOffset })}
                  className={fill(renderProps)}
                />
              </div>
            ) : (
              <div className="absolute inset-0 overflow-hidden">{track}</div>
            )}
            {/* **A hidden `Label` per grip, not `aria-label` on it.** React
                Aria points each grip's `aria-labelledby` at the slider's label
                element whatever else the grip carries, and `aria-labelledby`
                wins - so `thumbLabels` was dead text and both ends of a range
                announced the slider's own name twice. Same fix, same reason,
                as `time-brush.tsx`. */}
            {state.values.map((_, index) => (
              <SliderThumb key={index} index={index} className={(thumbProps) => grip(thumbProps)}>
                {thumbLabels?.[index] === undefined ? null : (
                  <Label className="sr-only">{thumbLabels[index]}</Label>
                )}
              </SliderThumb>
            ))}
          </>
        )}
      </SliderTrack>
    </AriaSlider>
  )
}
