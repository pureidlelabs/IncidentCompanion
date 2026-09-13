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
import { UnprocessableEntityException } from '@nestjs/common'
import { describe, expect, it } from 'vitest'

import { ImportService } from './import.service.js'
import { definitions as defs } from './targets.js'

function flaky(timelineFailures = 1, refusal?: () => Error) {
  /** What the case holds, by collection: `list` is what matching reads. */
  const held: Record<string, Record<string, unknown>[]> = {}
  const written: { collection: string; rows: Record<string, unknown>[] }[] = []
  let failuresLeft = timelineFailures

  return {
    held,
    written,
    service: {
      list: (def: { name: string }) => Promise.resolve([...(held[def.name] ?? [])]),
      createAcross: (
        _caseId: string,
        _actorId: string,
        groups: { def: { name: string }; rows: Record<string, unknown>[] }[],
      ) => {
        for (const group of groups) {
          written.push({ collection: group.def.name, rows: group.rows })
          const mine = (held[group.def.name] ??= [])
          for (const row of group.rows) mine.push({ id: `row-${String(mine.length)}`, ...row })
        }
        return Promise.resolve({
          ids: Object.fromEntries(
            groups.map((g) => [g.def.name, g.rows.map((_, at) => `id-${g.def.name}-${String(at)}`)]),
          ),
        })
      },
      createMany: (def: { name: string }, _caseId: string, rows: Record<string, unknown>[]) => {
        if (failuresLeft > 0) {
          failuresLeft -= 1
          return Promise.reject(refusal ? refusal() : new Error('the timeline write failed'))
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
  severity: '',
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
  /**
   * **Two kinds, three rows.** With one host in one group the row count, the
   * collection count and the group count are all 1, so an assertion on
   * `wrote.entities` cannot tell which of them it is reading -- measured:
   * `Object.keys(written.ids).length` passed the whole suite.
   */
  entities: [
    { kind: 'Host', id: 'e-host', name: 'e-host', properties: { hostName: 'WKS-1' } },
    { kind: 'Host', id: 'e-host-2', name: 'e-host-2', properties: { hostName: 'WKS-2' } },
    {
      kind: 'Account',
      id: 'e-account',
      name: 'e-account',
      properties: { accountName: 'j.doe', upnSuffix: 'example.test' },
    },
  ],
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

    // The refusal is this app's, not the store's: the entities landed, so the
    // caller is told that rather than handed the write error. The store's own
    // words are on `detail`. -> the case below, #170
    await expect(run(), 'the first run was supposed to fail partway').rejects.toThrow(
      /partly wrote/i,
    )

    expect(
      rowsOf(rig.written, 'systems'),
      'the first run wrote no entity, so there is no partial state to retry into',
    ).toHaveLength(2)
    expect(rowsOf(rig.written, 'timeline'), 'the timeline write did not fail').toHaveLength(0)

    await run()

    expect(
      rowsOf(rig.written, 'systems'),
      'the retry wrote the host again, so an analyst who retries a failed import ends up ' +
        'with two of everything that landed the first time',
    ).toHaveLength(2)
    expect(
      rowsOf(rig.written, 'timeline'),
      'the retry did not write what was missing, so the import cannot be finished by ' +
        'running it again',
    ).toHaveLength(1)
  })

  /**
   * **The belt to the retry's braces**, and the half of the requirement the
   * retry does not cover: an analyst who does not immediately run it again
   * goes to look at the case, and cannot tell whether what is in it arrived
   * from this import or was already there.
   *
   * The store's own error says nothing about the rows that landed a moment
   * earlier, so it is the one thing the caller must not be handed unchanged.
   * -> #170
   */
  it('says what reached the case, rather than handing on the store error', async () => {
    const rig = flaky()
    const service = new ImportService(rig.service as never)
    const incidents = [incident()]
    const plan = await service.preview('case-1', incidents, defs())

    const failure = await service
      .commit(
        'case-1',
        'analyst',
        incidents,
        [...plan.entities.map((one) => one.id), ...plan.timeline.map((one) => one.id)],
        [],
        defs(),
      )
      .then(
        () => undefined,
        (why: unknown) => why,
      )

    expect(failure, 'the run was supposed to fail partway').toBeDefined()

    const body = (failure as { response?: unknown }).response as
      | { message?: unknown; wrote?: unknown }
      | undefined

    expect(
      body?.message,
      'the caller is told a write failed and not that part of it landed',
    ).toMatch(/partly/i)
    // **The counts, because "partly" alone is not what reached the case.** A
    // failure that wrote five rows and one that wrote none read identically
    // without them.
    // **Three rows across two collections**, so the count is of rows and not
    // of the groups they were written in -- which one host in one group could
    // not tell apart.
    expect(body?.wrote, 'the failure does not say what reached the case').toEqual({
      entities: 3,
      skippedExisting: 0,
      timeline: 0,
    })
    expect(body?.message, 'the sentence and the counts disagree').toContain('3 entities landed')
  })

  /**
   * **A retry that finds everything already there wrote nothing**, and says
   * so.
   *
   * The sentence used to assert that entities landed whatever the numbers
   * were, so the second run -- where every entity matches a row the first run
   * left and `createAcross` writes none -- reported a partial write with its
   * own `wrote.entities` reading 0 three lines below. Every later retry said
   * the same, forever. -> #170
   */
  it('says nothing was written when the retry matched everything already there', async () => {
    const rig = flaky(2)
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

    await expect(run()).rejects.toThrow(/partly wrote/i)

    const second = await run().then(
      () => undefined,
      (why: unknown) => why,
    )
    const body = (second as { response?: unknown }).response as
      | { message?: unknown; wrote?: unknown }
      | undefined

    expect(body?.wrote, 'the retry wrote an entity it should have matched').toEqual({
      entities: 0,
      skippedExisting: 3,
      timeline: 0,
    })
    expect(
      body?.message,
      'a run that wrote nothing reported a partial write',
    ).toMatch(/wrote nothing/i)
  })

  /**
   * **This app's own refusal is not a partial write, and is not retryable.**
   *
   * The timeline write runs the case-boundary reference check, whose refusal
   * is deterministic and names the row. Wrapping it turned *this file points
   * outside the case, at row 12* into *partly wrote, run it again* -- advice
   * that can only fail, with the row number demoted out of the message.
   */
  it('passes this app own refusal through, rather than calling it a partial write', async () => {
    const refusal = () =>
      new UnprocessableEntityException({ message: 'CSV row 12 points outside this case.' })
    const rig = flaky(1, refusal)
    const service = new ImportService(rig.service as never)
    const incidents = [incident()]
    const plan = await service.preview('case-1', incidents, defs())

    const failure = await service
      .commit(
        'case-1',
        'analyst',
        incidents,
        [...plan.entities.map((one) => one.id), ...plan.timeline.map((one) => one.id)],
        [],
        defs(),
      )
      .then(
        () => undefined,
        (why: unknown) => why,
      )

    const body = (failure as { response?: unknown }).response as { message?: unknown } | undefined
    expect(body?.message, 'the refusal lost the row it named').toBe(
      'CSV row 12 points outside this case.',
    )
  })

  /**
   * **On a caller's transaction nothing survives, so nothing is claimed.**
   * `POST /imports/case` creates the case and imports into it in one act and
   * hands `commit` that transaction -- a timeline failure there takes the
   * entities *and* the case back, and a refusal naming rows that landed would
   * send an analyst looking for rows nobody can find. -> #170
   */
  it('claims nothing landed when the caller owns the transaction', async () => {
    const rig = flaky()
    const service = new ImportService(rig.service as never)
    const incidents = [incident()]
    const plan = await service.preview('case-1', incidents, defs())

    const failure = await service
      .commit(
        'case-1',
        'analyst',
        incidents,
        [...plan.entities.map((one) => one.id), ...plan.timeline.map((one) => one.id)],
        [],
        defs(),
        // Any executor: what this asks is whether `commit` was handed one, not
        // what it does with it.
        {} as never,
      )
      .then(
        () => undefined,
        (why: unknown) => why,
      )

    const body = (failure as { response?: unknown }).response as
      | { message?: unknown; wrote?: unknown }
      | undefined

    expect(body?.message, 'the caller is told rows landed that were taken back').toMatch(
      /wrote nothing/i,
    )
    expect(body?.wrote).toEqual({ entities: 0, skippedExisting: 0, timeline: 0 })
  })
})
