import { cn } from '@/lib/cn'

/**
 * A value the case does not hold.
 *
 * **One mark, because it was being drawn three ways under three names.**
 * `entities.tsx` had `Dash`, whose own comment claimed it was "the one way
 * every table here draws it" while `data-cell` drew it twice inline and
 * `timeline.tsx` had `Absent` at a different opacity. Nothing was duplicated
 * by name, so nothing found it.
 *
 * **An em dash rather than a blank.** A blank cell reads as a column that did
 * not render; the dash says the case was asked and had nothing. That is the
 * distinction the whole register turns on -- promised against collected,
 * not-stated against nothing-came-back.
 *
 * **Not `text-ink-muted/70`.** `timeline.tsx` used the fainter one, which puts
 * the mark below the contrast the ground carries elsewhere for no reason
 * anybody recorded. One weight here; a caller wanting the value *named* passes
 * `label`.
 */
export function Absent({
  label,
  className,
}: {
  /** Prefixes the mark, where no column heading names the field. */
  label?: string | undefined
  className?: string | undefined
}) {
  return (
    <span data-slot="absent" className={cn('text-ink-muted', className)}>
      {label === undefined ? '\u2014' : `${label} \u2014`}
    </span>
  )
}
