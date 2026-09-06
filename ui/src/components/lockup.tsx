import { Mark } from '@/components/ui/mark'
import { cn } from '@/lib/cn'

const MARK = { sm: 'size-10', lg: 'size-14' } as const
const NAME = { sm: 'text-[18px]', lg: 'text-[26px]' } as const

/**
 * The mark and the name, set together.
 *
 * The wordmark takes `currentColor`, so the caller decides the tone: the
 * unauthenticated screens set it muted against their field, the About dialog
 * sets it in the foreground because there it is the subject rather than a
 * watermark.
 *
 * **The name is type here, not an asset.** `wordmark-light.png` and
 * `wordmark-dark.png` copy this treatment as a raster - the README uses them,
 * and `brand.controller.ts` serves the light one at `/wordmark.png` for the
 * API reference - but type is what lets the ground theme it.
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
