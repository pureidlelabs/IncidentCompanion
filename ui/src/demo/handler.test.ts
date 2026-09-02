/**
 * What the demo answers, and what it refuses to answer.
 *
 * The failure this guards is a handler that says yes to everything: a route it
 * does not implement returning an empty body reaches the screen as a rendered
 * blank rather than as a refusal, and no suite sees the difference.
 */
import { beforeEach, describe, expect, it } from 'vitest'

import { handle } from './handler'
import { freshState, type DemoState } from './state'

let state: DemoState

beforeEach(() => {
  state = freshState()
})

async function ask(
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await handle(state, `/api${path}`, init)
  const text = await response.text()
  return { status: response.status, body: text === '' ? {} : (JSON.parse(text) as Record<string, unknown>) }
}

const post = (body: unknown): RequestInit => ({
  method: 'POST',
  body: JSON.stringify(body),
})

const caseId = (): string => freshState().kase.id

describe('a route the demo does not implement', () => {
  it('refuses rather than answering an empty body', async () => {
    const answer = await ask('/install/policy')
    expect(answer.status).toBe(501)
    expect(answer.body.message).toMatch(/demo/i)
  })

  it('refuses a route invented after this test was written', async () => {
    const answer = await ask('/something/nobody/has/built/yet')
    expect(answer.status).toBe(501)
  })

  it('refuses a write to a collection that does not exist', async () => {
    const answer = await ask(`/cases/${caseId()}/wombats`, post({ name: 'x' }))
    expect(answer.status).toBe(501)
  })
})

describe('the seeded case', () => {
  it('is served whole, with its collections on it', async () => {
    const answer = await ask(`/cases/${caseId()}`)
    expect(answer.status).toBe(200)
    expect(Array.isArray(answer.body.timeline)).toBe(true)
    expect((answer.body.timeline as unknown[]).length).toBeGreaterThan(0)
  })

  it('answers 404 for a case that is not the demo', async () => {
    const answer = await ask('/cases/not-a-real-case')
    expect(answer.status).toBe(404)
  })

  it('is listed by the picker', async () => {
    const answer = await ask('/cases')
    expect(answer.status).toBe(200)
    expect((answer.body as unknown as unknown[]).length).toBeGreaterThan(0)
  })
})

describe('a write', () => {
  it('appends a row that reads back', async () => {
    const before = await ask(`/cases/${caseId()}/timeline`)
    const rows = before.body as unknown as unknown[]

    const made = await ask(
      `/cases/${caseId()}/timeline`,
      post({ kind: 'event', description: 'Something an analyst typed', time: '2026-01-01T00:00:00Z' }),
    )
    expect(made.status).toBe(201)
    expect(made.body.id).toEqual(expect.any(String))

    const after = await ask(`/cases/${caseId()}/timeline`)
    expect((after.body as unknown as unknown[]).length).toBe(rows.length + 1)
  })

  it('is refused by the same schema the server enforces, in the shape the server uses', async () => {
    const answer = await ask(`/cases/${caseId()}/timeline`, post({ kind: 'event', description: '' }))
    expect(answer.status).toBe(422)
    expect(Array.isArray(answer.body.errors)).toBe(true)
    expect((answer.body.errors as unknown[]).length).toBeGreaterThan(0)
  })

  /**
   * The seed is a module-level import shared by every store that loads it, so
   * a handler mutating the row in place writes into the constant - and a reset
   * then restores a case that already carries the edit.
   */
  it('does not reach the seed the next reset reads from', async () => {
    await ask(
      `/cases/${caseId()}/timeline`,
      post({ kind: 'event', description: 'Written into the store', time: '2026-01-01T00:00:00Z' }),
    )

    const reset = freshState()
    const answer = await handle(reset, `/api/cases/${reset.kase.id}/timeline`, {})
    const rows = (await answer.json()) as { description?: string }[]
    expect(rows.some((row) => row.description === 'Written into the store')).toBe(false)
  })

  it('deletes a row it created', async () => {
    const made = await ask(
      `/cases/${caseId()}/timeline`,
      post({ kind: 'event', description: 'Briefly here', time: '2026-01-01T00:00:00Z' }),
    )
    const id = String(made.body.id)

    const gone = await ask(`/cases/${caseId()}/timeline/${id}`, { method: 'DELETE' })
    expect(gone.status).toBe(204)

    const after = await ask(`/cases/${caseId()}/timeline`)
    expect((after.body as unknown as { id: string }[]).some((row) => row.id === id)).toBe(false)
  })
})
