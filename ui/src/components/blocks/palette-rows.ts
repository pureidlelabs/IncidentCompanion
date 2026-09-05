import type { Case } from '@/api/model'
import {
  paletteFuzzyMatches,
  paletteRank,
  type PaletteGroup,
  type PaletteItem,
} from '@/components/blocks/palette-results'

import { type Command } from '@/lib/shortcut-registry'
import { searchCase } from '@/lib/case-search'
import { RAIL_GROUPS, SECTIONS as RAIL_SECTIONS } from '@/components/blocks/case-sections'

/** One destination the palette can jump to. */
export interface SectionChoice {
  /** What follows `/cases/{id}/`, fragment and all where the row is a view. */
  slug: string
  title: string
}

/**
 * Every destination the rail offers, in rail order, addressed the way the rail
 * addresses it.
 */
export const SECTIONS: readonly SectionChoice[] = RAIL_GROUPS.flatMap((group) =>
  group.rows.flatMap((row) => [
    { slug: row.slug, title: RAIL_SECTIONS[row.slug]?.title ?? row.slug },
    ...(row.children ?? []).map((child) => ({
      slug: `${row.slug}#${child}`,
      title: RAIL_SECTIONS[child]?.title ?? child,
    })),
  ]),
)

/** Hits from the case itself, capped: a two-letter query matches most of it. */
const ROW_LIMIT = 8

/** The matcher both short-string groups use, named once for the two filters. */
const fuzzyMatches = paletteFuzzyMatches

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

/**
 * The list, in group order: commands, sections, then the case's own rows.
 */
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
