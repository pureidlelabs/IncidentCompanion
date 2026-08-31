import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useCollections } from './collections'
import { setSession } from './session'

const fetchMock = vi.fn<typeof fetch>()

function harness() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return renderHook(() => useCollections(), { wrapper })
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  setSession({ userId: 'u-analyst', username: 'analyst' })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useCollections', () => {
  it('keeps the collection name as the wire spells it, never camelised', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          network_indicators: { fields: ['ip'], batch_create: true },
          evidence: { fields: ['name'], batch_create: false },
        }),
        { status: 200 },
      ),
    )
    const hook = harness()
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true))

    // A recursive camelisation would rewrite this key to `networkIndicators`,
    // a table the API has never heard of.
    expect(hook.result.current.data?.network_indicators).toEqual({
      fields: ['ip'],
      batchCreate: true,
    })
    expect(hook.result.current.data?.evidence?.batchCreate).toBe(false)
  })
})
