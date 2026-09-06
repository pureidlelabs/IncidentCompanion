/**
 * **An import that failed partway finishes the job when it is run again,
 * rather than doubling it.**
 *
 * The requirement permits the seam -- *where a later part fails, what was
 * already written MAY remain* -- and pays for it with this: the analyst must
 * be able to retry into the same case without working out what landed, which
 * is *the labour the import exists to remove, and asking for it exactly when
 * something has already gone wrong*.
 *
 * So the failure has to be real and partial. The entities land, the timeline
 * write throws, and the second run happens against a case that holds what the
 * first one wrote.
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

function flaky() {
  const hosts: Record<string, unknown>[] = []
  const written: { collection: string; rows: Record<string, unknown>[] }[] = []
  let timelineFailures = 1

  return {
    hosts,
    written,
    service: {
      list: (def: { name: string }) => Promise.resolve(def.name === 'systems' ? [...hosts] : []),
      createAcross: (
        _caseId: string,
        _actorId: string,
        groups: { def: { name: string }; rows: Record<string, unknown>[] }[],
      ) => {
        for (const group of groups) {
          written.push({ collection: group.def.name, rows: group.rows })
          if (group.def.name === 'systems') {
            for (const row of group.rows) hosts.push({ id: `row-${String(hosts.length)}`, ...row })
          }
        }
        return Promise.resolve({
          ids: Object.fromEntries(
            groups.map((g) => [g.def.name, g.rows.map((_, at) => `id-${g.def.name}-${String(at)}`)]),
          ),
        })
      },
      createMany: (def: { name: string }, _caseId: string, rows: Record<string, unknown>[]) => {
        if (timelineFailures > 0) {
          timelineFailures -= 1
          return Promise.reject(new Error('the timeline write failed'))
        }
        written.push({ collection: def.name, rows })
        return Promise.resolve({ ids: rows.map((_, at) => `id-timeline-${String(at)}`), unlinked: 0 })
      },
    },
  }
}

const incident = () => ({
  key: 'inc-1',
  title: 'Retried',
  alerts: [
    {
      id: 'a-1',
      name: 'a-1',
      properties: {
        alertDisplayName: 'Retried',
        severity: 'High',
        tactics: ['InitialAccess'],
        timeGenerated: '2026-08-10T12:00:00Z',
      },
    },
  ],
  entities: [{ kind: 'Host', id: 'e-host', name: 'e-host', properties: { hostName: 'WKS-1' } }],
})

function rowsOf(
  written: { collection: string; rows: Record<string, unknown>[] }[],
  collection: string,
): unknown[] {
  return written.filter((group) => group.collection === collection).flatMap((group) => group.rows)
}

describe('an import that failed partway', () => {
  it('finishes the job when it is run again, rather than doubling it', async () => {
    const rig = flaky()
    const service = new ImportService(rig.service as never)
    const incidents = [incident()]

    async function run() {
      const plan = await service.preview('case-1', incidents, defs())
      return service.commit(
        'case-1',
        'analyst',
        incidents,
        [...plan.entities.map((one) => one.id), ...plan.timeline.map((one) => one.id)],
        [],
        defs(),
      )
    }

    await expect(run(), 'the first run was supposed to fail partway').rejects.toThrow(
      'the timeline write failed',
    )

    expect(
      rowsOf(rig.written, 'systems'),
      'the first run wrote no entity, so there is no partial state to retry into',
    ).toHaveLength(1)
    expect(rowsOf(rig.written, 'timeline'), 'the timeline write did not fail').toHaveLength(0)

    await run()

    expect(
      rowsOf(rig.written, 'systems'),
      'the retry wrote the host again, so an analyst who retries a failed import ends up ' +
        'with two of everything that landed the first time',
    ).toHaveLength(1)
    expect(
      rowsOf(rig.written, 'timeline'),
      'the retry did not write what was missing, so the import cannot be finished by ' +
        'running it again',
    ).toHaveLength(1)
  })
})
