import { Pause, Play } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'

import { cn } from '@/lib/cn'

import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'

/** A sweep of the whole range in this many milliseconds of wall clock. */
const SWEEP_MS = 8000

export interface TransportProps {
  /** The moment shown, in the domain's own units. */
  value: number
  min: number
  max: number
  /** The grip's increment. Defaults to a thousandth of the range. */
  step?: number | undefined
  onChange: (value: number) => void
  isPlaying: boolean
  onPlayingChange: (playing: boolean) => void
  /** Wall clock for a sweep of the whole range. A part-sweep takes its share. */
  duration?: number | undefined
  /** What the scrubber shows. Names the grip. */
  label: string
  /** Printed beside the label, when the value's number is not its reading. */
  output?: ReactNode
  /** Painted in the groove: the domain's own shape, under the grip. */
  track?: ReactNode
  /** A control after the track. */
  end?: ReactNode
  /** The sweep reached the end. Playback has already stopped. */
  onEnd?: (() => void) | undefined
  className?: string | undefined
}

/** Play and scrub a value across a range. Playing stops at `max`. */
export function Transport({
  value,
  min,
  max,
  step,
  onChange,
  isPlaying,
  onPlayingChange,
  duration = SWEEP_MS,
  label,
  output,
  track,
  end,
  onEnd,
  className,
}: TransportProps) {
  const frame = useRef(0)
  const at = useRef(value)
  const change = useRef(onChange)
  const playingChange = useRef(onPlayingChange)
  const ended = useRef(onEnd)
  // In an effect: the loop reads these from a rAF callback long after commit.
  useEffect(() => {
    at.current = value
    change.current = onChange
    playingChange.current = onPlayingChange
    ended.current = onEnd
  })

  // Elapsed time rather than a step per frame, which would play the range at
  // whatever rate the display happens to tick. The callbacks are refs so an
  // inline `onChange` cannot restart the loop with every tick it causes.
  useEffect(() => {
    if (!isPlaying) return
    const startedAt = performance.now()
    const from = at.current
    const remaining = Math.max(1, max - from)
    const sweep = duration * (remaining / Math.max(1, max - min))
    const tick = (): void => {
      const through = (performance.now() - startedAt) / sweep
      if (through >= 1) {
        playingChange.current(false)
        change.current(max)
        ended.current?.()
        return
      }
      change.current(from + remaining * through)
      frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame.current)
    }
  }, [isPlaying, min, max, duration])

  return (
    <div data-slot="transport" className={cn('flex items-center gap-2', className)}>
      <Button
        variant="ghost"
        size="icon"
        aria-pressed={isPlaying}
        aria-label={isPlaying ? 'Pause' : `Play: ${label}`}
        onPress={() => {
          // A finished sweep leaves the grip at the end, which is where the
          // next press comes from.
          if (!isPlaying && value >= max) onChange(min)
          onPlayingChange(!isPlaying)
        }}
      >
        {isPlaying ? <Pause aria-hidden /> : <Play aria-hidden />}
      </Button>

      <Slider
        className="min-w-0 flex-1"
        label={label}
        value={value}
        minValue={min}
        maxValue={max}
        step={step ?? Math.max(1, (max - min) / 1000)}
        {...(output === undefined ? {} : { output })}
        {...(track === undefined ? {} : { track })}
        onChange={(next) => {
          // Scrubbing takes the controls, or the sweep fights the pointer.
          onPlayingChange(false)
          onChange(next)
        }}
      />

      {end}
    </div>
  )
}
