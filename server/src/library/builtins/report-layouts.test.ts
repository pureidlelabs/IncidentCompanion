/**
 * **The shipped layouts, checked against the vocabulary they name.**
 *
 * A layout is the one piece of data that names block kinds without the type
 * system being able to see it: the kinds are strings in a payload. A layout
 * naming a kind this build has no resolver for produces a report that cannot
 * be exported at all - refused whole, since a customer report missing its
 * timeline reads exactly like a case that had none.
 */
import { describe, expect, it } from 'vitest'

import { BUILTIN_CASE_TEMPLATES } from './case-templates.js'
import { BUILTIN_REPORT_LAYOUTS } from './report-layouts.js'
import { EN_KEYS } from '../../report/document/packs.js'
import { WRITTEN_BLOCK } from '../../report/block-kinds.js'
import { BLOCK_KINDS } from '../../domain/entities/report.js'
import { RESOLVERS } from '../../report/document/resolve.js'

const everyBlock = BUILTIN_REPORT_LAYOUTS.flatMap((layout) =>
  layout.blocks.map((block) => ({ layout: layout.name, ...block })),
)

describe('the shipped report layouts', () => {
  /**
   * **Named rather than counted, and the count is why.** This asserted
   * `toHaveLength(7)`, which said "Python's seven are still here" only by
   * accident: it went red for a layout *added*, which is the one change that
   * cannot break the property, and would have stayed green if one of the seven
   * were renamed and another added in its place.
   */
  it('still ships the seven Python had', () => {
    const shipped = new Set(BUILTIN_REPORT_LAYOUTS.map((layout) => layout.name))

    expect(
      [
        'standard',
        'executive',
        'technical',
        'nis2-early-warning',
        'nis2-notification',
        'nis2-intermediate',
        'nis2-final',
      ].filter((name) => !shipped.has(name)),
    ).toEqual([])
  })

  /** Each layout is addressed by name, so two of a name is one unreachable. */
  it('gives every layout a name of its own', () => {
    const names = BUILTIN_REPORT_LAYOUTS.map((layout) => layout.name)

    expect(names).toHaveLength(new Set(names).size)
  })

  /**
   * **Every kind is one this build knows.** A typo here is invisible until an
   * analyst creates a report from the layout and cannot export it.
   */
  it('names only block kinds the app has', () => {
    const known = new Set<string>(BLOCK_KINDS)
    const strangers = everyBlock.filter((block) => !known.has(block.kind))
    expect(strangers).toEqual([])
  })

  /**
   * **And only kinds this build can actually resolve.** The stricter of the
   * two: a kind can be in the vocabulary and still have no resolver, which is
   * exactly the state `figure` is in - so a layout naming it would ship a
   * shape whose every report refuses to export.
   */
  it('names no generated kind this build cannot resolve', () => {
    const unresolvable = everyBlock.filter(
      (block) => block.kind !== WRITTEN_BLOCK && !(block.kind in RESOLVERS),
    )
    expect(unresolvable).toEqual([])
  })

  /** A written block with no heading key is a section with no title at all. */
  it('gives every written block a heading key', () => {
    const untitled = everyBlock.filter(
      (block) => block.kind === WRITTEN_BLOCK && !block.headingKey,
    )
    expect(untitled).toEqual([])
  })

  it('has a unique name and position for each', () => {
    const names = BUILTIN_REPORT_LAYOUTS.map((one) => one.name)
    expect(new Set(names).size).toBe(names.length)
    const positions = BUILTIN_REPORT_LAYOUTS.map((one) => one.position)
    expect(new Set(positions).size).toBe(positions.length)
  })

  /**
   * **The regulatory layouts mark what the article asks for.** `required` is
   * what `missing-sections` derives, so a NIS2 layout marking nothing would
   * report a filing as complete with its impact assessment deleted.
   */
  it('marks required sections on every regulatory layout', () => {
    const regulated = BUILTIN_REPORT_LAYOUTS.filter((one) => one.requiresFeature === 'nis2')
    expect(regulated.length).toBeGreaterThan(0)
    for (const layout of regulated) {
      expect(
        layout.blocks.some((block) => block.required === true),
        `${layout.name} marks nothing required, so nothing can be missing from it`,
      ).toBe(true)
    }
  })

  /**
   * **And the ordinary ones mark nothing required**, which is the other half:
   * an analyst shaping a customer RCA is not filing to an authority, and a
   * report nagging them to restore a section they deliberately cut is wrong.
   */
  it('marks nothing required on a layout that answers to nobody', () => {
    const ordinary = BUILTIN_REPORT_LAYOUTS.filter((one) => !one.requiresFeature)
    for (const layout of ordinary) {
      expect(layout.blocks.every((block) => !block.required)).toBe(true)
    }
  })
})

