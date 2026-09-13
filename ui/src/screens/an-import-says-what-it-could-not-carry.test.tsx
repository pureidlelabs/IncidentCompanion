/**
 * That an import says how many references it could not carry, and to what.
 *
 * **The silence was the defect.** The count existed on the server, reached the
 * route's answer, and was drawn by nothing -- so a case landed less connected
 * than the file implied and whoever read it next could not tell whether the
 * connection was never made or was lost on the way in. -> #51
 *
 * `openspec/specs/data-exchange/spec.md` asks for the number *and* the kind:
 * *four references could not be carried* leaves an analyst reading the whole
 * import, where *four to Assets* names what to bring across first.
 */
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ImportDataScreen } from './import-data'
import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

const carried = {
  collection: 'impact' as const,
  written: 12,
  refused: 0,
  unlinked: 0,
  unlinkedBy: {},
}

describe('an import that lost references', () => {
  it('says how many, and to what kind of thing', () => {
    render(
      <ImportDataScreen
        kase={campaignCase}
        specs={specsFixture}
        result={{ ...carried, unlinked: 3, unlinkedBy: { systems: 2, methods: 1 } }}
      />,
    )

    const said = document.body.textContent
    // **The whole phrase, not the digit.** `toContain('3')` matched a stray
    // `3` elsewhere on the screen, so the headline count -- which is the whole
    // of #51 -- was asserted by nothing.
    expect(said, 'the count of lost references is on no screen').toContain(
      '3 references could not be carried',
    )
    // **The screen's own words for a collection**, so the analyst reads the
    // name on the rail rather than the one in the schema.
    expect(said, 'the analyst is not told what the lost references pointed at').toContain(
      '2 to Assets',
    )
    expect(said).toContain('1 to Methods')
  })

  /** One is not `1 references`. */
  it('agrees with itself about one', () => {
    render(
      <ImportDataScreen
        kase={campaignCase}
        specs={specsFixture}
        result={{ ...carried, unlinked: 1, unlinkedBy: { systems: 1 } }}
      />,
    )

    expect(document.body.textContent).toContain('1 reference could not be carried')
  })

  /**
   * **The other direction, which the specification asks for by name.** An
   * import that carried everything says so: without it, silence means both
   * "nothing was lost" and "nobody looked".
   */
  it('says plainly that an import carried everything', () => {
    render(<ImportDataScreen kase={campaignCase} specs={specsFixture} result={carried} />)

    expect(document.body.textContent, 'an import that lost nothing does not say so').toMatch(
      /every reference/i,
    )
  })

  /**
   * A lost reference is not a refusal: the row landed, without the link. Told
   * apart because they ask different things of the analyst -- a refusal is a
   * row to fix and re-import, a lost reference is a thing to bring across.
   */
  it('says what it could not carry on an import that also refused rows', () => {
    render(
      <ImportDataScreen
        kase={campaignCase}
        specs={specsFixture}
        result={{ ...carried, refused: 2, unlinked: 2, unlinkedBy: { systems: 2 } }}
      />,
    )

    const said = document.body.textContent
    // The refused branch is a different alert from the success one, and the
    // reassurance the specification asks for was only on the success branch.
    expect(said, 'a partly refused import says nothing about what it carried').toContain(
      '2 references could not be carried',
    )
    // And the two are still told apart: a lost reference is not a refused row.
    expect(said).toContain('2 refused')
  })
})
