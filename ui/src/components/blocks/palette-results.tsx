import type { ComponentProps } from 'react'

import { Badge } from '@/components/ui/badge'
import { ChordKeys, type Chord } from '@/components/blocks/chord-keys'
import { ListBox, ListBoxItem, ListBoxSection } from '@/components/ui/list-box'

/**
 * One row the palette can show: a chord where the row runs a command, a hint
 * chip where it names where a hit was found, or neither.
 */
export interface PaletteItem {
  id: string
  label: string
  chord?: readonly Chord[]
  hint?: string
}

/** One heading in the list, in the order it renders. An empty group is dropped. */
export interface PaletteGroup {
  label: string
  items: readonly PaletteItem[]
}


export interface PaletteResultsProps {
  groups: readonly PaletteGroup[]
  /** Drawn in place of the list when every group is empty. */
  emptyLabel: string
  onAction?: ((id: string) => void) | undefined
}

/** The grouped rows on their own, for a surface that owns its own field. */
export function PaletteResults({ groups, emptyLabel, onAction: onRowAction }: PaletteResultsProps) {
  const populated = groups.filter((one) => one.items.length > 0)
  const runAction: NonNullable<ComponentProps<typeof ListBox>['onAction']> = (key) => {
    onRowAction?.(String(key))
  }

  return (
    <>
      {populated.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-ink-muted">{emptyLabel}</p>
      ) : (
        // A `ListBox` rather than a `Menu`: the rows are a selection the
        // arrow keys walk while the caret stays in the box, and a menu item
        // is a `div` whose `onPress` never fires from the keyboard.
        <ListBox
          aria-label="Results"
          selectionMode="single"
          // The panel is already a frame; a bordered list inside it draws a
          // second one, with its own rounded corners cutting across the
          // panel's and the scrollbar running down the gap between them.
          variant="plain"
          className="min-h-0 flex-1 overflow-y-auto p-3 [scrollbar-gutter:stable]"
          {...(onRowAction === undefined ? {} : { onAction: runAction })}
        >
          {populated.map((group) => (
            <ListBoxSection key={group.label} title={group.label}>
              {group.items.map((item) => (
                <ListBoxItem key={item.id} id={item.id} textValue={item.label}>
                  <span className="flex w-full min-w-0 items-center justify-between gap-3">
                    <span className="min-w-0 truncate">{item.label}</span>
                    {/* `text-current`, for `report-editor`'s reason: a
                          selected row's ground is `bg-primary`, and the muted
                          ink on it is unreadable. */}
                    <span className="shrink-0 text-xs text-current opacity-75">
                      {item.chord !== undefined ? (
                        <ChordKeys chords={item.chord} />
                      ) : item.hint === undefined ? null : (
                        <Badge variant="soft" size="xs">
                          {item.hint}
                        </Badge>
                      )}
                    </span>
                  </span>
                </ListBoxItem>
              ))}
            </ListBoxSection>
          ))}
        </ListBox>
      )}
    </>
  )
}

/**
 * Ranks an exact prefix above a substring above a scattered subsequence, so a
 * short query puts an exact match ahead of one it only touches in passing.
 */
export function paletteRank(query: string, text: string): number {
  const needle = query.toLowerCase().trim()
  const haystack = text.toLowerCase()
  if (haystack.startsWith(needle)) return 0
  if (haystack.includes(needle)) return 1
  return 2
}

/**
 * Whether `query`'s characters appear in `text` in order.
 *
 * Subsequence rather than substring, so `csett` finds "Case settings" and
 * `tl` finds "Timeline" - the acronym typing a keyboard-driven user does. It
 * over-matches on long strings, so a caller with a large corpus to search
 * wants a different matcher for that source.
 */
export function paletteFuzzyMatches(query: string, text: string): boolean {
  const needle = query.toLowerCase().replace(/\s+/g, '')
  const haystack = text.toLowerCase()
  let at = 0
  for (const character of needle) {
    at = haystack.indexOf(character, at)
    if (at < 0) return false
    at += 1
  }
  return true
}
