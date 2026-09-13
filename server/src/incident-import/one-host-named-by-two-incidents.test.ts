/**
 * **An import of several incidents naming one host writes that host once, and
 * the preview says so before the write.**
 *
 * The dedup that existed was against what the case already held, and there was
 * none across the incidents in one import: `candidateId` mixes the incident key
 * in, so the same host under two incidents was two ids that never collided,
 * both matched `new`, and both were written. -> #583
 *
 * **Asserted at the preview and at the write, because they are two claims.**
 * Collapsing at the point of writing alone leaves an analyst approving two rows
 * that say the same host and reading one afterwards.
 *
 * **What this does not cover:** the case-boundary reference check, which is
 * `CollectionService`'s, and the browser's grouping of the preview by incident.
 */
import { describe, expect, it } from 'vitest'

import { ImportService } from './import.service.js'
import { definitions as defs } from './targets.js'

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
        return Promise.resolve({
          ids: rows.map((_, at) => `id-timeline-${String(at)}`),
          unlinked: 0,
        })
      },
    },
  }
}

/** An incident whose single alert names its single host entity. */
function incidentNaming(key: string, entityId: string, hostname: string) {
  return {
    key,
    title: key,
    severity: '',
    alerts: [
      {
        id: `alert-${key}`,
        name: `alert-${key}`,
        properties: {
          alertDisplayName: `alert ${key}`,
          severity: 'High',
          tactics: ['InitialAccess'],
          timeGenerated: '2026-08-10T12:00:00Z',
          entityIds: [entityId],
        },
      },
    ],
    entities: [{ kind: 'Host', id: entityId, name: entityId, properties: { hostName: hostname } }],
  }
}

/** An incident naming one cloud app, with or without the instance qualifier. */
function app(key: string, entityId: string, instance?: string) {
  return {
    key,
    title: key,
    severity: '',
    alerts: [],
    entities: [
      {
        kind: 'CloudApplication',
        id: entityId,
        name: entityId,
        properties: { appName: 'Dropbox', ...(instance ? { instanceName: instance } : {}) },
      },
    ],
  }
}

/** The two incidents each carry their own entity id for the one host. */
const SHARED = [
  incidentNaming('inc-1', 'e-first', 'SHARED-1'),
  incidentNaming('inc-2', 'e-second', 'SHARED-1'),
]

function rowsWritten(
  written: { collection: string; rows: Record<string, unknown>[] }[],
  collection: string,
): Record<string, unknown>[] {
  return written.filter((group) => group.collection === collection).flatMap((group) => group.rows)
}

describe('one host named by two incidents', () => {
  it('is one candidate in the preview, attributed to the incident that proposed it', async () => {
    const service = new ImportService(recorder().service as never)

    const plan = await service.preview('case-1', SHARED, defs())
    const hosts = plan.entities.filter((one) => one.collection === 'systems')

    expect(
      hosts.map((one) => one.fields['hostname']),
      'the preview offered the same host twice, so the analyst approves two rows for one thing',
    ).toEqual(['SHARED-1'])
    expect(
      hosts[0]?.incident,
      'the surviving candidate is not attributed to the first incident that proposed it',
    ).toBe('inc-1')
  })

  it('is one row when both incidents are approved', async () => {
    const rig = recorder()
    const service = new ImportService(rig.service as never)

    const plan = await service.preview('case-1', SHARED, defs())
    await service.commit(
      'case-1',
      'analyst',
      SHARED,
      [...plan.entities.map((one) => one.id), ...plan.timeline.map((one) => one.id)],
      [],
      defs(),
    )

    expect(
      rowsWritten(rig.written, 'systems').map((row) => row['hostname']),
      'the import wrote the host once per incident that named it',
    ).toEqual(['SHARED-1'])
  })

  /**
   * **The second incident's alert still points at the host.** Dropping the
   * later candidate without redirecting its entity reference leaves that
   * incident's timeline row naming nothing, which is a quieter loss than the
   * duplicate row this fix is about.
   */
  it('is what both alerts link to', async () => {
    const rig = recorder()
    const service = new ImportService(rig.service as never)

    const plan = await service.preview('case-1', SHARED, defs())
    await service.commit(
      'case-1',
      'analyst',
      SHARED,
      [...plan.entities.map((one) => one.id), ...plan.timeline.map((one) => one.id)],
      [],
      defs(),
    )

    const timeline = rowsWritten(rig.written, 'timeline')
    expect(timeline, 'one alert each, so two timeline rows were expected').toHaveLength(2)
    expect(
      timeline.map((row) => row['systemId']),
      'an alert links to no host, or the two link to different rows for one host',
    ).toEqual(['id-systems-0', 'id-systems-0'])
  })

  /**
   * **A weaker naming of the same thing, which the case index already allows.**
   * `identitiesOf` gives a cloud app with an instance both the qualified form
   * and the bare one, so a plan that registered only the strongest would offer
   * the app twice the moment one incident named the instance and the other did
   * not -- and every case above passes on that, because a host has one rung.
   */
  it.each([
    ['the qualified naming first', 'tenant-a', undefined],
    ['the bare naming first', undefined, 'tenant-a'],
  ])('is one candidate with %s', async (_case, firstInstance, secondInstance) => {
    const service = new ImportService(recorder().service as never)

    const plan = await service.preview(
      'case-1',
      [app('inc-1', 'e-first', firstInstance), app('inc-2', 'e-second', secondInstance)],
      defs(),
    )
    const apps = plan.entities.filter((one) => one.collection === 'cloud_apps')

    expect(
      apps.map((one) => one.fields['appName']),
      'the two namings were offered as two apps, so approving both writes Dropbox twice',
    ).toEqual(['Dropbox'])

    // **Whichever order, the row carries the instance.** Keeping only the
    // first proposer's fields loses it in one of the two orders and reports
    // nothing, which is a quieter loss than the duplicate row.
    expect(
      apps[0]?.fields['instance'],
      'the instance the other incident supplied was dropped',
    ).toBe('tenant-a')
    expect(apps[0]?.label, 'the label still names a row it no longer describes').toBe(
      'Dropbox (tenant-a)',
    )
  })

  /**
   * **The control against a fix that collapses everything.** A test asserting
   * only "one row" passes just as well on an importer that writes one row per
   * import.
   */
  it('does not merge two incidents naming different hosts', async () => {
    const service = new ImportService(recorder().service as never)
    const apart = [
      incidentNaming('inc-1', 'e-first', 'APART-1'),
      incidentNaming('inc-2', 'e-second', 'APART-2'),
    ]

    const plan = await service.preview('case-1', apart, defs())

    expect(
      plan.entities
        .filter((one) => one.collection === 'systems')
        .map((one) => one.fields['hostname']),
      'two different hosts were collapsed into one candidate',
    ).toEqual(['APART-1', 'APART-2'])
  })
})
