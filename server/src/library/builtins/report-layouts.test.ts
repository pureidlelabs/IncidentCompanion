/**
 * **The shipped layouts, checked against the vocabulary they name.**
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
   * **Named rather than counted, and the count is why.**
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
   * **The regulatory layouts mark what the article asks for.**
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
   * **Two shipped files naming each other, and nothing compared them.**
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
   * **The New report card draws it, and an empty one is a card with a title and
   * nothing else.**
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
