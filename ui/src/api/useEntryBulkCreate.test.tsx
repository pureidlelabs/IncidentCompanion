import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { keys } from './queryKeys'
import { setSession } from './session'
import { useEntryBulkCreate } from './useEntryBulkCreate'

const CASE = 'DEMO-CAMPAIGN'
const listKey = keys.collection(CASE, 'systems')

const fetchMock = vi.fn<typeof fetch>()

function harness() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const hook = renderHook(() => useEntryBulkCreate(CASE, 'systems'), { wrapper })
  return { client, hook }
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  setSession({ userId: 'u-analyst', username: 'analyst' })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useEntryBulkCreate', () => {
  it('POSTs the rows wrapped as {entries}, to the /bulk route', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ids: ['s1', 's2'] }), { status: 200 }),
    )
    const { hook } = harness()

    act(() => {
      hook.result.current.mutate([{ hostname: 'PC-1' }, { hostname: 'PC-2' }])
    })
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true))

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('/api/cases/DEMO-CAMPAIGN/systems/bulk')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(init?.body as string)).toEqual({
      entries: [{ hostname: 'PC-1' }, { hostname: 'PC-2' }],
    })
  })

  it('surfaces a 422 as an ApiError rather than writing anything to the cache', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "row 2: SystemEntry has no field 'nope'" }), {
        status: 422,
      }),
    )
    const { client, hook } = harness()

    act(() => {
      hook.result.current.mutate([{ hostname: 'PC-1' }, { nope: 'x' }])
    })
    await waitFor(() => expect(hook.result.current.isError).toBe(true))

    expect(hook.result.current.error?.message).toBe("row 2: SystemEntry has no field 'nope'")
    expect(client.getQueryData(listKey)).toBeUndefined()
  })

  it('invalidates the collection and the case on success', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ids: ['s1'] }), { status: 200 }))
    const { client, hook } = harness()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    act(() => {
      hook.result.current.mutate([{ hostname: 'PC-1' }])
    })
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true))

    const invalidated = invalidate.mock.calls.map(([options]) => JSON.stringify(options?.queryKey))
    expect(invalidated).toContain(JSON.stringify(listKey))
    expect(invalidated).toContain(JSON.stringify(keys.case(CASE)))
  })
})
