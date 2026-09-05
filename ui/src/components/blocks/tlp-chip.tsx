import { cn } from '@/lib/cn'

import { tlpTone } from './tlp'

/**
 * A report's TLP marking, in the marking's own colour on black.
 *
 * The level's own colour, drawn on `--color-tlp-ground` -- black in both themes,
 * from outside the theme blocks. The five values are FIRST.org's and are the
 * ones the exported document uses.
 *
 * Empty draws nothing -- an unmarked report is not a report marked "none".
 */
export function TlpChip({ tlp, className }: { tlp: string; className?: string }) {
  if (!tlp) return null
  return (
    <span
      data-slot="tlp-chip"
      data-testid="tlp-chip"
      className={cn(
        'inline-block rounded bg-tlp-ground px-1.5 py-0.5 text-2xs font-semibold uppercase',
        tlpTone(tlp),
        className,
      )}
    >
      {tlp}
    </span>
  )
}
