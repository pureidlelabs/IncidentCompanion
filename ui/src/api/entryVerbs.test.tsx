import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Case, TimelineEntry } from './model'
import { keys } from './queryKeys'
import { setSession } from './session'
import { useCaseMutation } from './useCaseMutation'
import { drawn } from './rowWrite'
import { useEntryCreate } from './useEntryCreate'
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

const at = (version: number) => drawn({ version }).version

/** A request that stays out until the test answers it. */
function held(): (value: Response) => void {
  let answer: (value: Response) => void = () => undefined
  fetchMock.mockReturnValue(
    new Promise<Response>((resolve) => {
      answer = resolve
    }),
  )
  return (value) => {
    answer(value)
  }
}

describe('adding an entry', () => {
  it('POSTs only the fields given, and draws nothing before the answer', async () => {
    const answer = held()
    const { client, hook } = harness(() => useEntryCreate(CASE, 'timeline'))

    act(() => {
      hook.result.current.mutate({ fields: { description: 'third' } })
    })

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(rows(client).map((r) => r.id)).toEqual(['e1', 'e2'])
    answer(ok({ id: 'server-id' }))

    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true))
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('/api/cases/DEMO-CAMPAIGN/timeline')
    expect(init?.method).toBe('POST')
    expect(sentBody(init)).toEqual({ description: 'third' })
  })
})

describe('deleting an entry', () => {
  it('DELETEs that one row with the version it read, and leaves it drawn until the answer', async () => {
    const answer = held()
    const { client, hook } = harness(() => useEntryDelete(CASE, 'timeline'))

    act(() => {
      hook.result.current.mutate({ entryId: 'e1', version: at(1) })
    })

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(rows(client).map((r) => r.id)).toEqual(['e1', 'e2'])
    answer(new Response(null, { status: 200 }))

    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true))
    const [url, init] = fetchMock.mock.calls[0]!
    // **The version rides in the query, not a body.** A DELETE with a body
    // is dropped by enough of the stack that the route reads it off the URL,
    // and without one the server refuses the delete outright.
    expect(url).toBe('/api/cases/DEMO-CAMPAIGN/timeline/e1?version=1')
    expect(init?.method).toBe('DELETE')
  })
})

describe('changing the case itself', () => {
  it('PATCHes the case route with the version it read, and draws nothing before the answer', async () => {
    const answer = held()
    const { client, hook } = harness(() => useCaseMutation(CASE), (c) => {
      c.setQueryData(caseKey, caseFixture('before'))
    })

    act(() => {
      hook.result.current.mutate({ version: at(1), fields: { title: 'after' } })
    })

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(client.getQueryData<Case>(caseKey)?.title).toBe('before')
    answer(ok({ id: CASE, version: 2, title: 'after' }))
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true))

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('/api/cases/DEMO-CAMPAIGN')
    expect(init?.method).toBe('PATCH')
    // **The version is part of the body the server accepts.** A patch without
    // the version it read answers 422, so an expectation omitting it would
    // certify a write the route refuses.
    expect(sentBody(init)).toEqual({ version: 1, title: 'after' })
  })

  it('refreshes the case list too, because the picker row is derived from these fields', async () => {
    fetchMock.mockResolvedValue(ok({ id: CASE, version: 2 }))
    const { client, hook } = harness(() => useCaseMutation(CASE))
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    act(() => {
      hook.result.current.mutate({ version: at(1), fields: { status: 'closed' } })
    })
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true))

    const invalidated = invalidate.mock.calls.map(([o]) => JSON.stringify(o?.queryKey))
    expect(invalidated).toContain(JSON.stringify(keys.cases()))
  })
})
