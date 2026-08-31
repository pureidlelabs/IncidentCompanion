import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { TimelineEntry } from './model'
import { keys } from './queryKeys'
import { setSession } from './session'
import { useEntryMutation } from './useEntryMutation'

const CASE = 'DEMO-CAMPAIGN'
const listKey = keys.collection(CASE, 'timeline')

function row(id: string, description: string): TimelineEntry {
  return { id, description } as TimelineEntry
}

const fetchMock = vi.fn<typeof fetch>()

function harness() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  client.setQueryData(listKey, [row('e1', 'before'), row('e2', 'untouched')])
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const hook = renderHook(() => useEntryMutation(CASE, 'timeline'), { wrapper })
  return { client, hook }
}

function rows(client: QueryClient): TimelineEntry[] {
  return client.getQueryData<TimelineEntry[]>(listKey) ?? []
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  setSession({ userId: 'u-analyst', username: 'analyst' })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the per-row mutation helper', () => {
  it('applies the edit to the cache before the request resolves', async () => {
    let release: (value: Response) => void = () => undefined
    fetchMock.mockReturnValue(
      new Promise<Response>((resolve) => {
        release = resolve
      }),
    )
    const { client, hook } = harness()

    act(() => {
      hook.result.current.mutate({ entryId: 'e1', version: 1, fields: { description: 'after' } })
    })

    await waitFor(() => expect(rows(client)[0]?.description).toBe('after'))
    // The other row is untouched: an optimistic write that replaced the list
    // would lose a concurrent edit and still pass an assertion on row one.
    expect(rows(client)[1]?.description).toBe('untouched')

    act(() => {
      release(new Response(JSON.stringify({ id: 'e1' }), { status: 200 }))
    })
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true))
  })

  it('rolls the cache back when the write is refused', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'read-only' }), { status: 403 }),
    )
    const { client, hook } = harness()

    act(() => {
      hook.result.current.mutate({ entryId: 'e1', version: 1, fields: { description: 'after' } })
    })

    await waitFor(() => expect(hook.result.current.isError).toBe(true))
    expect(rows(client)[0]?.description).toBe('before')
    expect(hook.result.current.error?.status).toBe(403)
  })

  it('PATCHes the one row, carrying only the changed field', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 'e1' }), { status: 200 }))
    const { hook } = harness()

    act(() => {
      hook.result.current.mutate({ entryId: 'e1', version: 3, fields: { description: 'after' } })
    })
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true))

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('/api/cases/DEMO-CAMPAIGN/timeline/e1')
    expect(init?.method).toBe('PATCH')
    // The whole row would also succeed against the API, and would write every
    // field the analyst did not touch.
    expect(JSON.parse(init?.body as string)).toEqual({ version: 3, description: 'after' })
  })

  /**
   * **The write the server refuses without it.** `entities.controller`'s
   * `update` reads `version` off the body and answers *"A patch has to name
   * the version it read."* with a 400 before it looks at a single field, so a
   * patch without one is not a weaker write - it is no write at all.
   *
   * Measured against the running Node stack, 2026-08-10: editing an impact
   * row's label sent `{"label":"..."}`, took a 400, and the row was unchanged on
   * reload. Every collection's pencil was in that state.
   */
  it('names the version the analyst read, which the server refuses to write without', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 'e1' }), { status: 200 }))
    const { hook } = harness()

    act(() => {
      hook.result.current.mutate({ entryId: 'e1', version: 7, fields: { description: 'after' } })
    })
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true))

    const body = JSON.parse(fetchMock.mock.calls[0]![1]?.body as string) as Record<string, unknown>
    expect(body.version).toBe(7)
  })

  /**
   * **`base` is what the form was rendered from, and it rides beside the patch
   * rather than in it.** The server has no copy of what the analyst was
   * looking at - the per-session case object went with the whole-case lock -
   * so without it a refusal cannot tell "we both edited this field" from "the
   * row moved underneath me", and the merge review names every patched field
   * instead of the one in dispute.
   */
  it('sends the values the form was rendered from, so a refusal can name the field in dispute', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 'e1' }), { status: 200 }))
    const { hook } = harness()

    act(() => {
      hook.result.current.mutate({
        entryId: 'e1',
        version: 2,
        base: { description: 'before' },
        fields: { description: 'after' },
      })
    })
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true))

    const body = JSON.parse(fetchMock.mock.calls[0]![1]?.body as string) as Record<string, unknown>
    expect(body.base).toEqual({ description: 'before' })
    // Beside the patch, not inside it: `.strict()` refuses an unknown column.
    expect(body.description).toBe('after')
  })

  it('invalidates the list and the case after a successful write', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 'e1' }), { status: 200 }))
    const { client, hook } = harness()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    act(() => {
      hook.result.current.mutate({ entryId: 'e1', version: 1, fields: { description: 'after' } })
    })
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true))

    const invalidated = invalidate.mock.calls.map(([options]) =>
      JSON.stringify(options?.queryKey),
    )
    expect(invalidated).toContain(JSON.stringify(listKey))
    expect(invalidated).toContain(JSON.stringify(keys.case(CASE)))
  })
})
