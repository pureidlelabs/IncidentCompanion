/**
 * **An import recognises what the case already holds, and it looks again when
 * it writes.**
 *
 * `incident-import` asks for the second part explicitly: *the decision MUST be
 * made against what the case holds at the moment of import rather than against
 * anything the analyst's browser was told earlier, so that a row another
 * analyst added while the import was being reviewed is still recognised*.
 *
 * That is a property of *when* the read happens, so a fixture whose case never
 * changes cannot see it. The case here changes between the preview and the
 * commit, which is the only arrangement that can tell a re-read from a
 * remembered answer.
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

function recorder(hosts: () => Record<string, unknown>[]) {
  const written: { collection: string; rows: Record<string, unknown>[] }[] = []
  return {
    written,
    service: {
      list: (def: { name: string }) =>
        Promise.resolve(def.name === 'systems' ? hosts() : []),
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

const incident = () => ({
  key: 'inc-1',
  title: 'One host',
  alerts: [
    {
      id: 'a-1',
      name: 'a-1',
      properties: {
        alertDisplayName: 'One host',
        severity: 'High',
        tactics: ['InitialAccess'],
        timeGenerated: '2026-08-10T12:00:00Z',
      },
    },
  ],
  entities: [{ kind: 'Host', id: 'e-host', name: 'e-host', properties: { hostName: 'WKS-1' } }],
})

const ALREADY_THERE = [{ id: 'row-already-there', hostname: 'WKS-1' }]

function hostRowsWritten(written: { collection: string; rows: Record<string, unknown>[] }[]): unknown[] {
  return written.filter((group) => group.collection === 'systems').flatMap((group) => group.rows)
}

function timelineRowsWritten(
  written: { collection: string; rows: Record<string, unknown>[] }[],
): unknown[] {
  return written.filter((group) => group.collection === 'timeline').flatMap((group) => group.rows)
}

describe('a thing the case already holds', () => {
  it('is shown as existing rather than new, and is not written again', async () => {
    const rig = recorder(() => ALREADY_THERE)
    const service = new ImportService(rig.service as never)
    const incidents = [incident()]

    const plan = await service.preview('case-1', incidents, defs())
    const host = plan.entities.find((one) => JSON.stringify(one).includes('WKS-1'))

    expect(host, 'the preview proposed no host, so there is nothing to recognise').toBeDefined()
    expect(
      (host as { verdict?: string }).verdict,
      'a host the case already holds is offered as new, so accepting the import duplicates it',
    ).toBe('existing')

    await service.commit(
      'case-1',
      'analyst',
      incidents,
      [...plan.entities.map((one) => one.id), ...plan.timeline.map((one) => one.id)],
      [],
      defs(),
    )

    expect(
      hostRowsWritten(rig.written),
      'the host was written even though the case already held it',
    ).toEqual([])
  })

  it('recognises a host added after the preview was taken', async () => {
    let hosts: Record<string, unknown>[] = []
    const rig = recorder(() => hosts)
    const service = new ImportService(rig.service as never)
    const incidents = [incident()]

    const plan = await service.preview('case-1', incidents, defs())
    const host = plan.entities.find((one) => JSON.stringify(one).includes('WKS-1'))
    expect(
      (host as { verdict?: string }).verdict,
      'the host was already recognised at preview time, so this case is not the control ' +
        'it is written to be',
    ).toBe('new')

    hosts = ALREADY_THERE

    await service.commit(
      'case-1',
      'analyst',
      incidents,
      [...plan.entities.map((one) => one.id), ...plan.timeline.map((one) => one.id)],
      [],
      defs(),
    )

    expect(
      hostRowsWritten(rig.written),
      'the import wrote a second host, so it matched against what the browser was told ' +
        'rather than against what the case holds',
    ).toEqual([])
  })

  /**
   * **The exception, and it is deliberate.** *Only collections that have an
   * identity can be matched this way. For a collection whose rows are events
   * rather than things, every imported row MUST be a new row.*
   *
   * So running the same import twice is not idempotent everywhere, and the
   * two halves have to be asserted together: a matcher applied to the timeline
   * would make the second run silent, and one applied to nothing would
   * duplicate the host. One run of each, in one case, because the property is
   * the difference between them.
   */
  it('writes the event again while the host it names is matched', async () => {
    let hosts: Record<string, unknown>[] = []
    const rig = recorder(() => hosts)
    const service = new ImportService(rig.service as never)
    const incidents = [incident()]

    async function runOnce() {
      const plan = await service.preview('case-1', incidents, defs())
      await service.commit(
        'case-1',
        'analyst',
        incidents,
        [...plan.entities.map((one) => one.id), ...plan.timeline.map((one) => one.id)],
        [],
        defs(),
      )
    }

    await runOnce()
    expect(hostRowsWritten(rig.written), 'the first run wrote no host to match against').toHaveLength(
      1,
    )

    hosts = ALREADY_THERE
    await runOnce()

    expect(
      hostRowsWritten(rig.written),
      'the host was written a second time, so a thing with an identity was treated as an event',
    ).toHaveLength(1)
    expect(
      timelineRowsWritten(rig.written),
      'the second run wrote no timeline entry, so an event was treated as a duplicate of ' +
        'one already recorded -- two occurrences of the same thing are two events',
    ).toHaveLength(2)
  })
})
