/**
 * What an analyst may type into a candidate before it is committed.
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

/**
 * Which field a refusal blames, out of the `errors` a 422 carries.
 */
async function refusedFields(
  run: Promise<unknown>,
): Promise<{ status: number | undefined; fields: string[]; keys: string[] }> {
  const error = (await run.then(() => null).catch((one: unknown) => one)) as
    | { status?: number; response?: { errors?: { path?: (string | number)[]; keys?: string[] }[] } }
    | null
  if (!error) throw new Error('the write was accepted, so there is no refusal to read')
  const issues = error.response?.errors ?? []
  return {
    status: error.status,
    fields: issues.map((issue) => String(issue.path?.at(-1) ?? '')),
    keys: issues.flatMap((issue) => issue.keys ?? []),
  }
}

describe('an analyst edit to a candidate', () => {
  /**
   * The four corrections a schema refuses, each asserted on the field the
   * refusal names rather than on the fact that it threw.
   */
  it.each([
    ['severity', 'Critical'],
    ['tactic', 'Initial Access'],
    ['description', 'x'.repeat(5000)],
  ])('refuses a %s the description does not allow, and names it', async (field, value) => {
    const refusal = await refusedFields(commitWith([{ id: 'TIMELINE', field, value }]))

    expect(
      refusal.status,
      `a correction to ${field} was refused as something other than invalid`,
    ).toBe(422)
    expect(
      refusal.fields,
      `the refusal does not name ${field}, so an analyst is told the row is wrong and not ` +
        'which of their corrections to undo',
    ).toContain(field)
  })

  /**
   * **`kind` refuses differently, and the difference is worth pinning.**
   */
  it('refuses a kind the import path does not write, by the keys it leaves stranded', async () => {
    const refusal = await refusedFields(commitWith([{ id: 'TIMELINE', field: 'kind', value: 'action' }]))

    expect(refusal.status).toBe(422)
    expect(
      refusal.keys,
      'the refusal names nothing at all, so the analyst has a rejected row and no way to ' +
        'find the correction that caused it',
    ).toContain('eventSource')
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
