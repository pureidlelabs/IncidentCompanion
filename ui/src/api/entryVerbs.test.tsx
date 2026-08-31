import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Case, TimelineEntry } from './model'
import { keys } from './queryKeys'
import { setSession } from './session'
import { useCaseMutation } from './useCaseMutation'
import { isOptimisticId, useEntryCreate } from './useEntryCreate'
import { useEntryDelete } from './useEntryDelete'

const CASE = 'DEMO-CAMPAIGN'
const listKey = keys.collection(CASE, 'timeline')
const caseKey = keys.case(CASE)

function row(id: string, description: string): TimelineEntry {
  return { id, description } as TimelineEntry
}

const fetchMock = vi.fn<typeof fetch>()

function ok(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 })
}

function harness<T>(use: () => T, seed?: (client: QueryClient) => void) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  client.setQueryData(listKey, [row('e1', 'first'), row('e2', 'second')])
  seed?.(client)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, hook: renderHook(use, { wrapper }) }
}

/** The JSON a call was made with. `RequestInit['body']` is a union wide enough
 *  that a bare `String()` on it can produce "[object Object]". */
function sentBody(init: RequestInit | undefined): unknown {
  return typeof init?.body === 'string' ? JSON.parse(init.body) : null
}

function caseFixture(description: string): Case {
  return { id: CASE, title: description } as Case
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

describe('adding an entry', () => {
  it('appends optimistically and POSTs only the fields given', async () => {
    fetchMock.mockResolvedValue(ok({ id: 'server-id' }))
    const { client, hook } = harness(() => useEntryCreate(CASE, 'timeline'))

    act(() => {
      hook.result.current.mutate({ fields: { description: 'third' } })
    })

    await waitFor(() => expect(rows(client)).toHaveLength(3))
    // Appended, not prepended: `case_api.add_entry` puts it at the end, so a
    // row that lands at the top and then moves reads as the write moving it.
    expect(rows(client)[2]?.description).toBe('third')

    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true))
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('/api/cases/DEMO-CAMPAIGN/timeline')
    expect(init?.method).toBe('POST')
    expect(sentBody(init)).toEqual({ description: 'third' })
  })

  it('marks the placeholder id so nothing links to a row that does not exist', async () => {
    fetchMock.mockReturnValue(new Promise<Response>(() => undefined))
    const { client, hook } = harness(() => useEntryCreate(CASE, 'timeline'))

    act(() => {
      hook.result.current.mutate({ fields: { description: 'third' } })
    })

    await waitFor(() => expect(rows(client)).toHaveLength(3))
    expect(isOptimisticId(rows(client)[2]!.id)).toBe(true)
    expect(isOptimisticId('e1')).toBe(false)
  })

  it('takes the row back out when the write is refused', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'read-only' }), { status: 403 }),
    )
    const { client, hook } = harness(() => useEntryCreate(CASE, 'timeline'))

    act(() => {
      hook.result.current.mutate({ fields: { description: 'third' } })
    })

    await waitFor(() => expect(hook.result.current.isError).toBe(true))
    expect(rows(client)).toHaveLength(2)
    expect(hook.result.current.error?.status).toBe(403)
  })
})

describe('deleting an entry', () => {
  it('removes it optimistically and DELETEs that one row', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }))
    const { client, hook } = harness(() => useEntryDelete(CASE, 'timeline'))

    act(() => {
      hook.result.current.mutate({ entryId: 'e1', version: 1 })
    })

    await waitFor(() => expect(rows(client)).toHaveLength(1))
    expect(rows(client)[0]?.id).toBe('e2')

    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true))
    const [url, init] = fetchMock.mock.calls[0]!
    // **The version rides in the query, not a body.** A DELETE with a body
    // is dropped by enough of the stack that the route reads it off the URL,
    // and without one the server refuses the delete outright.
    expect(url).toBe('/api/cases/DEMO-CAMPAIGN/timeline/e1?version=1')
    expect(init?.method).toBe('DELETE')
  })

  it('puts it back when the write is refused', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'deleting needs a higher level' }), {
        status: 403,
      }),
    )
    const { client, hook } = harness(() => useEntryDelete(CASE, 'timeline'))

    act(() => {
      hook.result.current.mutate({ entryId: 'e1', version: 1 })
    })

    await waitFor(() => expect(hook.result.current.isError).toBe(true))
    expect(rows(client).map((r) => r.id)).toEqual(['e1', 'e2'])
  })
})

describe('changing the case itself', () => {
  it('merges optimistically and PATCHes the case route', async () => {
    fetchMock.mockResolvedValue(ok({ case_id: CASE }))
    const { client, hook } = harness(() => useCaseMutation(CASE), (c) => {
      c.setQueryData(caseKey, caseFixture('before'))
    })

    act(() => {
      hook.result.current.mutate({ version: 1, fields: { title: 'after' } })
    })

    await waitFor(() =>
      expect(client.getQueryData<Case>(caseKey)?.title).toBe('after'),
    )
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true))

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('/api/cases/DEMO-CAMPAIGN')
    expect(init?.method).toBe('PATCH')
    // **Re-anchored: this asserted the body the server refuses.** A patch
    // without the version it read answers 422, so the old expectation
    // certified the defect rather than the behaviour.
    expect(sentBody(init)).toEqual({ version: 1, title: 'after' })
  })

  it('rolls the case back when the write is refused', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'read-only' }), { status: 403 }),
    )
    const { client, hook } = harness(() => useCaseMutation(CASE), (c) => {
      c.setQueryData(caseKey, caseFixture('before'))
    })

    act(() => {
      hook.result.current.mutate({ version: 1, fields: { title: 'after' } })
    })

    await waitFor(() => expect(hook.result.current.isError).toBe(true))
    expect(client.getQueryData<Case>(caseKey)?.title).toBe('before')
  })

  it('refreshes the case list too, because the picker row is derived from these fields', async () => {
    fetchMock.mockResolvedValue(ok({ case_id: CASE }))
    const { client, hook } = harness(() => useCaseMutation(CASE))
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    act(() => {
      hook.result.current.mutate({ version: 1, fields: { status: 'closed' } })
    })
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true))

    const invalidated = invalidate.mock.calls.map(([o]) => JSON.stringify(o?.queryKey))
    expect(invalidated).toContain(JSON.stringify(keys.cases()))
  })
})
