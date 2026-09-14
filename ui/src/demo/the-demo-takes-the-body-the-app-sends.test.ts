/**
 * **The demo handler answers the body the application actually sends.**
 *
 * Every write this client makes puts `version` in the PATCH body, and a write
 * against a row read through a draft puts `base` beside it. Neither is a
 * column, and the handler judged the whole body under a strict patch schema --
 * so every row edit in the published demo answered 422 before a field was
 * read. -> #668
 *
 * **The suite stayed green because it sent a body the app never produces.**
 * `patchAs` omitted `version`, which is the one thing every real write
 * carries. A fixture that cannot make the request under test is worse than no
 * fixture: it certifies the defect.
 *
 * **What this does not cover:** what the server does with the same body, which
 * is `collections/entities.controller.ts`'s and is the shape this mirrors.
 */
import { beforeEach, describe, expect, it } from 'vitest'

import { handle } from './handler'
import { freshState, type DemoState } from './state'

let state: DemoState

const ask = async (path: string, init: RequestInit = {}) => {
  const answer = await handle(state, `/api${path}`, init)
  const text = await answer.text()
  return { status: answer.status, body: text === '' ? {} : (JSON.parse(text) as unknown) }
}

const caseId = () => state.kase.id

/** A PATCH as `useEntryMutation` builds one: the version first, then the fields. */
const asTheAppSends = (version: number, fields: Record<string, unknown>): RequestInit => ({
  method: 'PATCH',
  body: JSON.stringify({ version, ...fields }),
})

const firstRow = async (): Promise<{ id: string; version: number }> => {
  const rows = (await ask(`/cases/${caseId()}/timeline`)).body as { id: string; version: number }[]
  return rows[0]!
}

beforeEach(() => {
  state = freshState()
})

describe('a row edit in the published demo', () => {
  it('is taken, not refused for carrying its own version', async () => {
    const row = await firstRow()

    const answer = await ask(
      `/cases/${caseId()}/timeline/${row.id}`,
      asTheAppSends(row.version, { description: 'Edited in the demo' }),
    )

    expect(
      answer.status,
      'the handler judged `version` as though it were a field, so every edit an analyst ' +
        'makes in the published demo is refused before a field is read',
    ).toBe(200)
    expect((answer.body as { description?: string }).description).toBe('Edited in the demo')
  })

  /**
   * **`base` travels with a write made from a draft**, and is no more a column
   * than `version` is.
   */
  it('is taken when it carries the row it was read at', async () => {
    const row = await firstRow()

    const answer = await ask(`/cases/${caseId()}/timeline/${row.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ version: row.version, base: { description: 'before' }, notes: 'x' }),
    })

    expect(answer.status).toBe(200)
  })

  /**
   * **The version still has to be right.** Taking it out of the body must not
   * mean ignoring it: a write against a row somebody else has moved is the
   * conflict the whole version check exists to report.
   */
  it('is refused when the version it names does not match the row', async () => {
    const row = await firstRow()

    const answer = await ask(
      `/cases/${caseId()}/timeline/${row.id}`,
      asTheAppSends(row.version + 5, { description: 'Stale write' }),
    )

    expect(
      answer.status,
      'a write against a version the row has moved past was taken, so the demo loses an ' +
        'edit silently where the app reports a conflict',
    ).toBe(409)
  })

  it('is refused when the version is not a number at all', async () => {
    const row = await firstRow()

    const answer = await ask(`/cases/${caseId()}/timeline/${row.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ version: 'not-a-number', description: 'x' }),
    })

    expect(answer.status).toBe(422)
  })

  /**
   * **A field the collection does not have is still refused**, so taking the
   * two out of the body has not opened the door to everything else.
   */
  it('is still refused for a field the collection does not have', async () => {
    const row = await firstRow()

    const answer = await ask(
      `/cases/${caseId()}/timeline/${row.id}`,
      asTheAppSends(row.version, { wombat: 'no such column' }),
    )

    expect(answer.status).toBe(422)
  })

  it('advances the row version, so the next write is judged against it', async () => {
    const row = await firstRow()

    const answer = await ask(
      `/cases/${caseId()}/timeline/${row.id}`,
      asTheAppSends(row.version, { description: 'First edit' }),
    )

    expect((answer.body as { version?: number }).version).toBe(row.version + 1)
  })
})

describe('a case edit in the published demo', () => {
  it('advances the case version rather than writing the client value back', async () => {
    const before = (await ask(`/cases/${caseId()}`)).body as { version: number }

    const answer = await ask(
      `/cases/${caseId()}`,
      asTheAppSends(before.version, { title: 'Renamed in the demo' }),
    )

    expect(answer.status).toBe(200)
    expect(
      (answer.body as { version?: number }).version,
      'the case kept the version the client sent, so no later write can ever be stale and ' +
        'the conflict check is dead on this route',
    ).toBe(before.version + 1)
  })

  it('is refused when the version it names does not match the case', async () => {
    const before = (await ask(`/cases/${caseId()}`)).body as { version: number }

    const answer = await ask(
      `/cases/${caseId()}`,
      asTheAppSends(before.version + 5, { title: 'Stale' }),
    )

    expect(answer.status).toBe(409)
  })

  it('is refused for a field a case does not have', async () => {
    const before = (await ask(`/cases/${caseId()}`)).body as { version: number }

    const answer = await ask(
      `/cases/${caseId()}`,
      asTheAppSends(before.version, { wombat: 'no such column' }),
    )

    expect(answer.status).toBe(422)
  })
})
