import { ChevronDown, Plus } from 'lucide-react'
import type { ReactElement, ReactNode } from 'react'

import { Menu, MenuTrigger } from '@/components/ui/menu'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

/**
 * The two things a collection section puts either side of its title: how many
 * rows it holds, and the door to one more.
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
 */
export function countLine({ shown, total, noun, plural }: SectionCount): string {
  const word = total === 1 ? noun : (plural ?? `${noun}s`)
  if (shown === undefined || shown === total) return `${String(total)} ${word}`
  return `${String(shown)} of ${String(total)} ${word}`
}

/**
 * The words beside a section's title.
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

/**
 * The same action with a second way in: the button adds the usual thing, the
 * chevron beside it offers the rest.
 */
export function AddSplitAction({
  label,
  menuLabel,
  onPress,
  children,
}: {
  /** The default action, named: `Add asset`. */
  label: string
  /** What the chevron opens, for the analyst who cannot see it. */
  menuLabel: string
  onPress: () => void
  /** The menu's rows. */
  children: ReactNode
}): ReactElement {
  return (
    <div data-slot="section-add-split" className="flex items-center">
      <Button
        data-slot="section-add"
        size="sm"
        // `border-r-0`, because the button's border is transparent: two of
        // them meeting leaves 2px of the page showing between the fills, which
        // reads as a hard rule nobody drew.
        className="rounded-r-none border-r-0"
        onPress={onPress}
      >
        <Plus aria-hidden />
        {label}
      </Button>
      <MenuTrigger>
        <Button
          data-slot="section-add-more"
          size="sm"
          aria-label={menuLabel}
          // Inset and faint: a full-height rule at the seam reads as two
          // buttons pushed together rather than one control divided.
          className="relative rounded-l-none border-l-0 px-1.5 before:absolute before:inset-y-1.5 before:left-0 before:w-px before:bg-on-primary/15"
        >
          <ChevronDown aria-hidden />
        </Button>
        <Menu aria-label={menuLabel}>{children}</Menu>
      </MenuTrigger>
    </div>
  )
}
