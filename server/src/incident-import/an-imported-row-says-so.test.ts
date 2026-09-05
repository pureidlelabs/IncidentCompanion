/**
 * **A row an import writes says it was imported, and the install decides that
 * rather than the payload.**
 *
 * Asserted on what the import hands the writer, with no database. The rows
 * `createAcross` and `createMany` receive are the whole of what a write can
 * put in a column, so a marker absent here is absent from the case -- and the
 * recorder makes that visible without a stack.
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

/** A collection service that records the rows rather than writing them. */
function recorder() {
  const written: { collection: string; rows: Record<string, unknown>[] }[] = []
  return {
    written,
    service: {
      list: () => Promise.resolve([]),
      createAcross: (
        _caseId: string,
        _actorId: string,
        groups: { def: { name: string }; rows: Record<string, unknown>[] }[],
      ) => {
        for (const group of groups) written.push({ collection: group.def.name, rows: group.rows })
        return Promise.resolve({
          ids: Object.fromEntries(
            groups.map((g) => [g.def.name, g.rows.map((_, at) => `id-${g.def.name}-${String(at)}`)]),
          ),
        })
      },
      createMany: (def: { name: string }, _caseId: string, rows: Record<string, unknown>[]) => {
        written.push({ collection: def.name, rows })
        return Promise.resolve({ ids: rows.map((_, at) => `id-timeline-${String(at)}`), unlinked: 0 })
      },
    },
  }
}

/**
 * An incident carrying a host, and **claiming its own origin in the payload**.
 */
const incident = () => ({
  key: 'inc-1',
  title: 'Impossible travel sign-in',
  alerts: [
    {
      id: 'a-1',
      name: 'a-1',
      properties: {
        alertDisplayName: 'Impossible travel sign-in',
        severity: 'High',
        tactics: ['InitialAccess'],
        timeGenerated: '2026-08-10T12:00:00Z',
      },
    },
  ],
  entities: [
    {
      kind: 'Host',
      id: 'e-host',
      name: 'e-host',
      properties: { hostName: 'WKS-1', source: 'manual', reviewed: true },
    },
  ],
})

async function importedRows(): Promise<{ collection: string; rows: Record<string, unknown>[] }[]> {
  const rig = recorder()
  const service = new ImportService(rig.service as never)
  const incidents = [incident()]
  const plan = await service.preview('case-1', incidents, defs())
  const approved = [...plan.entities.map((one) => one.id), ...plan.timeline.map((one) => one.id)]
  await service.commit('case-1', 'analyst', incidents, approved, [], defs())
  return rig.written
}

describe('a row an import writes', () => {
  it('is handed to the writer at all, or nothing below is a test', async () => {
    const written = await importedRows()

    expect(
      written.flatMap((group) => group.rows).length,
      'the import wrote nothing, so the assertions below are about an empty set',
    ).toBeGreaterThan(0)
  })

  /**
   * **The timeline half, which is the half that is built.**
   */
  it('stamps every timeline entry as imported and unread', async () => {
    const written = await importedRows()
    const timeline = written.filter((group) => group.collection === 'timeline')

    expect(timeline.length, 'the import wrote no timeline entry to stamp').toBeGreaterThan(0)

    const unstamped = timeline.flatMap((group) =>
      group.rows
        .filter((row) => row['provenance'] !== 'imported' || row['unreviewed'] !== true)
        .map((row) => JSON.stringify({ provenance: row['provenance'], unreviewed: row['unreviewed'] })),
    )

    expect(
      unstamped,
      'an imported entry does not say it was imported, or does not say nobody has read ' +
        'it -- so material nobody has reviewed reads as material somebody has',
    ).toEqual([])
  })

  /**
   * **The install's word, never the platform's.**
   */
  it('takes the install as the authority on where a row came from', async () => {
    const written = await importedRows()

    const laundered = written.flatMap((group) =>
      group.rows
        .filter((row) => row['source'] === 'manual' || row['reviewed'] === true)
        .map((row) => `${group.collection}: ${JSON.stringify(row)}`),
    )

    expect(
      laundered,
      'a row carries the origin the incoming payload claimed, so a platform can describe ' +
        'what it sends as work an analyst did',
    ).toEqual([])
  })
})
