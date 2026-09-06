/**
 * **Declining part of an import writes the rest, and writes only the rest.**
 *
 * `incident-import` asks for both directions in one scenario -- *only the
 * accepted rows are written* -- and the second is the one an example misses:
 * a commit that ignored the approval list entirely would write everything and
 * satisfy any test that only checks the accepted row arrived.
 *
 * Asserted on what the import hands the writer, with no database, so the
 * subject is the decision rather than the insert.
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

const incident = () => ({
  key: 'inc-1',
  title: 'Two hosts',
  alerts: [
    {
      id: 'a-1',
      name: 'a-1',
      properties: {
        alertDisplayName: 'Two hosts',
        severity: 'High',
        tactics: ['InitialAccess'],
        timeGenerated: '2026-08-10T12:00:00Z',
      },
    },
  ],
  entities: [
    { kind: 'Host', id: 'e-keep', name: 'e-keep', properties: { hostName: 'KEEP-1' } },
    { kind: 'Host', id: 'e-drop', name: 'e-drop', properties: { hostName: 'DROP-1' } },
  ],
})

function hostnames(written: { rows: Record<string, unknown>[] }[]): string[] {
  return written.flatMap((group) =>
    group.rows.map((row) => row['hostname']).filter((one): one is string => typeof one === 'string'),
  )
}

describe('an analyst declining part of an import', () => {
  async function commitApproving(pick: (label: string) => boolean) {
    const rig = recorder()
    const service = new ImportService(rig.service as never)
    const incidents = [incident()]
    const plan = await service.preview('case-1', incidents, defs())

    const approved = [
      ...plan.entities.filter((one) => pick(JSON.stringify(one))).map((one) => one.id),
      ...plan.timeline.map((one) => one.id),
    ]
    await service.commit('case-1', 'analyst', incidents, approved, [], defs())
    return { written: rig.written, offered: plan.entities.length }
  }

  it('offers both hosts, or declining one of them proves nothing', async () => {
    const { offered } = await commitApproving(() => true)
    expect(offered, 'the preview did not propose two hosts to choose between').toBe(2)
  })

  it('writes both when both are accepted', async () => {
    const { written } = await commitApproving(() => true)
    expect(hostnames(written).sort()).toEqual(['DROP-1', 'KEEP-1'])
  })

  it('writes the accepted host and not the declined one', async () => {
    const { written } = await commitApproving((one) => one.includes('KEEP-1'))
    const wrote = hostnames(written)

    expect(wrote, 'the accepted host was not written, so the decline took the import with it').toContain(
      'KEEP-1',
    )
    expect(
      wrote,
      'a host the analyst declined was written anyway, so approving rows individually ' +
        'decides nothing',
    ).not.toContain('DROP-1')
  })
})
