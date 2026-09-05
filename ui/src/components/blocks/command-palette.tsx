import type { ComponentProps } from 'react'

import { Badge } from '@/components/ui/badge'
import { ChordKeys, type Chord } from '@/components/blocks/chord-keys'
import { Frame, FrameDescription, FrameHeader, FramePanel, FrameTitle } from '@/components/ui/frame'
import { ListBox, ListBoxItem, ListBoxSection } from '@/components/ui/list-box'
import { SearchField } from '@/components/ui/search-field'

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

export interface CommandPaletteProps {
  title: string
  description: string
  query: string
  onQueryChange: (query: string) => void
  /** What the list shows for `query`. Filtering and ranking are the caller's:
   *  a case's own rows want a different matcher than a short, known label. */
  groups: readonly PaletteGroup[]
  placeholder: string
  emptyLabel: string
  /** Runs when a row is committed. Omit to draw the list with nothing wired
   *  to a destination. */
  onAction?: (id: string) => void
  className?: string
}

/**
 * A box over a caller's own commands, destinations and search hits: a search
 * field, grouped results, and a chord or a hint chip at each row's end.
 *
 * **This is the surface, not the dialog.** A caller wraps it in whatever
 * opens it over the rest of the app; drawn on its own it is the panel that
 * shell would hold.
 */
export function CommandPalette({
  title,
  description,
  query,
  onQueryChange,
  groups,
  placeholder,
  emptyLabel,
  onAction: onRowAction,
  className,
}: CommandPaletteProps) {
  return (
    <Frame className={className}>
      <FrameHeader>
        <FrameTitle>{title}</FrameTitle>
        <FrameDescription>{description}</FrameDescription>
      </FrameHeader>
      <FramePanel className="flex flex-col gap-0 p-0">
        <div className="border-b border-border p-3">
          <SearchField
            aria-label={placeholder}
            placeholder={placeholder}
            value={query}
            onChange={onQueryChange}
            className="max-w-none"
          />
        </div>

        <PaletteResults
          groups={groups}
          emptyLabel={emptyLabel}
          {...(onRowAction === undefined ? {} : { onAction: onRowAction })}
        />
      </FramePanel>
    </Frame>
  )
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
          className="max-h-96 overflow-y-auto p-2 [scrollbar-gutter:stable]"
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
