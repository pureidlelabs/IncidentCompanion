/*
 * The two decisions the model owns and every painter was making again.
 *
 * A painter decides its own units -- points, DXA or two spaces -- and whether
 * the address is a run of its own or part of a string. What it is no longer
 * free to decide is the count and the collapse.
 */
import type { ListItem, Run } from './model.js'

/**
 * Each item beside the marker its position gives it.
 *
 * Numbering is the painter's rather than the source's: the count restarts when
 * the list leaves a level, and an unordered item breaks the count at its own
 * level rather than leaving a gap in it.
 */
export function listMarkers(items: readonly ListItem[]): { item: ListItem; marker: string }[] {
  const counters = new Map<number, number>()
  let previous = 0

  return items.map((item) => {
    if (item.level < previous) {
      for (const level of [...counters.keys()]) if (level > item.level) counters.delete(level)
    }
    previous = item.level

    if (!item.ordered) {
      counters.delete(item.level)
      return { item, marker: '\u2022 ' }
    }

    const next = (counters.get(item.level) ?? 0) + 1
    counters.set(item.level, next)
    return { item, marker: `${String(next)}. ` }
  })
}

/**
 * What a run's URL adds after its text, or null when it adds nothing.
 *
 * Collapsed when the address is the text, because a bare address would
 * otherwise print twice. `format` escapes the address alone: Markdown anchors
 * one of its rules at the start of the string, so handing it the brackets as
 * well would change what an address beginning with digits renders as.
 */
export function urlBeside(run: Run, format: (url: string) => string = (url) => url): string | null {
  if (!run.url || run.url === run.text) return null
  return ` (${format(run.url)})`
}
