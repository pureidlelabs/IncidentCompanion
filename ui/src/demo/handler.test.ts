/**
 * What the demo answers, and what it refuses to answer.
 *
 * The failure this guards is a handler that says yes to everything: a route it
 * does not implement returning an empty body reaches the screen as a rendered
 * blank rather than as a refusal, and no suite sees the difference.
 */
import { beforeEach, describe, expect, it } from 'vitest'

import { toWire } from '@/api/naming'

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

/**
 * The layer the demo sits below.
 *
 * `client.ts` snake-cases every body on the way out, and the server's
 * `CamelCaseBodyMiddleware` undoes it on `ALL_ROUTES` before any schema runs.
 * Substituting for `fetch` puts the demo under that middleware, so it does the
 * same job - and these post through `toWire`, as the client does, rather than
 * the camelCase a hand-written test would reach for.
 */
describe('a body arrives as the client sends it', () => {
  const asClient = (body: Record<string, unknown>): RequestInit => ({
    method: 'POST',
    body: JSON.stringify(toWire(body)),
  })

  it('accepts a field whose name is more than one word', async () => {
    const answer = await ask(
      `/cases/${caseId()}/timeline`,
      asClient({
        kind: 'event',
        description: 'Mailbox read in bulk',
        time: '2026-08-14T09:00:00.000Z',
        eventSource: 'endpoint edr',
      }),
    )
    expect(answer.status, JSON.stringify(answer.body)).toBe(201)
    expect(answer.body.eventSource).toBe('endpoint edr')
  })

  it('stores it under the name the case document uses', async () => {
    await ask(
      `/cases/${caseId()}/timeline`,
      asClient({
        kind: 'event',
        description: 'Stored camel',
        time: '2026-08-14T09:00:00.000Z',
        eventSource: 'endpoint edr',
      }),
    )
    const rows = (await ask(`/cases/${caseId()}/timeline`)).body as unknown as Record<
      string,
      unknown
    >[]
    const made = rows.find((row) => row.description === 'Stored camel')
    expect(made).toBeDefined()
    expect(Object.keys(made ?? {}), 'a snake key landed beside the camel one').not.toContain(
      'event_source',
    )
  })
})

describe('a patch is judged, not applied', () => {
  const patchAs = (body: Record<string, unknown>): RequestInit => ({
    method: 'PATCH',
    body: JSON.stringify(toWire(body)),
  })
  const firstId = async (): Promise<string> => {
    const rows = (await ask(`/cases/${caseId()}/timeline`)).body as unknown as { id: string }[]
    return rows[0]?.id ?? ''
  }

  it('refuses one that empties a field the row must have', async () => {
    const answer = await ask(`/cases/${caseId()}/timeline/${await firstId()}`, patchAs({ description: '' }))
    expect(answer.status).toBe(422)
  })

  it('refuses a field the collection does not have', async () => {
    const answer = await ask(
      `/cases/${caseId()}/timeline/${await firstId()}`,
      patchAs({ wombat: 'anything at all' }),
    )
    expect(answer.status).toBe(422)
  })

  it('accepts a real edit', async () => {
    const answer = await ask(
      `/cases/${caseId()}/timeline/${await firstId()}`,
      patchAs({ description: 'Edited by the visitor' }),
    )
    expect(answer.status, JSON.stringify(answer.body)).toBe(200)
    expect(answer.body.description).toBe('Edited by the visitor')
  })
})

describe('a route answers at its own depth and no other', () => {
  it.each([
    ['/specs/anything/at/all'],
    ['/collections/whatever'],
    ['/about/deep/path'],
    ['/demos/1/2/3'],
    ['/health/activity'],
  ])('refuses %s', async (path) => {
    expect((await ask(path)).status).toBe(501)
  })

  it('still answers each of them bare', async () => {
    for (const path of ['/specs', '/collections', '/about', '/demos', '/health']) {
      expect((await ask(path)).status, path).toBe(200)
    }
  })
})

describe("a collection's own verbs are not row ids", () => {
  it('refuses a bulk edit rather than calling it a missing entry', async () => {
    const answer = await ask(`/cases/${caseId()}/timeline/bulk`, {
      method: 'PATCH',
      body: JSON.stringify({}),
    })
    expect(answer.status).toBe(501)
    expect(answer.body.message).toMatch(/demo/i)
  })
})
