import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { keys } from './queryKeys'
import { setSession } from './session'
import type { SystemEntry } from './model'
import { useBulkPatch } from './useBulkPatch'

const CASE = 'DEMO-CAMPAIGN'
const listKey = keys.collection(CASE, 'systems')

const fetchMock = vi.fn<typeof fetch>()

function answer(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status })
}

function harness() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  setSession({ userId: 'u-analyst', username: 'analyst' })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useBulkPatch', () => {
  it('sends one PATCH to the bulk route, carrying every selected id and the changed fields', async () => {
    fetchMock.mockResolvedValue(answer(200, { updated: ['s1', 's4'], missing: [], refused: [] }))
    const { wrapper } = harness()
    const hook = renderHook(() => useBulkPatch(CASE, 'systems'), { wrapper })

    act(() => {
      hook.result.current.mutate({ ids: [{ id: 's1', version: 1 }, { id: 's4', version: 2 }], fields: { verdict: 'compromised' } })
    })
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true))

    // Exactly one call: the whole point of the route over `forEachRow`.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe(`/api/cases/${CASE}/systems/bulk`)
    expect(init?.method).toBe('PATCH')
    expect(JSON.parse(init?.body as string)).toEqual({
      ids: [{ id: 's1', version: 1 }, { id: 's4', version: 2 }],
      fields: { verdict: 'compromised' },
    })
  })

  it('reports missing ids without failing the call', async () => {
    fetchMock.mockResolvedValue(answer(200, { updated: ['s1'], missing: ['s4'], refused: [] }))
    const { wrapper } = harness()
    const hook = renderHook(() => useBulkPatch(CASE, 'systems'), { wrapper })

    act(() => {
      hook.result.current.mutate({ ids: [{ id: 's1', version: 1 }, { id: 's4', version: 2 }], fields: { verdict: 'clean' } })
    })
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true))
    expect(hook.result.current.data).toEqual({ updated: ['s1'], missing: ['s4'], refused: [] })
  })

  /**
   * **Refused is not missing, and the hook must not flatten them.** A missing
   * row is gone; a refused one is on screen holding somebody else's change.
   * An analyst told the wrong one of those looks in the wrong place.
   */
  it('reports refused ids without failing the call', async () => {
    fetchMock.mockResolvedValue(answer(200, { updated: ['s1'], missing: [], refused: ['s4'] }))
    const { wrapper } = harness()
    const hook = renderHook(() => useBulkPatch(CASE, 'systems'), { wrapper })

    act(() => {
      hook.result.current.mutate({
        ids: [
          { id: 's1', version: 1 },
          { id: 's4', version: 2 },
        ],
        fields: { verdict: 'clean' },
      })
    })
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true))
    expect(hook.result.current.data).toEqual({ updated: ['s1'], missing: [], refused: ['s4'] })
  })

  it('invalidates the collection and the case after settling', async () => {
    fetchMock.mockResolvedValue(answer(200, { updated: ['s1'], missing: [], refused: [] }))
    const { client, wrapper } = harness()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const hook = renderHook(() => useBulkPatch(CASE, 'systems'), { wrapper })

    act(() => {
      hook.result.current.mutate({ ids: [{ id: 's1', version: 1 }], fields: { verdict: 'clean' } })
    })
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true))

    const invalidated = invalidate.mock.calls.map(([options]) => JSON.stringify(options?.queryKey))
    expect(invalidated).toContain(JSON.stringify(listKey))
    expect(invalidated).toContain(JSON.stringify(keys.case(CASE)))
  })

  it('rejects the whole call on a bad field value, all-or-nothing', async () => {
    fetchMock.mockResolvedValue(answer(422, { error: 'That value is not allowed.' }))
    const { wrapper } = harness()
    const hook = renderHook(() => useBulkPatch(CASE, 'systems'), { wrapper })

    act(() => {
      // **Cast because the value is the point.** The vocabulary is a union
      // now that the row types come from the server, so an invalid verdict
      // cannot be written without one - and a test that could not express
      // a bad value could not assert that the server refuses it.
      hook.result.current.mutate({
        ids: [{ id: 's1', version: 1 }, { id: 's2', version: 3 }],
        fields: { verdict: 'not-a-verdict' as SystemEntry['verdict'] },
      })
    })
    await waitFor(() => expect(hook.result.current.isError).toBe(true))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
