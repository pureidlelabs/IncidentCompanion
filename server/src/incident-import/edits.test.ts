/**
 * What an analyst may type into a candidate before it is committed.
 *
 * **Written from the adversarial review's probe table, before the fix**, so a
 * repair has to pass every shape rather than the one it was written against.
 * The entity half was already sound; the timeline half wrote whatever was
 * typed.
 *
 * The defect this holds: `edited()` looked its schema up in
 * `COLLECTION_SCHEMAS`, which carries no `timeline` key on purpose -- the
 * timeline's schema is a union whose arm depends on the row's `kind`, so it is
 * resolved by `schemaFor` instead. The missing key read as "nothing to check"
 * and returned the row. A `severity` of `Critical` committed 201 and then took
 * `GET /api/cases/:id/timeline` to a permanent 500 for every analyst on the
 * case, with no route left that could render the row to delete it.
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

/** A collection service that records rather than writes. */
function recorder() {
  const written: { collection: string; rows: Record<string, unknown>[] }[] = []
  return {
    written,
    service: {
      list: () => Promise.resolve([]),
      createAcross: (_caseId: string, _actorId: string, groups: { def: { name: string }; rows: Record<string, unknown>[] }[]) => {
        for (const group of groups) written.push({ collection: group.def.name, rows: group.rows })
        return Promise.resolve({
          ids: Object.fromEntries(groups.map((g) => [g.def.name, g.rows.map((_, at) => `id-${g.def.name}-${String(at)}`)])),
        })
      },
      // `createMany(def, caseId, rows, actorId)` -- the def comes first.
      createMany: (def: { name: string }, _caseId: string, rows: Record<string, unknown>[]) => {
        written.push({ collection: def.name, rows })
        return Promise.resolve({ ids: rows.map((_, at) => `id-timeline-${String(at)}`), unlinked: 0 })
      },
    },
  }
}

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
    { kind: 'Host', id: 'e-host', name: 'e-host', properties: { hostName: 'WKS-1' } },
  ],
})

async function commitWith(edits: { id: string; field: string; value: unknown }[]) {
  const rig = recorder()
  const service = new ImportService(rig.service as never)
  const incidents = [incident()]
  const plan = await service.preview('case-1', incidents, defs())
  const approved = [...plan.entities.map((one) => one.id), ...plan.timeline.map((one) => one.id)]
  const named = edits.map((edit) => ({
    ...edit,
    id: edit.id === 'TIMELINE' ? (plan.timeline[0]?.id ?? '') : (plan.entities[0]?.id ?? ''),
  }))
  await service.commit('case-1', 'analyst', incidents, approved, named, defs())
  return rig.written
}

describe('an analyst edit to a candidate', () => {
  /** P1 -- the one that took a case timeline offline. */
  it('refuses a severity the timeline schema does not have', async () => {
    await expect(
      commitWith([{ id: 'TIMELINE', field: 'severity', value: 'Critical' }]),
    ).rejects.toThrow()
  })

  /** P2 -- a tactic outside the served vocabulary. */
  it('refuses a tactic spelled the way the provider spells it', async () => {
    await expect(
      commitWith([{ id: 'TIMELINE', field: 'tactic', value: 'Initial Access' }]),
    ).rejects.toThrow()
  })

  /** P3 -- `kind` decides which arm of the union validates the row. */
  it('refuses a kind the import path does not write', async () => {
    await expect(commitWith([{ id: 'TIMELINE', field: 'kind', value: 'action' }])).rejects.toThrow()
  })

  /** P4 -- the length ceiling the single-entry door enforces. */
  it('refuses a description past the column ceiling', async () => {
    await expect(
      commitWith([{ id: 'TIMELINE', field: 'description', value: 'x'.repeat(5000) }]),
    ).rejects.toThrow()
  })

  /** P5 -- the entity half, which was already sound. Kept as the control. */
  it('strips the envelope fields from an entity edit rather than writing them', async () => {
    const written = await commitWith([
      { id: 'ENTITY', field: 'id', value: 'forged' },
      { id: 'ENTITY', field: 'caseId', value: 'another-case' },
      { id: 'ENTITY', field: 'version', value: 99 },
      { id: 'ENTITY', field: 'createdBy', value: 'someone-else' },
    ])
    const systems = written.find((one) => one.collection === 'systems')
    for (const forged of ['id', 'caseId', 'version', 'createdBy']) {
      expect(systems?.rows[0], forged).not.toHaveProperty(forged)
    }
  })

  /** An edit the schema accepts still has to reach the row. */
  it('writes an edit the schema allows', async () => {
    const written = await commitWith([{ id: 'TIMELINE', field: 'description', value: 'Corrected' }])
    const timeline = written.find((one) => one.collection === 'timeline')
    expect(timeline?.rows[0]?.['description']).toBe('Corrected')
  })
})
