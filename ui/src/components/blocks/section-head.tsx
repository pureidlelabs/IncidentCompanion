import { Plus } from 'lucide-react'
import type { ReactElement, ReactNode } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

/**
 * The two things a collection section puts either side of its title: how many
 * rows it holds, and the door to one more.
 *
 * **Two parts rather than one head**, because `Section` takes them in
 * two slots - `meta` and `actions` - and a screen with a count and no add door
 * has to be able to fill one without the other.
 *
 * What is shared is the arithmetic and three look decisions nine screens were
 * each making alone: the badge's variant and size, the button's variant, size
 * and glyph, and how a count reads once a filter is on.
 */

/** What a count line is computed from. */
export interface SectionCount {
  /** Rows after the filters. Absent, or equal to `total`, reads as unnarrowed. */
  shown?: number | undefined
  /** Rows the section holds. */
  total: number
  /** Singular, in the analyst's word: `task`, `record`, `entry`. */
  noun: string
  /** The plural, where `${noun}s` is wrong. Declared, never derived. */
  plural?: string | undefined
}

/**
 * How many, in words.
 *
 * `12 tasks`, `1 record`, `3 of 12 reports`. The noun follows the total, so
 * `1 of 12 reports` says what the twelve are.
 */
export function countLine({ shown, total, noun, plural }: SectionCount): string {
  const word = total === 1 ? noun : (plural ?? `${noun}s`)
  if (shown === undefined || shown === total) return `${String(total)} ${word}`
  return `${String(shown)} of ${String(total)} ${word}`
}

/**
 * The words beside a section's title.
 *
 * A count is the usual one and `CountBadge` computes it. Take this directly
 * where the line is not a count -- `4 collected, 2 promised`.
 */
export function MetaBadge({ children }: { children: ReactNode }): ReactElement {
  return (
    <Badge data-slot="section-count" variant="outlined" size="xs">
      {children}
    </Badge>
  )
}

/** The count beside a section's title. */
export function CountBadge(count: SectionCount): ReactElement {
  return <MetaBadge>{countLine(count)}</MetaBadge>
}

/**
 * The door to one more row.
 *
 * **Visible, never behind a disclosure**: this is pressed many times a shift.
 * `outline` is for the second door where a section offers two, so the view
 * keeps one filled primary.
 */
export function AddAction({
  label,
  variant = 'default',
  onPress,
}: {
  /** What it adds, named: `Add task`, `New note`. */
  label: string
  variant?: 'default' | 'outline'
  /** Opens the section's creation dialog. */
  onPress?: (() => void) | undefined
}): ReactElement {
  return (
    <Button
      data-slot="section-add"
      variant={variant}
      size="sm"
      {...(onPress ? { onPress } : {})}
    >
      <Plus aria-hidden />
      {label}
    </Button>
  )
}
