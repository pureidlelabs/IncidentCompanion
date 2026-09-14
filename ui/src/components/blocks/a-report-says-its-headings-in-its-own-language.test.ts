/**
 * **A report's headings are said in the report's own language, on screen as
 * well as in the file.**
 *
 * The pack resolves a heading key in the language the report is produced in,
 * and the server does exactly that when it renders. The screen drew from a
 * hardcoded English map instead, so an analyst who set a report to Dutch read
 * English headings above a document that would export in Dutch. -> #513
 *
 * `openspec/specs/report` requires that everything the application supplies is
 * in the language the report is produced in, and names headings among it. The
 * scenario beneath it was scoped to the export, which is why the screen could
 * disagree with the requirement and no test went red.
 *
 * **What this does not cover:** that the query asks for the report's language
 * rather than the install's, which is `app/case/ReportContainer.tsx`'s and is
 * a different failure -- the right map, fetched for the wrong report.
 */
import { describe, expect, it } from 'vitest'

import type { ReportBlock } from '@/api/model'

import { headingIsFinal, headingOf } from './report-shape'
import { labelForKind } from './report-layouts'

const block = (over: Partial<ReportBlock>): ReportBlock =>
  ({
    id: 'b-1',
    reportId: 'r-1',
    position: 0,
    kind: 'exec_summary',
    heading: '',
    headingKey: 'heading.exec_summary',
    version: 1,
    ...over,
  }) as ReportBlock

/** What the pack answers for a Dutch report. */
const DUTCH = {
  'heading.exec_summary': 'Managementsamenvatting',
  'heading.written': 'Geschreven onderdeel',
}

describe('a heading on the report screen', () => {
  it('is the word the pack answered with, not an English one', () => {
    expect(
      headingOf(block({}), DUTCH),
      'the screen drew its own English heading over a report that exports in Dutch',
    ).toBe('Managementsamenvatting')
  })

  /**
   * **The key standing in for itself is the designed unresolved state**, which
   * `headingIsFinal` already marks. An English word invented here would be
   * indistinguishable from a resolved one, which is what made the defect
   * invisible.
   */
  it('is the key itself where the pack has not answered yet', () => {
    expect(headingOf(block({}), {})).toBe('heading.exec_summary')
    expect(headingIsFinal(block({}), {})).toBe(false)
  })

  it('is final once the pack has answered', () => {
    expect(headingIsFinal(block({}), DUTCH)).toBe(true)
  })

  /**
   * **A block's own heading is the analyst's and is never resolved.** A
   * written section they titled says what they typed, in whatever language
   * they typed it.
   */
  it('is what the analyst typed, where they typed one', () => {
    expect(headingOf(block({ heading: 'Wat er is gebeurd' }), DUTCH)).toBe('Wat er is gebeurd')
  })

  /**
   * **A block carrying no key falls to its kind, and that is the same pack.**
   * Fixing the keyed path alone would leave a second English map behind it.
   */
  it('falls to a kind label from the pack, not from a map in the bundle', () => {
    expect(labelForKind('written', DUTCH)).toBe('Geschreven onderdeel')
    expect(labelForKind('exec_summary', DUTCH)).toBe('Managementsamenvatting')
  })

  it('falls to the kind itself where the pack names neither', () => {
    expect(labelForKind('something_new', DUTCH)).toBe('something_new')
  })
})
