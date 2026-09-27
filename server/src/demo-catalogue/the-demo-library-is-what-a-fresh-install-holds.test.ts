/**
 * **The library was refused because it reads a table, and the table is wrong.**
 *
 * What a demo would hold is the built-ins and nothing else - an install nobody
 * has authored on - and those are constants in this tree. So the capture is
 * decidable against the seeder, which is what these hold it to: the same rows,
 * from the same fields, with the same verdicts the pane draws.
 *
 * The failure this is written against is a capture that reads one field name
 * for all three kinds. The Library pane draws Name, Key and Source, so it would
 * look untouched; what empties is the line under each title on the card a New
 * form offers them from, which reads as content somebody forgot to write
 * rather than as a capture taking the wrong column.
 */
import { describe, expect, it } from 'vitest'

import { BUILTIN_CASE_TEMPLATES } from '../library/builtins/case-templates.js'
import { BUILTIN_REPORT_LAYOUTS } from '../library/builtins/report-layouts.js'
import { BUILTIN_REPORT_SNIPPETS } from '../library/builtins/report-snippets.js'
import { LIBRARY_KINDS } from '../library/kinds.js'

import listings from '../../../ui/src/demo/catalogue/library.json' with { type: 'json' }

interface CapturedListing {
  slug: string
  noun: string
  newLabel: string | null
  allowBlank: boolean
  entries: {
    name: string
    label: string
    description: string
    origin: string
    canEdit: boolean
    canDelete: boolean
    canDuplicate: boolean
    disabled: boolean
  }[]
  problems: unknown[]
  startOptions: { value: string; label: string }[]
}

const held = listings as unknown as Record<string, CapturedListing>

describe('the library the demo serves', () => {
  it('holds a listing for every kind the application offers', () => {
    // A kind added to the registry and not to the capture reaches the demo as
    // a rail row leading to a refusal, which is the state this route was in.
    expect(Object.keys(held).sort()).toEqual(LIBRARY_KINDS.map((kind) => kind.slug).sort())
  })

  it('holds every built-in of every kind', () => {
    expect(held['templates']?.entries).toHaveLength(BUILTIN_CASE_TEMPLATES.length)
    expect(held['report-layouts']?.entries).toHaveLength(BUILTIN_REPORT_LAYOUTS.length)
    expect(held['report-snippets']?.entries).toHaveLength(BUILTIN_REPORT_SNIPPETS.length)
  })

  it('takes each description from the column the seeder writes it to', () => {
    // A layout's is its `summary` and a snippet's is its payload `hint`;
    // neither is called `description` on the built-in, so one field name for
    // all three captures two empty columns.
    const layout = BUILTIN_REPORT_LAYOUTS[0]
    const snippet = BUILTIN_REPORT_SNIPPETS[0]

    expect(held['report-layouts']?.entries[0]?.description).toBe(layout?.summary)
    expect(held['report-snippets']?.entries.find((one) => one.name === snippet?.name)?.description)
      .toBe(snippet?.payload.hint)
  })

  it('leaves no entry with an empty second line', () => {
    // The shape the failure above takes on the card, asserted across every
    // kind rather than only at the one entry the case above names.
    const blank = Object.values(held)
      .flatMap((listing) => listing.entries)
      .filter((entry) => entry.description.trim() === '')

    expect(blank.map((entry) => entry.name).join(', ')).toBe('')
  })

  it('offers no entry for editing or deletion', () => {
    // Every row here is a built-in, and a built-in is duplicated rather than
    // edited on an install too. A demo offering Edit would be offering a
    // control the application itself refuses.
    const writable = Object.values(held)
      .flatMap((listing) => listing.entries)
      .filter((entry) => entry.canEdit || entry.canDelete || entry.origin !== 'built-in')

    expect(writable.map((entry) => entry.name).join(', ')).toBe('')
  })

  it('offers Blank exactly where the kind allows one', () => {
    for (const kind of LIBRARY_KINDS) {
      const first = held[kind.slug]?.startOptions[0]
      expect(first?.value === '', `${kind.slug} offers Blank`).toBe(kind.allowBlank)
    }
  })
})
