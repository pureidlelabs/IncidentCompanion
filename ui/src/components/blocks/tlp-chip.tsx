import { cn } from '@/lib/cn'

import { tlpTone } from './tlp'

/**
 * A report's TLP marking, in the marking's own colour on black.
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
