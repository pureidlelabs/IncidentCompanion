import { cn } from '@/lib/cn'

/**
 * A value the case does not hold.
 *
 * **One mark, because nothing finds three of them.** A dash drawn inline in
 * one file, under another name in a second and at a different opacity in a
 * third is duplicated by nobody's name, so no rule sees it.
 *
 * **An em dash rather than a blank.** A blank cell reads as a column that did
 * not render; the dash says the case was asked and had nothing. That is the
 * distinction the whole register turns on -- promised against collected,
 * not-stated against nothing-came-back.
 *
 * **Not `text-ink-muted/70`.** The fainter one puts the mark below the
 * contrast the ground carries elsewhere. One weight here; a caller wanting the
 * value *named* passes `label`.
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
