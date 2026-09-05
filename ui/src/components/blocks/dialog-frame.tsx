import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { DialogBody, DialogHeader } from '@/components/ui/dialog'
import { IconTile } from '@/components/ui/icon-tile'
import { cn } from '@/lib/cn'

/**
 * What a dialog puts round its body, in the pieces a caller needs separately.
 */

/** Which ground a `DialogMark` paints. `danger` for a destructive act. */
export type DialogTone = 'plain' | 'danger'

/**
 * A glyph in a tinted disc, beside a dialog's title or a confirm's question.
 */
export function DialogMark({
  icon: Icon,
  tone = 'plain',
}: {
  icon: LucideIcon
  tone?: DialogTone | undefined
}) {
  return (
    <IconTile
      data-slot="dialog-mark"
      radius="full"
      tone={tone === 'danger' ? 'destructive' : 'muted'}
      size="lg"
    >
      <Icon />
    </IconTile>
  )
}

/**
 * A dialog's footer: what is happening on the left, what to press on the right.
 */
export function DialogActions({
  footnote,
  children,
  className,
}: {
  /** The footer's left half: a line about what the controls will do, or controls. */
  footnote?: ReactNode | undefined
  /** The footer's right half. Cancel first, the primary last. */
  children?: ReactNode | undefined
  /** Utilities for where the row sits. */
  className?: string | undefined
}) {
  return (
    <div
      data-slot="dialog-actions"
      className={cn(
        'flex shrink-0 flex-col-reverse gap-4 rounded-b-xl border-t border-border bg-muted/50 p-4',
        'sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <div data-slot="dialog-footnote" className="flex min-w-0 flex-1 items-center gap-4">
        {footnote}
      </div>
      {children !== undefined && (
        <div className="flex shrink-0 items-center gap-2">{children}</div>
      )}
    </div>
  )
}

/**
 * Head, scrolling body, footer - the whole of a dialog's inside.
 */
export function DialogFrame({
  title,
  subtitle,
  onClose,
  footnote,
  actions,
  bleed = false,
  children,
}: {
  title: string
  /** One or two lines under the title, announced with it. */
  subtitle?: string | undefined
  /** Draws the dismiss control. */
  onClose?: (() => void) | undefined
  footnote?: ReactNode | undefined
  /** Cancel first, the primary last. */
  actions?: ReactNode | undefined
  /** Renders `children` without the kit's body padding and scroller, for a
   *  body that scrolls its own panes. */
  bleed?: boolean
  children?: ReactNode | undefined
}) {
  return (
    <>
      <DialogHeader
        title={title}
        {...(subtitle === undefined ? {} : { description: subtitle })}
        {...(onClose === undefined ? {} : { onClose })}
      />
      {bleed ? children : <DialogBody>{children}</DialogBody>}
      {(footnote !== undefined || actions !== undefined) && (
        <DialogActions {...(footnote === undefined ? {} : { footnote })}>{actions}</DialogActions>
      )}
    </>
  )
}
