/**
 * **What an import could not bring in is counted, and the two reasons are
 * counted apart.**
 *
 * `incident-import` asks for the separation and says why: *an import MUST
 * distinguish material it did not recognise from material it recognised and
 * could not use, because those tell the analyst different things about whether
 * the case is complete.* A platform sending a kind this install has never
 * heard of is a gap in the mapping; a host with no hostname is a gap in the
 * data.
 *
 * And a single unmappable item MUST NOT abandon the import, which is the half
 * an example with one bad item cannot see -- so every fixture here carries a
 * good row beside the bad one.
 */
import { describe, expect, it } from 'vitest'

import { ImportService } from './import.service.js'
import { TABLES } from '../collections/registry.js'
import { ordered } from '../collections/entities.controller.js'
import { DEFINITION as TIMELINE_DEFINITION } from '../collections/timeline.controller.js'

const IMPORT_TARGETS = ['systems', 'accounts', 'network_indicators', 'malware', 'cloud_apps'] as const

function defs() {
  return {
    byName: Object.fromEntries(IMPORT_TARGETS.map((name) => [name, ordered(name, TABLES[name])])),
    timeline: TIMELINE_DEFINITION,
  }
}

const service = () =>
  new ImportService({
    list: () => Promise.resolve([]),
    createAcross: () => Promise.resolve({ ids: {} }),
    createMany: () => Promise.resolve({ ids: [], unlinked: 0 }),
  } as never)

const ALERT = {
  id: 'a-1',
  name: 'a-1',
  properties: {
    alertDisplayName: 'One alert',
    severity: 'High',
    tactics: ['InitialAccess'],
    timeGenerated: '2026-08-10T12:00:00Z',
  },
}

const GOOD_HOST = { kind: 'Host', id: 'e-ok', name: 'e-ok', properties: { hostName: 'WKS-1' } }

function incident(entities: unknown[]) {
  return { key: 'inc-1', title: 'Left behind', alerts: [ALERT], entities }
}

async function previewOf(entities: unknown[]) {
  return service().preview('case-1', [incident(entities)], defs())
}

describe('what an import could not bring in', () => {
  it('brings in what it can, or the counts below are about a failed import', async () => {
    const plan = await previewOf([GOOD_HOST])

    expect(plan.entities.length, 'the good host was not proposed at all').toBe(1)
    expect(plan.skipped, 'nothing was skipped, so this is the clean baseline').toEqual({
      unsupportedKind: 0,
      unmappable: 0,
    })
  })

  /**
   * A kind this install does not map. The requirement's own example, and the
   * one where the analyst needs to know the *mapping* is short rather than
   * the data.
   */
  it('counts a kind it does not recognise, and imports the rest', async () => {
    const plan = await previewOf([
      GOOD_HOST,
      { kind: 'Nonesuch', id: 'e-odd', name: 'e-odd', properties: { whatever: 'x' } },
    ])

    expect(plan.skipped.unsupportedKind, 'an unrecognised kind was not counted').toBe(1)
    expect(
      plan.entities.length,
      'one item the install could not recognise abandoned the rest of the incident',
    ).toBe(1)
  })

  /**
   * A kind it recognises carrying nothing it can use. Counted apart from the
   * one above, which is the whole of this requirement: *those tell the analyst
   * different things about whether the case is complete.*
   */
  it('counts a recognised kind it cannot use, apart from one it does not recognise', async () => {
    const plan = await previewOf([
      GOOD_HOST,
      { kind: 'Host', id: 'e-empty', name: 'e-empty', properties: {} },
    ])

    expect(plan.skipped.unmappable, 'a host with nothing to map was not counted').toBe(1)
    expect(
      plan.skipped.unsupportedKind,
      'an unusable row was counted as an unrecognised kind, so the analyst is told the ' +
        'mapping is short when the data was',
    ).toBe(0)
    expect(plan.entities.length, 'the usable host went with the unusable one').toBe(1)
  })
})
