/**
 * **An approval naming rows the plan does not hold is a review that has aged.**
 *
 * The candidate ids are derived from the payload rather than minted and kept,
 * which is deliberate -- a commit resends the payload and recomputes, so an id
 * that changed between the two calls would approve a different row than the one
 * shown. The consequence is that anything changing a row's identity between the
 * preview and the commit changes its id, and an id matching no candidate was
 * simply not selected: nothing written, and a success reporting zero.
 *
 * Asserted on what the import refuses, with no database, so the subject is the
 * decision rather than the insert. What no case here covers is the screen: that
 * an analyst reading the refusal knows to run the review again is a wording
 * judgement no test makes.
 */
import { describe, expect, it } from 'vitest'

import { ImportService } from './import.service.js'
import { definitions as defs } from './targets.js'

/** Enough of `CollectionService` to write through, and to record nothing. */
function writer() {
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
  title: 'One host',
  severity: '',
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
  entities: [{ kind: 'Host', id: 'e-1', name: 'e-1', properties: { hostName: 'WKS-1' } }],
})

describe('an approval the plan cannot account for', () => {
  async function commitApproving(approved: readonly string[]) {
    const rig = writer()
    const service = new ImportService(rig.service as never)
    const incidents = [incident()]
    return {
      rig,
      run: () => service.commit('case-1', 'analyst', incidents, approved, [], defs()),
    }
  }

  it('is refused rather than answered with a success that wrote nothing', async () => {
    const { run } = await commitApproving(['inc-1\u0000gone'])

    await expect(
      run(),
      'an approval naming no candidate was accepted, so the analyst is told an import ' +
        'succeeded and the case is untouched',
    ).rejects.toThrow(/review/i)
  })

  it('writes nothing when it refuses, rather than the part it could resolve', async () => {
    const service = new ImportService(writer().service as never)
    const incidents = [incident()]
    const plan = await service.preview('case-1', incidents, defs())
    const real = [...plan.entities, ...plan.timeline].map((one) => one.id)

    const rig = writer()
    const partial = new ImportService(rig.service as never)
    await expect(
      partial.commit('case-1', 'analyst', incidents, [...real, 'inc-1\u0000gone'], [], defs()),
    ).rejects.toThrow()
    expect(rig.written, 'rows were written under a refused commit').toEqual([])
  })

  it('refuses a correction addressed to a row the plan does not hold', async () => {
    const rig = writer()
    const service = new ImportService(rig.service as never)
    const incidents = [incident()]
    const plan = await service.preview('case-1', incidents, defs())
    const approved = [...plan.entities, ...plan.timeline].map((one) => one.id)

    await expect(
      service.commit('case-1', 'analyst', incidents, approved, [
        { id: 'inc-1\u0000gone', field: 'hostname', value: 'EDITED' },
      ], defs()),
      'an edit naming no candidate was dropped, so the row is written with the value ' +
        'the analyst edited away',
    ).rejects.toThrow(/review/i)
  })

  it('accepts an approval every id of which the plan holds', async () => {
    const rig = writer()
    const service = new ImportService(rig.service as never)
    const incidents = [incident()]
    const plan = await service.preview('case-1', incidents, defs())
    const approved = [...plan.entities, ...plan.timeline].map((one) => one.id)

    const counts = await service.commit('case-1', 'analyst', incidents, approved, [], defs())

    expect(counts.entities, 'the refusal fires on a review that is not stale').toBe(1)
  })
})
