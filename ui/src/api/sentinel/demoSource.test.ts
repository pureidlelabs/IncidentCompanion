import { describe, expect, it, vi } from 'vitest'

import { demoImporterAsked, demoSourceFromUrl } from './demoSource'

import type * as SentinelFixture from '@/fixtures/sentinel-source'
import type { IncidentFilter } from './source'

/**
 * The fixture module is reached only by the address that asks for it, and
 * still answers with its incidents when it is.
 *
 * The import *graph* is `fixtures-stay-out-of-the-bundle.rule.test.ts`'s to
 * judge; this counts loads. The count moves in the mock factory, which runs
 * once per module load, so naming the module does not raise it.
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
  /**
   * **First, and the order is the assertion.** A module loads once per file,
   * so a case that reaches the fixture before this one leaves the count at 1
   * whatever the ordinary path did.
   */
  it('is not asked for by an address that did not name it', async () => {
    expect(demoImporterAsked('?section=timeline')).toBe(false)
    await expect(demoSourceFromUrl('?section=timeline')).resolves.toBeNull()
    expect(loaded.times, 'the fixture was loaded by a path that does not use it').toBe(0)
  })

  it('answers with the fixture incidents when the address names it', async () => {
    expect(demoImporterAsked('?importer=demo')).toBe(true)
    const source = await demoSourceFromUrl('?importer=demo')
    expect(source).not.toBeNull()

    const session = await source!.connect()
    const { sources } = await source!.listSources(session)
    const page = await source!.listIncidents(session, sources[0]!, NO_DIALS, null)

    expect(page.incidents.map((one) => one.key)).toEqual(['SEN-1001', 'SEN-1002'])
    expect(loaded.times).toBe(1)
  })

  /** One source per address, so a caller holding it across renders is stable. */
  it('answers the same source for the same address', async () => {
    const first = await demoSourceFromUrl('?importer=demo')
    const second = await demoSourceFromUrl('?importer=demo')
    expect(second).toBe(first)
    expect(loaded.times).toBe(1)
  })
})
