import type { ReactNode } from 'react'

import { AmbientField } from '@/components/ui/ambient-field'
import { TypedLine, typingSeconds } from '@/components/ui/typed-line'

/**
 * The wide pane an unauthenticated screen is drawn beside: a field, two washes
 * and whatever the screen wants to say over them.
 *
 * `hidden lg:flex`, so below 1024px the form is the whole viewport.
 */
export function AuthAtmosphere({ children }: { children?: ReactNode | undefined }) {
  return (
    <section className="relative hidden overflow-hidden lg:flex lg:flex-1 lg:flex-col lg:justify-end">
      {/* Runs past the seam and is clipped by the section, so nodes at the
          split are cut by the pane's edge and read as passing behind it.
          `inset-0` leaves a clean margin at exactly the edge, which reads as
          a canvas that happens to stop there. */}
      <AmbientField className="-right-[14%]" />
      {/* Page-scale gradients, not pane-scale: the lift lifts on a dark
          ground and shades on a light one. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_140%_55%_at_100%_44%,var(--auth-lift)_0%,transparent_78%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_140%_100%_at_100%_50%,transparent_54%,var(--auth-vignette)_100%)]"
      />
      {children !== undefined && (
        <div className="relative z-10 max-w-[44ch] p-11 text-[19px] leading-snug font-semibold tracking-tight text-balance text-ink">
          {children}
        </div>
      )}
    </section>
  )
}

/**
 * The pause between one beat finishing and the next starting, in seconds.
 *
 * Long enough to read as a breath rather than as a stall. A caller wanting a
 * slower pane passes its own.
 */
export const BEAT_GAP = 0.35

/**
 * When each line starts, in seconds from the pane appearing.
 *
 * A beat waits out the typing time of every line before it plus a gap each, so
 * the pause between two lines stays a pause when the copy is edited.
 */
export function beatDelays(lines: readonly string[], gap: number = BEAT_GAP): number[] {
  const delays: number[] = []
  let at = 0
  for (const line of lines) {
    delays.push(at)
    at += typingSeconds(line) + gap
  }
  return delays
}

/**
 * Copy that arrives one line at a time, for the wide pane to carry.
 *
 * The first line is the pane's own weight; every line after it is set normal
 * and muted, so the beats read as one thought settling rather than as a list.
 * The lines are the caller's -- this owns the timing and nothing else.
 */
export function AuthBeats({
  lines,
  gap = BEAT_GAP,
}: {
  /** What the pane says, in the order it says it. */
  lines: readonly string[]
  /** Seconds between one line finishing and the next starting. */
  gap?: number | undefined
}) {
  const delays = beatDelays(lines, gap)
  return (
    <>
      {lines.map((line, index) => (
        <TypedLine
          key={`${String(index)}:${line}`}
          text={line}
          delay={delays[index] ?? 0}
          {...(index === 0 ? {} : { className: 'block font-normal text-ink-muted' })}
        />
      ))}
    </>
  )
}
