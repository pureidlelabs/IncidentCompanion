import { useMemo, useState } from 'react'

import type { Case } from '@/api/model'
import { Dialog } from '@/components/ui/dialog'
import {
  CommandPalette,
  paletteFuzzyMatches,
  paletteRank,
  type PaletteGroup,
  type PaletteItem,
} from '@/components/blocks/command-palette'

import { COMMANDS, type Command } from '@/lib/shortcut-registry'
import { searchCase } from '@/lib/case-search'

/**
 * One box over everything: commands, sections, and the case's own rows.
 *
 * **Three sources, two matchers, no API call.** Sections and commands are
 * short, known strings and take a subsequence match, so `cs` finds Case
 * settings; the case's rows go through the same matcher the header's search
 * box runs, because two different answers to *does this case mention rclone*
 * is the drift worth more than the recall a second matcher would buy.
 *
 * **An empty query lists the commands and the sections and no rows.** "The
 * palette just opened" and "a query matched the whole case" must not look the
 * same.
 *
 * **A row whose section has no screen is dropped.** A row that highlights and
 * then navigates nowhere is worse than an absent one.
 *
 * **This is the surface, not the dialog.** In the app it opens over the case;
 * drawn here it is the panel the dialog would hold, because a story that opened
 * a modal on mount would stack un-dismissably in the docs page.
 */
export interface CasePaletteProps {
  /** What the box opens with. */
  query?: string
  /** The case the rows come from. */
  kase: Case | undefined
  /** The registry the Commands group is drawn from. */
  commands?: readonly Command[]
  /** The case's sections, as the rail lists them. */
  sections?: readonly SectionChoice[]
  /**
   * Runs when a row is committed, with the row's own id: `command:<id>`,
   * `section:<slug>` or `row:<slug>:<id>`. Omit to draw a list that commits
   * to nothing.
   */
  onAction?: ((id: string) => void) | undefined
}

/** One destination the palette can jump to. */
export interface SectionChoice {
  /** What follows `/cases/{id}/`, fragment and all where the row is a view. */
  slug: string
  title: string
}

/**
 * The sections a case opens with, in rail order.
 *
 * The three that carry no screen of their own are absent rather than listed:
 * this list is what the palette can reach, not what the product has.
 */
export const SECTIONS: readonly SectionChoice[] = [
  { slug: 'overview', title: 'Overview' },
  { slug: 'timeline', title: 'Timeline' },
  { slug: 'entities', title: 'Entities' },
  { slug: 'entities#assets', title: 'Assets' },
  { slug: 'entities#accounts', title: 'Accounts' },
  { slug: 'entities#network', title: 'Network' },
  { slug: 'entities#malware', title: 'Malware' },
  { slug: 'entities#cloud-apps', title: 'Cloud Apps' },
  { slug: 'evidence', title: 'Evidence' },
  { slug: 'impact', title: 'Impact' },
  { slug: 'actions', title: 'Actions' },
  { slug: 'notes', title: 'Case notes' },
  { slug: 'report', title: 'Report' },
  { slug: 'compliance', title: 'Compliance' },
  { slug: 'import', title: 'Import data' },
  { slug: 'archive', title: 'Case archive' },
]

/** Hits from the case itself, capped: a two-letter query matches most of it. */
const ROW_LIMIT = 8

/**
 * Whether `query`'s characters appear in `text` in order. Re-exported for
 * whatever else here matched on it before the palette moved to the block.
 */
export const fuzzyMatches = paletteFuzzyMatches

/** One row of the palette. */
export interface PaletteRow {
  id: string
  group: 'Commands' | 'Sections' | 'In this case'
  label: string
  /** The section a row was found in, drawn where a command draws its chord. */
  hint?: string
  /** The command a row runs, where it runs one. */
  command?: Command
}

/** The list, in group order: commands, sections, then the case's own rows. */
export function paletteRows(
  query: string,
  sources: {
    commands: readonly Command[]
    sections: readonly SectionChoice[]
    kase: Case | undefined
  },
): PaletteRow[] {
  const trimmed = query.trim()

  const commands: PaletteRow[] = sources.commands
    .filter((one) => trimmed === '' || fuzzyMatches(trimmed, one.title))
    .sort((left, right) => paletteRank(trimmed, left.title) - paletteRank(trimmed, right.title))
    .map((one) => ({ id: `command:${one.id}`, group: 'Commands', label: one.title, command: one }))

  const sections: PaletteRow[] = sources.sections
    .filter((one) => trimmed === '' || fuzzyMatches(trimmed, one.title))
    .sort((left, right) => paletteRank(trimmed, left.title) - paletteRank(trimmed, right.title))
    .map((one) => ({ id: `section:${one.slug}`, group: 'Sections', label: one.title }))

  // No empty-query guard: `searchCase` already answers nothing for one, and a
  // second copy of that rule here would be a second place to change it.
  const rows: PaletteRow[] = []
  for (const group of sources.kase ? searchCase(sources.kase, trimmed) : []) {
    for (const hit of group.hits) {
      if (rows.length >= ROW_LIMIT) break
      rows.push({
        // The slug, never the label: a caller splits this id into an address.
        id: `row:${group.slug}:${hit.id}`,
        group: 'In this case',
        label: hit.title,
        hint: group.label,
      })
    }
  }

  return [...commands, ...sections, ...rows]
}

/** `PaletteRow`s in group order, as the block's `PaletteGroup[]` shape. */
export function asPaletteGroups(rows: readonly PaletteRow[]): PaletteGroup[] {
  const order: PaletteRow['group'][] = ['Commands', 'Sections', 'In this case']
  const item = (row: PaletteRow): PaletteItem => ({
    id: row.id,
    label: row.label,
    ...(row.command === undefined ? {} : { chord: row.command.chords }),
    ...(row.hint === undefined ? {} : { hint: row.hint }),
  })
  return order.map((group) => ({
    label: group,
    items: rows.filter((row) => row.group === group).map(item),
  }))
}

export function CasePalette({
  query = '',
  kase,
  commands = COMMANDS,
  sections = SECTIONS,
  onAction,
}: CasePaletteProps) {
  const [text, setText] = useState(query)
  const rows = useMemo(
    () => paletteRows(text, { commands, sections, kase }),
    [text, commands, sections, kase],
  )
  const groups = useMemo(() => asPaletteGroups(rows), [rows])

  return (
    <CommandPalette
      className="mx-auto w-full max-w-xl"
      title="Command palette"
      description="Jump to a section, an entry, or run a command."
      placeholder="Jump to a section, an entry, or a command"
      emptyLabel="Nothing matches."
      query={text}
      onQueryChange={setText}
      groups={groups}
      {...(onAction ? { onAction } : {})}
    />
  )
}

/**
 * The palette as the app opens it: the panel over the case, on a scrim.
 *
 * Shut is unmounted, so the field starts from `query` each time it opens
 * rather than from whatever was last typed.
 */
export interface CommandPaletteDialogProps extends CasePaletteProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
}

export function CommandPaletteDialog({
  isOpen,
  onOpenChange,
  ...panel
}: CommandPaletteDialogProps) {
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="finder"
      dialogProps={{ 'aria-label': 'Command palette' }}
    >
      <CasePalette {...panel} />
    </Dialog>
  )
}
