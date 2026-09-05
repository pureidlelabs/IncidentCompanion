import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Label, Slider, SliderThumb, SliderTrack } from 'react-aria-components'
import { tv } from 'tailwind-variants'

import { clockOf, dayShortOf } from '@/lib/case-time'
import { cn } from '@/lib/cn'
import {
  binsWithin,
  brushWindow,
  brushStep,
  densityOf,
  sweepWindow,
  tickHeight,
  type TimeWindow,
} from '@/lib/time-window'

/**
 * The grip, one per end of the window.
 */
const grip = tv({
  // **`top-1/2` is load-bearing, and its absence was the reported defect.**
  // React Aria positions a thumb on the *value* axis only - `left` for a
  // horizontal slider - and applies `translate(-50%, -50%)` on both. With no
  // `top`, the grip's static top is 0 and the transform then pulls it up by
  // half its height, standing both markers proud of the band with the
  // right-hand one reading as floating under the row above.
  // **`items-start`, because the density is not centred either.** The band is
  // bottom-aligned with a floor under it, so a bar's baseline sits above the
  // track's bottom and the tallest bar reaches the track's top. A mark centred
  // on the *track* therefore hangs below every bar and stops short of the
  // tallest. The mark is aligned to the band's own box instead, and its
  // height carries the same floor the band's padding does.
  base: 'top-1/2 z-10 flex h-7 w-6 items-start justify-center rounded-sm bg-transparent outline-none',
  variants: {
    isFocusVisible: { true: 'outline-2 outline-offset-1 outline-ring/60' },
    isDisabled: { true: 'cursor-not-allowed' },
  },
})

/**
 * One tick of the density plot.
 */
const tick = tv({
  base: 'min-w-px flex-1 rounded-xs',
  variants: {
    filled: { true: '', false: 'bg-transparent' },
    within: { true: '', false: '' },
    isDisabled: { true: '' },
  },
  compoundVariants: [
    { filled: true, within: true, isDisabled: false, class: 'bg-primary/70' },
    { filled: true, within: false, isDisabled: false, class: 'bg-ink-muted/35' },
    { filled: true, isDisabled: true, class: 'bg-ink-muted/30' },
  ],
})

export interface TimeBrushProps {
  /**
   * Every stamp in the case, in epoch milliseconds. Drawn as the density
   * behind the track; unparseable stamps are the caller's to drop.
   */
  times: readonly number[]
  /** The track's extent, first stamp to last. `lib/time-window`'s `spanOf`. */
  span: TimeWindow
  /** `null` is the whole span, with both grips at the ends. */
  value: TimeWindow | null
  /** Fired when a drag ends or a key lands, never on every pixel of a drag. */
  onChange: (next: TimeWindow | null) => void
  /** Names the control. Defaults to `Time window`. */
  label?: string | undefined
  isDisabled?: boolean | undefined
  className?: string | undefined
}

/** `Sat 25 Jul 06:31`, UTC, in the face a stamp gets copied out of. */
function stamp(at: number): string {
  const iso = new Date(at).toISOString()
  return `${dayShortOf(iso)} ${clockOf(iso)}`
}

/**
 * The case's shape, and a two-handled window over it.
 */
