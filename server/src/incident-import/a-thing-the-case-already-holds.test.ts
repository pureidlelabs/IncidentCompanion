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
import { definitions as defs } from './targets.js'

function recorder(hosts: () => Record<string, unknown>[]) {
  const written: { collection: string; rows: Record<string, unknown>[] }[] = []
  /**
   * The timeline the case holds, which is what the rig has written to it.
   * A fixture whose timeline stays empty cannot tell a matcher from no
   * matcher: every run judges a case that holds none of the first run's work.
   */
  const entries: Record<string, unknown>[] = []
  return {
    written,
    entries,
    service: {
      list: (def: { name: string }) =>
        Promise.resolve(
          def.name === 'systems' ? hosts() : def.name === 'timeline' ? [...entries] : [],
        ),
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
        // **`time` goes back as a `Date`**, which is what the store answers for
        // a timestamp column. Handing back the string that was written lets a
        // matcher comparing text pass here and match nothing in a real case.
        for (const row of rows) {
          entries.push({
            id: `row-${String(entries.length)}`,
            ...row,
            time: new Date(String(row['time'])),
          })
        }
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
   * **The same alert is one event, and the whole import is run again.**
   *
   * Both halves are asserted together, because the property is that they agree:
   * a matcher on the entities alone leaves the timeline doubling under it, and
   * the analyst reading the case cannot tell the second copy of an alert from a
   * second occurrence of it.
   *
   * **Approved rather than left unchecked**, which is the attack: the preview
   * offers a matched entry unchecked, and an analyst who checks it anyway --
   * or a client that approves everything it is shown -- must still not get a
   * second copy. Skipping at the write is what decides that; the checkbox is
   * what it looks like.
   */
  it('matches the alert it already wrote, and the host it names with it', async () => {
    let hosts: Record<string, unknown>[] = []
    const rig = recorder(() => hosts)
    const service = new ImportService(rig.service as never)
    const incidents = [incident()]

    async function runOnce() {
      const plan = await service.preview('case-1', incidents, defs())
      const wrote = await service.commit(
        'case-1',
        'analyst',
        incidents,
        [...plan.entities.map((one) => one.id), ...plan.timeline.map((one) => one.id)],
        [],
        defs(),
      )
      return { plan, wrote }
    }

    const first = await runOnce()
    expect(hostRowsWritten(rig.written), 'the first run wrote no host to match against').toHaveLength(
      1,
    )
    expect(
      timelineRowsWritten(rig.written),
      'the first run wrote no entry to match against',
    ).toHaveLength(1)
    expect(first.plan.timeline[0]?.existing, 'the first run matched an empty case').toBeNull()

    hosts = ALREADY_THERE
    const second = await runOnce()

    expect(
      second.plan.timeline[0]?.existing,
      'the entry the case already holds is offered as new, so the analyst is told the ' +
        'import will add something it will not',
    ).toBe('row-0')
    expect(
      hostRowsWritten(rig.written),
      'the host was written a second time, so a thing with an identity was treated as an event',
    ).toHaveLength(1)
    expect(
      timelineRowsWritten(rig.written),
      'the re-import wrote the alert again, so the timeline carries two of every entry ' +
        'the first run brought in',
    ).toHaveLength(1)
    expect(
      second.wrote,
      'the re-import reported as added rows it did not write, so the two sentences the ' +
        'analyst is shown count different things',
    ).toEqual({ entities: 0, timeline: 0, skippedExisting: 2 })
  })

  /**
   * **An entry the analyst wrote is theirs, and the import writes its own.**
   *
   * The analyst's record of an event and the platform's are two accounts of
   * it, and the one the analyst typed is the one they would go looking for.
   * Matching against it drops the imported entry and reports it as already
   * there, which is the import silently deciding their note was the alert.
   */
  it('writes its own entry beside one the analyst wrote that reads the same', async () => {
    const rig = recorder(() => [])
    rig.entries.push({
      id: 'row-the-analyst-wrote',
      provenance: 'typed',
      sourceTool: 'Microsoft Sentinel',
      description: 'One host',
      time: new Date('2026-08-10T12:00:00Z'),
    })
    const service = new ImportService(rig.service as never)
    const incidents = [incident()]

    const plan = await service.preview('case-1', incidents, defs())
    expect(
      plan.timeline[0]?.existing,
      "the import matched the analyst's own entry, so their record is read as the alert",
    ).toBeNull()

    await service.commit(
      'case-1',
      'analyst',
      incidents,
      [...plan.entities.map((one) => one.id), ...plan.timeline.map((one) => one.id)],
      [],
      defs(),
    )

    expect(
      timelineRowsWritten(rig.written),
      'the alert was dropped, so the case holds the analyst note and none of the import',
    ).toHaveLength(1)
  })

  /**
   * **Recognised by a weaker naming than the one it arrived with.** A provider
   * gives more than a table keeps -- a cloud app arrives with an instance the
   * stored row does not carry -- so an incoming row keyed on everything it
   * knows never matches, and the import writes a second copy of a thing the
   * case already holds.
   *
   * **Written because nothing asserted it.** Narrowing the match to the
   * strongest identity alone left all 164 cases in this folder green.
   */
  it('is recognised when the incident names it more precisely than the case does', async () => {
    const service = new ImportService({
      list: (def: { name: string }) =>
        Promise.resolve(def.name === 'cloud_apps' ? [{ id: 'row-dropbox', appName: 'Dropbox' }] : []),
    } as never)

    const plan = await service.preview(
      'case-1',
      [
        {
          key: 'inc-1',
          title: 'One app',
          severity: '',
          alerts: [],
          entities: [
            {
              kind: 'CloudApplication',
              id: 'e-app',
              name: 'e-app',
              properties: { appName: 'Dropbox', instanceName: 'tenant-a' },
            },
          ],
        },
      ],
      defs(),
    )

    const app = plan.entities.find((one) => one.collection === 'cloud_apps')
    expect(app, 'the preview proposed no app, so there is nothing to recognise').toBeDefined()
    expect(
      app?.existing,
      'the qualified naming matched nothing, so the import offers a second Dropbox as new',
    ).toBe('row-dropbox')
  })
})
