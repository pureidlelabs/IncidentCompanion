import { Mark } from '@/components/ui/mark'
import { cn } from '@/lib/cn'

const MARK = { sm: 'size-10', lg: 'size-14' } as const
const NAME = { sm: 'text-[18px]', lg: 'text-[26px]' } as const

/**
 * The mark and the name, set together.
 */
export function Lockup({
  size = 'sm',
  className,
}: {
  size?: keyof typeof MARK
  className?: string
}) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <Mark className={cn(MARK[size], 'shrink-0')} />
      <span className={cn(NAME[size], 'font-medium tracking-tight')}>
        Incident<span className="font-normal">Companion</span>
      </span>
    </span>
  )
}
