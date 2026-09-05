/**
 * The count each collection section puts beside its title, read off the screen.
 *
 * **The block's own test cannot see a caller that declared the wrong noun.**
 * `countLine` is correct arithmetic over whatever it is handed, so a caller
 * passing `plural="note"` gets `3 note` and every test in the block stays
 * green - measured, by planting exactly that. The noun and its plural are
 * written out here, independently of the caller, so the two have to agree.
 */
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ReactElement } from 'react'
import { DEMO_BLOCKS, DEMO_REPORTS } from '@/components/blocks/report-shape'

import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

import { ActionsScreen } from './actions'
import { EntitiesScreen } from './entities'
import { ImpactScreen } from './impact'
import { NotesScreen } from './notes'
import { ReportIndexPane } from '@/components/blocks/report-index'
import { TimelineScreen } from './timeline'

/** The count line the section head is drawing. */
function countText(): string {
  const badge = document.querySelector('[data-slot="section-count"]')
  if (badge === null) throw new Error('the section drew no count')
  return badge.textContent.trim()
}

const SECTIONS: readonly {
  name: string
  draw: () => ReactElement
  noun: string
  plural: string
}[] = [
  { name: 'actions', draw: () => <ActionsScreen kase={campaignCase} specs={specsFixture} />, noun: 'task', plural: 'tasks' },
  { name: 'entities', draw: () => <EntitiesScreen kase={campaignCase} specs={specsFixture} />, noun: 'row', plural: 'rows' },
  { name: 'impact', draw: () => <ImpactScreen kase={campaignCase} specs={specsFixture} />, noun: 'record', plural: 'records' },
  { name: 'notes', draw: () => <NotesScreen kase={campaignCase} specs={specsFixture} />, noun: 'note', plural: 'notes' },
  { name: 'report index', draw: () => <ReportIndexPane reports={DEMO_REPORTS} blocks={DEMO_BLOCKS} />, noun: 'report', plural: 'reports' },
  { name: 'timeline', draw: () => <TimelineScreen kase={campaignCase} specs={specsFixture} />, noun: 'entry', plural: 'entries' },
]

describe.each(SECTIONS)('$name', ({ draw, noun, plural }) => {
  it('names its rows in the number it is showing them in', () => {
    render(draw())
    const line = countText()

    // `12 tasks` or `3 of 12 tasks`: the noun follows the total, which is the
    // last number on the line.
    const parsed = /^(?:(\d+) of )?(\d+) (.+)$/.exec(line)
    expect(parsed, `this is not a count line: ${line}`).not.toBeNull()
    if (parsed === null) return

    const total = Number(parsed[2])
    expect(parsed[3]).toBe(total === 1 ? noun : plural)
  })

  /** A screen that stopped drawing a count at all would pass the shape check. */
  it('draws a count at all', () => {
    render(draw())
    expect(countText()).toMatch(/\d/)
  })
})
