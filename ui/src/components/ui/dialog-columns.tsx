import type { ComponentProps, ReactNode } from 'react'

import { cn } from '@/lib/cn'
import type { DialogLook } from './dialog'

/**
 * The dialog archetype a form of this many columns asks for.
 */
export function sizeForColumns(columns: number): NonNullable<DialogLook['size']> {
  if (columns >= 3) return 'workbench'
  if (columns === 2) return 'form'
  return 'compact'
}


export function DialogColumns({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-columns"
      // **No height of its own any more.** It carried `max-h-[70vh]`, which
      // is a cap rather than a size - the same rule gave a short dialog with
      // two fields and a tall one with twenty, so the frame moved whenever the
      // form did. `min-h-0` is what lets a flex child actually shrink and
      // scroll inside the height the frame handed it.
      // **No styled scrollbar.** `scrollbar-width` and `scrollbar-color` do
      // apply here, and on this platform the region's gutter is 0px: the
      // scrollbar is an overlay, drawn only while scrolling. It says nothing
      // to somebody looking at a column that is already cut.
      className={cn(
        'flex min-h-0 flex-1 items-start overflow-y-auto p-1 -m-1',
        className,
      )}
      {...props}
    />
  )
}



export function DialogColumn({
  title,
  className,
  children,
}: {
  title: string
  className?: string
  children: ReactNode
}) {
  return (
    <section
      aria-label={title}
      className={cn('flex min-w-0 flex-[1_1_0] flex-col gap-2 px-4 first:pl-0 last:pr-0', className)}
    >
      <h3 className="mb-1 border-b pb-1 text-micro uppercase tracking-micro text-ink-muted">
        {title}
      </h3>
      {children}
    </section>
  )
}
