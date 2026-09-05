import { describe, expect, it } from 'vitest'

import { RAIL_GROUPS, SECTIONS as RAIL_SECTIONS } from '@/components/blocks/case-sections'
import { SECTIONS } from '@/components/blocks/palette-rows'

/**
 * Every destination the rail offers can be reached by typing its name.
 *
 * **The omnibox is the only way to reach a section by name**, since the command
 * palette became the header's box. A section the rail lists and the box cannot
 * offer is one an analyst can only reach by knowing where it is on screen.
 *
 * The attack is drift, not absence: the list was hand-maintained and held
 * sixteen of the rail's twenty-two destinations, so `methods`, `import-sentinel`,
 * all three graphs and `indicators` were unreachable by name while the list
 * claimed to hold every section with a screen.
 */
describe('the omnibox can reach the whole rail', () => {
  const offered = new Set(SECTIONS.map((one) => one.slug))

  it('has a row to type for every rail row', () => {
    const rows = RAIL_GROUPS.flatMap((group) => group.rows.map((row) => row.slug))
    expect(rows.length, 'the rail owes rows for this to say anything').toBeGreaterThan(10)
    expect(rows.filter((slug) => !offered.has(slug))).toEqual([])
  })

  it('addresses a child as a fragment of its parent, never as a section', () => {
    const children = RAIL_GROUPS.flatMap((group) =>
      group.rows.flatMap((row) => (row.children ?? []).map((child) => ({ row: row.slug, child }))),
    )
    expect(children.length, 'the rail owes a folded row for this to say anything').toBeGreaterThan(0)
    for (const { row, child } of children) {
      expect(offered.has(`${row}#${child}`), `${child} should be addressed as ${row}#${child}`).toBe(
        true,
      )
      expect(offered.has(child), `${child} must not be offered as a section of its own`).toBe(false)
    }
  })

  it('names each destination the way the rail names it', () => {
    for (const one of SECTIONS) {
      const key = one.slug.includes('#') ? (one.slug.split('#')[1] ?? '') : one.slug
      const known = RAIL_SECTIONS[key]
      if (known === undefined) continue
      expect(one.title, `${one.slug} should read as the rail reads it`).toBe(known.title)
    }
  })
})
