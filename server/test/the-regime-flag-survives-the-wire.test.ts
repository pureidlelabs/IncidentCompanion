/**
 * A layout that exists to report under a regime says so in what the route
 * serves, and one that only talks about the regime does not.
 *
 * *An install that does not assess against a regulatory regime MUST NOT offer
 * the layouts that exist to report under it. An analyst offered a choice that
 * cannot apply to their case is being invited to make a mistake.*
 *
 * > #### Scenario: A layout for a regime the install does not assess
 * > - WHEN an analyst chooses a report layout
 * > - THEN the layouts belonging to that regime are not offered
 *
 * **This is the link in that chain nothing held.** The dialog withholds a
 * layout on the `nis2` flag, and `ui/src/components/blocks/report-layouts.test.ts`
 * asserts that it does -- over the shipped set, and over a layout that only
 * names the regime. What neither reaches is the step between them: the flag is
 * `requiresFeature` in the registry and `nis2` in the served document, and a
 * mapping answering `false` for everything would leave that suite green while
 * the dialog offered every regime layout to an install assessing nothing.
 *
 * **Driven over HTTP against the registry**, because the two have to be
 * independent for the comparison to say anything. Reading the payload here and
 * applying the route's own expression to it would compare that expression with
 * itself and pass on any mapping at all.
 *
 * **Enumerated from the registry**, so a layout added tomorrow is swept, and
 * both sides of the line are asserted to be occupied -- a mapping answering
 * `true` for everything withholds every layout from an install with the regime
 * off, which is the same defect facing the other way.
 *
 * **What this does not cover:** whether a caller that is not the dialog can
 * start a report from a withheld layout. Not offering it is what the
 * requirement asks; refusing it is a different claim and nothing here makes it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAdmin, type Harness, type Persona } from './app-harness.js'
import { BUILTIN_REPORT_LAYOUTS } from '../src/library/builtins/report-layouts.js'

/** What the registry declares, which is the oracle the served document is read against. */
const DECLARED = BUILTIN_REPORT_LAYOUTS.map((layout) => ({
  name: layout.name,
  regime: layout.requiresFeature === 'nis2',
}))

let harness: Harness | null = null
let admin: Persona
let served = new Map<string, boolean>()

describe.skipIf(!(await bootable()))('the regime a layout is for', () => {
  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)

    const answer = await fetch(`${harness.base}/api/report-layouts`, {
      headers: { cookie: admin.cookie },
    })
    const body = (await answer.json()) as { layouts: { name: string; nis2: boolean }[] }
    served = new Map(body.layouts.map((one) => [one.name, one.nis2]))
  }, 90_000)

  afterAll(async () => {
    await harness?.close()
  })

  it('serves layouts on both sides of the line, so neither case below is vacuous', () => {
    expect(
      DECLARED.filter((one) => one.regime).length,
      'nothing shipped belongs to a regime, so withholding regime layouts withholds nothing',
    ).toBeGreaterThan(0)
    expect(
      DECLARED.filter((one) => !one.regime).length,
      'everything shipped belongs to a regime, so a mapping answering true for all of them ' +
        'would pass every case here',
    ).toBeGreaterThan(0)
    expect(served.size, 'the route served no layout at all').toBeGreaterThan(0)
  })

  it.each(DECLARED.map((one) => [one.name, one.regime] as const))(
    '%s is served flagged exactly as the registry declares it',
    (name, regime) => {
      expect(
        served.get(name),
        regime
          ? `${name} requires the nis2 feature and is served unflagged, so an install ` +
              'assessing nothing is offered a layout it cannot file'
          : `${name} requires no feature and is served flagged, so an install with the ` +
              'regime off is refused a layout that has nothing to do with it',
      ).toBe(regime)
    },
  )
})
