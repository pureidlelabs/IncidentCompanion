/**
 * A layout that exists to report under a regime says so in what the route
 * serves, and one that only talks about the regime does not.
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
