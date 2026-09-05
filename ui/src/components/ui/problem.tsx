import { cn } from '@/lib/cn'
import type { ComponentProps } from 'react'

/**
 * The row a refusal is drawn in, at field scope or at form scope.
 */
export function Problem({ children, className, ...props }: ComponentProps<'p'>) {
  return (
    <p
      data-slot="problem"
      {...(children ? { role: 'alert' } : {})}
      className={cn('min-h-4 shrink-0 text-xs text-destructive', className)}
      {...props}
    >
      {children}
    </p>
  )
}