export function TimeBrush({
  times,
  span,
  value,
  onChange,
  label = 'Time window',
  isDisabled = false,
  className,
}: TimeBrushProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [bins, setBins] = useState(48)

  // **Bins follow the rendered width.** A constant bin count draws a different
  // histogram at every pane size, and the one it was tuned at is the only one
  // it is right for. One tick per 3px is the finest that still leaves a gap.
  useLayoutEffect(() => {
    const node = trackRef.current
    if (!node) return
    const measure = () => {
      setBins(Math.max(12, Math.round(node.getBoundingClientRect().width / 3)))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => {
      observer.disconnect()
    }
  }, [])

  const counts = useMemo(() => densityOf(times, span, bins), [times, span, bins])
  const tallest = useMemo(() => Math.max(0, ...counts), [counts])
  const covered = useMemo(() => binsWithin(span, bins, value), [span, bins, value])

  /**
   * Where the grips are *while the pointer is down*.
   */
  const [dragging, setDragging] = useState<[number, number] | null>(null)
  const [sweep, setSweep] = useState<{ from: number; to: number } | null>(null)

  const step = brushStep(span)
  const at: [number, number] = dragging ?? [value?.from ?? span.from, value?.to ?? span.to]
  const brushed = value !== null
  const width = span.to - span.from
  const percent = (of: number) => ((of - span.from) / (width || 1)) * 100

  const fractionAt = (clientX: number): number => {
    const box = trackRef.current?.getBoundingClientRect()
    if (!box || box.width === 0) return 0
    return Math.min(1, Math.max(0, (clientX - box.left) / box.width))
  }

  return (
    <Slider
      data-slot="time-brush"
      value={at}
      minValue={span.from}
      maxValue={span.to}
      step={step}
      isDisabled={isDisabled}
      onChange={(next) => {
        setDragging([next[0], next[1]])
      }}
      onChangeEnd={(next) => {
        const [from, to] = [next[0], next[1]]
        setDragging(null)
        onChange(brushWindow(span, from, to))
      }}
      // `--brush-floor` is the gap the density band keeps under its bars, and
      // it is declared here so the band and the grip read one value. They were
      // two: the band padded by it and the grip did not, so the mark hung 2px
      // below every bar and stopped 2px short of the tallest.
      className={cn('flex min-w-0 flex-1 items-center gap-3 [--brush-floor:0.25rem]', className)}
    >
      {/* **A real `Label`, hidden, rather than `aria-label` on the group.**
          React Aria points each grip's `aria-labelledby` at the slider's label
          element, and with no label to point at it lands on the group itself -
          so both grips announce the two stamps run together and `Window
          start` is dead text. The same holds one level down, so each grip
          carries its own. */}
      <Label className="sr-only">{label}</Label>

      <span className="shrink-0 font-mono text-2xs tabular-nums text-ink-muted">
        {stamp(at[0])}
      </span>

      {/*
        **The sweep is captured one element above the track**, because React
        Aria binds the track's own press handler on the target: a press meant
        to sweep would first jump the nearest grip to it, and the sweep would
        then start from a handle that had just moved. A press that lands on a
        grip is left alone, so dragging and the keyboard are untouched.
      */}
      <div
        className="min-w-0 flex-1"
        onPointerDownCapture={(event) => {
          if (isDisabled || event.button !== 0) return
          // Our own attribute, not `[role="slider"]`: React Aria puts the role
          // on an inner `<input type="range">`, so a role selector matches the
          // input and misses the press that landed on the grip around it.
          if ((event.target as Element).closest('[data-slot="time-brush-thumb"]')) return
          event.preventDefault()
          event.stopPropagation()
          event.currentTarget.setPointerCapture(event.pointerId)
          const from = fractionAt(event.clientX)
          setSweep({ from, to: from })
        }}
        onPointerMove={(event) => {
          if (!sweep) return
          setSweep({ from: sweep.from, to: fractionAt(event.clientX) })
        }}
        onPointerUp={(event) => {
          if (!sweep) return
          const to = fractionAt(event.clientX)
          setSweep(null)
          onChange(sweepWindow(span, sweep.from, to))
        }}
        onPointerCancel={() => {
          setSweep(null)
        }}
      >
        <SliderTrack
          ref={trackRef}
          data-slot="time-brush-track"
          className={cn(
            'relative h-7 w-full rounded-sm bg-muted/40',
            isDisabled ? 'cursor-not-allowed opacity-60' : 'cursor-crosshair',
          )}
        >
          {/* The case's shape, under the control rather than beside it.
              `aria-hidden` because the density is a picture of the same rows
              the list below states in words. */}
          <span
            aria-hidden
            data-slot="time-brush-density"
            className="pointer-events-none absolute inset-x-0 bottom-0 flex h-full items-end gap-px px-1 pb-(--brush-floor)"
          >
            {counts.map((count, index) => (
              <span
                key={index}
                className={tick({
                  filled: count > 0,
                  within: covered[index] ?? true,
                  isDisabled,
                })}
                style={{ height: `${String(Math.round(tickHeight(count, tallest) * 100))}%` }}
              />
            ))}
          </span>

          {sweep && Math.abs(sweep.to - sweep.from) > 0 && (
            <span
              aria-hidden
              data-slot="time-brush-sweeping"
              className="pointer-events-none absolute inset-y-0 bg-primary/20"
              style={{
                left: `${String(Math.min(sweep.from, sweep.to) * 100)}%`,
                width: `${String(Math.abs(sweep.to - sweep.from) * 100)}%`,
              }}
            />
          )}

          {/* The window itself, drawn from the two values rather than from
              `SliderFill`, which fills from one end of the track. */}
          <span
            aria-hidden
            data-slot="time-brush-window"
            className={cn(
              'pointer-events-none absolute inset-y-0 rounded-sm',
              brushed ? 'bg-primary/15 ring-1 ring-inset ring-primary/40' : 'bg-transparent',
            )}
            style={{
              left: `${String(percent(at[0]))}%`,
              width: `${String(Math.max(0, percent(at[1]) - percent(at[0])))}%`,
            }}
          />

          {([0, 1] as const).map((index) => (
            <SliderThumb
              key={index}
              index={index}
              data-slot="time-brush-thumb"
              className={(props) => grip(props)}
            >
              <Label className="sr-only">{index === 0 ? 'Window start' : 'Window end'}</Label>
              <span
                aria-hidden
                className={cn(
                  'h-[calc(100%-var(--brush-floor))] w-1 rounded-full shadow-sm ring-2 ring-background',
                  isDisabled ? 'bg-ink-muted' : 'bg-primary',
                )}
              />
            </SliderThumb>
          ))}
        </SliderTrack>
      </div>

      <span className="shrink-0 font-mono text-2xs tabular-nums text-ink-muted">
        {stamp(at[1])}
      </span>
    </Slider>
  )
}
