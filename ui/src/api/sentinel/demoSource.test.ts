import { describe, expect, it, vi } from 'vitest'

import { demoImporterAsked, demoSourceFromUrl } from './demoSource'

import type * as SentinelFixture from '@/fixtures/sentinel-source'
import type { IncidentFilter } from './source'

/**
 * The fixture answers with its incidents, and is fetched once per address.
 *
 * The two claims that turn on a *first* load have files of their own, because
 * a mock factory is asked once per file: `a-fixture-is-not-fetched-unasked`
 * and `a-refused-chunk-is-not-kept`. -> #988
 */
const loaded = vi.hoisted(() => ({ times: 0 }))

vi.mock('@/fixtures/sentinel-source', async (importOriginal) => {
  loaded.times += 1
  return await importOriginal<typeof SentinelFixture>()
})

const NO_DIALS: IncidentFilter = {
  severity: 'Any',
  status: 'Any',
  title: '',
  number: '',
  sinceHours: 0,
}

describe('the demo importer', () => {
  it('answers with the fixture incidents when the address names it', async () => {
    expect(demoImporterAsked('?importer=demo')).toBe(true)
    const source = await demoSourceFromUrl('?importer=demo')
    expect(source).not.toBeNull()

    const session = await source!.connect()
    const { sources } = await source!.listSources(session)
    const page = await source!.listIncidents(session, sources[0]!, NO_DIALS, null)

    expect(page.incidents.map((one) => one.key)).toEqual(['SEN-1001', 'SEN-1002'])
  })

  /** One source per address, so a caller holding it across renders is stable. */
  it('answers the same source for the same address', async () => {
    // Warmed here rather than left to whichever case ran before: the claim is
    // that a *second* call for one address fetches nothing, and reading the
    // count from a cold module makes the first fetch look like the second.
    await demoSourceFromUrl('?importer=demo')

    const before = loaded.times
    const first = await demoSourceFromUrl('?importer=demo')
    const second = await demoSourceFromUrl('?importer=demo')
    expect(second).toBe(first)
    expect(loaded.times, 'the fixture was fetched twice for one address').toBe(before)
  })
})
