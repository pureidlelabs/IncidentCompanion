import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setSession } from './session'
import { useBulkPatch } from './useBulkPatch'
import { useEntryMutation } from './useEntryMutation'
import { usePendingEntryIds } from './usePendingEntryIds'

const CASE = 'DEMO-CAMPAIGN'

const fetchMock = vi.fn<typeof fetch>()

function harness() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}

/** Never resolves, so the mutation stays `pending` for the assertion. */
function stall(): Promise<Response> {
  return new Promise<Response>(() => undefined)
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  setSession({ userId: 'u-analyst', username: 'analyst' })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('usePendingEntryIds', () => {
  it('names the one row a single PATCH is writing', async () => {
    fetchMock.mockReturnValue(stall())
    const { wrapper } = harness()
    const patch = renderHook(() => useEntryMutation(CASE, 'systems'), { wrapper })
    const pending = renderHook(() => usePendingEntryIds(CASE, 'systems'), { wrapper })

    act(() => {
      patch.result.current.mutate({ entryId: 's1', version: 1, fields: { verdict: 'clean' } })
    })

    await waitFor(() => {
      pending.rerender()
      expect(pending.result.current.writing.has('s1')).toBe(true)
    })
    expect(pending.result.current.writing.size).toBe(1)
  })

  it('names every row a bulk PATCH is writing, not one', async () => {
    fetchMock.mockReturnValue(stall())
    const { wrapper } = harness()
    const bulk = renderHook(() => useBulkPatch(CASE, 'systems'), { wrapper })
    const pending = renderHook(() => usePendingEntryIds(CASE, 'systems'), { wrapper })

    act(() => {
      bulk.result.current.mutate({ ids: ['s1', 's2', 's3'], fields: { verdict: 'clean' } })
    })

    await waitFor(() => {
      pending.rerender()
      expect(pending.result.current.writing.size).toBe(3)
    })
    expect([...pending.result.current.writing].sort()).toEqual(['s1', 's2', 's3'])
  })
})