describe('the heading keys the layouts name', () => {
  /**
   * **Measured live before this existed: 11 referenced, 0 carried.**
   *
   * A key the pack has no entry for resolves to itself, so every written
   * section in every shipped layout fell back to printing its kind -- "Written"
   * -- in English, in every language. Neither half was wrong on its own: the
   * layouts named sections an analyst writes under, the pack carried headings
   * for the generated ones, and nothing ever compared the two lists.
   *
   * This is also the shape a dropped-in layout hits, where it is worse: a
   * custom key prints raw in a customer document while coverage reads 100%.
   */
  it('are all carried by the English pack, which is the floor', () => {
    const referenced = BUILTIN_REPORT_LAYOUTS.flatMap((layout) =>
      layout.blocks.map((block) => block.headingKey).filter((key): key is string => !!key),
    )
    expect(referenced.length).toBeGreaterThan(0)

    const missing = [...new Set(referenced)].filter((key) => !EN_KEYS.includes(key)).sort()
    expect(missing, 'a key no pack carries prints itself in a customer document').toEqual([])
  })
})

describe('the layout a case template starts its report from', () => {
  /**
   * **Two shipped files naming each other, and nothing compared them.** A
   * template seeds a case; `reportTemplate` is the layout that case's first
   * report is built from. Rename a layout and the template still parses, still
   * seeds, and the report it was supposed to produce is the blank one -- with
   * nothing on any screen to say which half moved.
   */
  it('is one the library ships', () => {
    const named = BUILTIN_CASE_TEMPLATES
      .map((template) => template.payload.reportTemplate)
      .filter((name): name is string => !!name)
    expect(named.length).toBeGreaterThan(0)

    const shipped = new Set(BUILTIN_REPORT_LAYOUTS.map((layout) => layout.name))
    const missing = [...new Set(named)].filter((name) => !shipped.has(name)).sort()
    expect(missing, 'a template seeds a report from a layout nothing ships').toEqual([])
  })
})

describe('the line a layout is picked by', () => {
  /**
   * **The New report card draws it, and an empty one is a card with a title
   * and nothing else.** A layout added without a summary reads as finished
   * everywhere else -- it seeds, it serves, it builds a report -- so the only
   * place the omission shows is the screen somebody chooses it from.
   */
  it('is written for every layout the app ships', () => {
    const silent = BUILTIN_REPORT_LAYOUTS
      .filter((layout) => layout.summary.trim() === '')
      .map((layout) => layout.name)
      .sort()
    expect(silent, 'a shipped layout with no line under its title').toEqual([])
  })

  /**
   * The chips beside it already name every section, so a summary that lists
   * them says the same thing twice at two sizes.
   */
  it('says who reads the report rather than what is in it', () => {
    const tooLong = BUILTIN_REPORT_LAYOUTS
      .filter((layout) => layout.summary.length > 140)
      .map((layout) => layout.name)
      .sort()
    expect(tooLong, 'a summary long enough to be listing the sections').toEqual([])
  })
})
