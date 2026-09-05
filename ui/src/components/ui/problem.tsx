import { cn } from '@/lib/cn'
import type { ComponentProps } from 'react'

/**
 * The row a refusal is drawn in, at field scope or at form scope.
 *
 * **The height is reserved whether or not there is a message.** A refusal that
 * appears from nothing pushes everything below it down, including the button
 * somebody is reaching for -- and the two places this happens are one field
 * inside a form and one form inside a dialog. One component covers both.
 *
 * **`role="alert"` only once it is filled.** An empty live region announced at
 * mount says nothing and then competes with the field's own label; a region
 * that gains its text is what a screen reader reads out.
 *
 * The caller owns the `id`, since only the field knows what its control's
 * `aria-describedby` points at.
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
