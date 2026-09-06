import { readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { glob } from 'glob'
import { describe, expect, it } from 'vitest'

import type { ReportLayout } from '@/api/reportLayouts'

import {
  DEMO_LAYOUTS,
  DEMO_STAGES,
  DEMO_TLP,
  layoutsMatching,
  layoutsOffered,
  stageOf,
} from './report-layouts'

/**
 * The registry, attacked.
 *
 * Two claims are worth defeating. **Nothing may key on a layout's name** - the
 * stem is a file name and an analyst's own drop-in carries whatever they called
 * it - and **nothing may spell one into a screen**, which is the failure the
 * name rule exists to prevent one layer up.
 */

function layout(over: Partial<ReportLayout>): ReportLayout {
  return {
    name: 'dropped-in',
    label: 'Dropped in',
    summary: '',
    builtin: false,
    nis2: false,
    blocks: [],
    ...over,
  }
}

describe('the stage a layout already is', () => {
  /**
   * The flag decides whether there is a stage at all, and it is served. A
   * drop-in called *BSI Meldung* is a filing; one called *NIS2 explainer* is
   * not, and neither name is readable.
   */
  it('reads the layout flag rather than its name or label', () => {
    const named = layout({ name: 'nis2-final', label: 'NIS2 final report', nis2: false })
    expect(stageOf(named, true)).toBe('')
  })

  /**
   * **The layout declares its stage; nothing derives one from the label.** The
   * label is the analyst's own text on a dropped-in file, so a stage read off
   * it would put whatever they typed into a vocabulary of four.
   */
  it('takes the declared stage and invents none', () => {
    const flagged = layout({ name: 'bsi-meldung', label: 'BSI Meldung', nis2: true })
    expect(stageOf(flagged, true)).toBe('')
    expect(stageOf(layout({ nis2: true, stage: 'NIS2 final' }), true)).toBe('NIS2 final')
  })

  /** An install with NIS2 off has no stage to offer, whatever is picked. */
  it('needs the install as well as the layout', () => {
    expect(stageOf(layout({ nis2: true, stage: 'NIS2 final' }), false)).toBe('')
  })

  /** Nothing picked yet is not a filing. */
  it('asks nothing before a layout is chosen', () => {
    expect(stageOf(undefined, true)).toBe('')
  })
})

describe('what an install offers', () => {
  it('withholds a layout whose feature is off', () => {
    const offered = layoutsOffered(DEMO_LAYOUTS, false)
    expect(offered.some((one) => one.nis2)).toBe(false)
    expect(offered.length).toBeLessThan(DEMO_LAYOUTS.length)
  })

  /**
   * The half a name-matching filter would get wrong: a layout that talks about
   * NIS2 and does not belong to the regime is offered with the feature off.
   */
  it('keeps a layout that only names the regime', () => {
    const talks = layout({ name: 'nis2-explainer', label: 'NIS2 explainer', nis2: false })
    expect(layoutsOffered([talks], false).map((one) => one.name)).toEqual(['nis2-explainer'])
  })

  it('offers everything once the feature is on', () => {
    expect(layoutsOffered(DEMO_LAYOUTS, true)).toHaveLength(DEMO_LAYOUTS.length)
  })
})

describe('searching the shapes', () => {
  /**
   * The chips are the half worth having: an analyst knows the word *timeline*
   * and not which of seven documents carries one.
   */
  it('matches a section nobody named in the title or the summary', () => {
    const hits = layoutsMatching(DEMO_LAYOUTS, 'timeline')
    expect(hits.length).toBeGreaterThan(0)
    for (const hit of hits) {
      expect(`${hit.label} ${hit.summary}`.toLowerCase()).not.toContain('timeline')
      expect(hit.blocks.some((block) => block.label.toLowerCase().includes('timeline'))).toBe(true)
    }
  })

  /** The stem is a key, not a name anyone chose, so it is not searched. */
  it('does not answer to the layout file stem', () => {
    expect(layoutsMatching([layout({ name: 'standard', label: 'Customer RCA' })], 'standard')).toEqual(
      [],
    )
  })

  it('ignores case and surrounding space', () => {
    expect(layoutsMatching(DEMO_LAYOUTS, '  TIMELINE ')).toEqual(
      layoutsMatching(DEMO_LAYOUTS, 'timeline'),
    )
  })

  /** An empty search narrows nothing rather than matching nothing. */
  it('hands back every layout for an empty search', () => {
    expect(layoutsMatching(DEMO_LAYOUTS, '   ')).toHaveLength(DEMO_LAYOUTS.length)
  })
})

describe('the shapes themselves', () => {
  /**
   * Blank is last and carries no chips, so the grid reads as "one of these
   * shapes, or nothing" rather than as a shape with a missing list.
   */
  it('puts the shape that makes nothing last', () => {
    const last = DEMO_LAYOUTS.at(-1)
    expect(last?.blocks).toEqual([])
    expect(DEMO_LAYOUTS.filter((one) => one.blocks.length === 0)).toHaveLength(1)
  })

  /** A chip says what the section is called, never the kind's wire spelling. */
  it('resolves every chip to words', () => {
    for (const one of DEMO_LAYOUTS) {
      for (const block of one.blocks) {
        expect(block.label).not.toBe('')
        expect(block.label).not.toBe(block.kind)
        expect(block.label).not.toMatch(/^heading\./)
      }
    }
  })

  /** The running order is the file's order, and the export prints it. */
  it('numbers the blocks in the order the layout lists them', () => {
    for (const one of DEMO_LAYOUTS) {
      expect(one.blocks.map((block) => block.position)).toEqual(
        one.blocks.map((_block, at) => at),
      )
    }
  })

  /**
   * Both vocabularies are what a document stores, and "nothing chosen" is not
   * one of them - a report with no stage stores nothing, so an empty member
   * here would be a value every consumer had to special-case.
   */
  it('carries no empty member in either vocabulary', () => {
    expect(DEMO_STAGES).not.toContain('')
    expect(DEMO_TLP).not.toContain('')
  })

  /**
   * TLP 2.0, and deliberately not STIX's markings - that vocabulary encodes
   * TLP 1.0, so reaching for it ships a report marked `TLP:WHITE`.
   */
  it('carries the 2.0 markings rather than the STIX ones', () => {
    expect(DEMO_TLP).toContain('TLP:AMBER+STRICT')
    expect(DEMO_TLP).not.toContain('TLP:WHITE')
  })
})

const HERE = resolve(dirname(fileURLToPath(import.meta.url)))
/**
 * `ui/src`, two levels above `components/blocks`.
 *
 * The report family spans blocks and screens -- `report-new` is a dialog block
 * rather than a screen -- so the sweep below reads both rather than the one
 * directory this file happens to sit in.
 */
const SRC = resolve(HERE, '..', '..')

/** Prose may name what the code may not - this file's own docstrings do. */
function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

describe('nothing enumerates the registry', () => {
  /**
   * **A layout, a stage and a marking are all drop-in vocabulary**, so a
   * screen or a block spelling one means an analyst's own file needs a code
   * change to work.
   *
   * Reads every screen and block of the report family, and every story, but
   * this module, which is the registry standing in for the route, and the
   * tests, which name what they attack. Comments are stripped: a docstring
   * explaining the rule is not the code breaking it. **A short label is
   * matched as a substring**, so a story exported as `Blank` reads as the
   * layout called Blank - a false positive, and cheaper to rename around than
   * to narrow the rule into missing the real thing.
   */
  it('spells no layout, stage or marking into a screen or a block', () => {
    const forbidden = [
      ...DEMO_LAYOUTS.map((one) => one.name),
      ...DEMO_LAYOUTS.map((one) => one.label),
      ...DEMO_STAGES,
      ...DEMO_TLP,
    ]
    const files = [
      ...glob.sync('screens/report-*.{ts,tsx}', { cwd: SRC, absolute: true }),
      ...glob.sync('components/blocks/report-*.{ts,tsx}', { cwd: SRC, absolute: true }),
    ].filter((path) => !path.endsWith('report-layouts.ts') && !path.includes('.test.'))

    const wrong: string[] = []
    for (const file of files) {
      const text = withoutComments(readFileSync(file, 'utf8'))
      for (const word of forbidden) {
        if (text.includes(word)) wrong.push(`${relative(SRC, file)} -> ${word}`)
      }
    }
    expect(wrong.sort()).toEqual([])
  })
})
