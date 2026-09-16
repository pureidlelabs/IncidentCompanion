/**
 * The rows are the tables `GET /api/collections` marks batch-creatable.
 *
 * The pair is chosen against any client list: `report_blocks` is served as
 * taking a batch, which no hand-written list ever held, and `accounts` as
 * refusing one, which every list held. A screen reading its own names draws
 * exactly the opposite pair.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setSession } from '@/api/session'

import type * as SpecsModule from '@/api/specs'

vi.mock('@/app/useCaseId', () => ({ useCaseId: () => 'case-1' }))
vi.mock('@/api/case', () => ({ useCase: () => ({ data: undefined }) }))
vi.mock('@/api/specs', async (importOriginal) => ({
  ...(await importOriginal<typeof SpecsModule>()),
  useSpecs: () => ({ data: undefined }),
}))
vi.mock('@/api/useImportCsv', () => ({
  useImportCsv: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

import { ImportDataContainer } from './ImportDataContainer'

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockResolvedValue(
    new Response(
      JSON.stringify({
        report_blocks: { fields: ['body'], batch_create: true },
        accounts: { fields: ['accountName'], batch_create: false },
      }),
      { status: 200 },
    ),
  )
  vi.stubGlobal('fetch', fetchMock)
  setSession({ userId: 'u-analyst', username: 'analyst' })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function draw() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  render(<ImportDataContainer />, { wrapper })
}

describe('the tables the import screen offers', () => {
  it('are the ones the route marks batch-creatable', async () => {
    draw()

    await waitFor(() => {
      expect(screen.getByText('Report blocks')).toBeInTheDocument()
    })
    expect(screen.queryByText('Accounts')).not.toBeInTheDocument()
  })
})
