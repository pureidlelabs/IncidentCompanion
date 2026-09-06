import type { ReactNode } from 'react'

import { Mark } from '@/components/ui/mark'

/** The glyph every unauthenticated screen's masthead carries. */
export const AUTH_MARK = <Mark className="size-12" />

/**
 * The glyph, the name of the screen and its one line under it, centred as a
 * group.
 *
 * The group centres and the form below it does not: a label centred over its
 * own control is unreadable.
 */
export function AuthMasthead({
  title,
  lede,
  mark,
}: {
  title: string
  lede?: string | undefined
  mark?: ReactNode | undefined
}) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      {mark}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {lede !== undefined && <p className="mt-1.5 text-sm text-ink-muted">{lede}</p>}
      </div>
    </div>
  )
}
