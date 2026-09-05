import { cn } from '@/lib/cn'

/**
 * A value the case does not hold.
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
