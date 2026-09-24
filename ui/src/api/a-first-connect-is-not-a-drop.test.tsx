/**
 * A case socket opening for the first time is not a drop, whatever the case
 * answers while it opens.
 *
 * The real link over the demo's loopback socket, which opens on the next tick,
 * beside a query under the case that the install refuses, as the demo refuses
 * the case activity.
 */
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, expect, it } from 'vitest'

import { LoopbackSocket } from '@/demo/loopback'

import { setSocketFactory } from './caseSocket'
import { keys } from './queryKeys'
import { useCaseChanges } from './useCaseChanges'

afterEach(() => {
  setSocketFactory((url) => new WebSocket(url))
})

it('leaves the screen live when the socket opens and part of the case cannot be read', async () => {
  setSocketFactory((url) => new LoopbackSocket(url))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const { result } = renderHook(
    () => {
      useQuery({
        queryKey: keys.activity('C-1'),
        queryFn: () => Promise.reject(new Error('Not available in the demo')),
      })
      return useCaseChanges('C-1')
    },
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    },
  )

  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 400))
  })

  expect(
    result.current,
    'a screen that never lost its connection said it was not live',
  ).toMatchObject({ behind: false, failed: false })
})
