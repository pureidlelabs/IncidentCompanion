/**
 * A refused import reaches the analyst once, as a toast, and nowhere else.
 *
 * What jsdom holds: the container voids the announced promise, so a refusal
 * that reached `written.added` would be an unhandled rejection, which vitest
 * fails the run on. What it cannot see is the toast's drawing.
 */
import { render, screen, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/api/client'
import { toastQueue } from '@/components/blocks/notify'

const importCsv = vi.fn()

vi.mock('@/app/useCaseId', () => ({ useCaseId: () => 'case-1' }))
vi.mock('@/api/case', () => ({ useCase: () => ({ data: undefined }) }))
vi.mock('@/api/specs', () => ({ useSpecs: () => ({ data: undefined }) }))
vi.mock('@/api/useImportCsv', () => ({
  useImportCsv: () => ({ mutateAsync: importCsv, isPending: false }),
}))
vi.mock('@/screens/import-data', () => ({
  ImportDataScreen: ({
    onImport,
    result,
  }: {
    onImport: (collection: string, file: File) => void
    result?: unknown
  }) => {
    useEffect(() => {
      onImport('accounts', new File(['a,b\n'], 'accounts.csv', { type: 'text/csv' }))
      // The screen is a stub: the press is the whole of what it does.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    return <p>{result === undefined ? 'no result' : 'a result'}</p>
  },
}))

import { ImportDataContainer } from './ImportDataContainer'

beforeEach(() => {
  toastQueue.clear()
  importCsv.mockReset()
})

describe('an import the server refuses', () => {
  it('is announced once and leaves the screen without a result', async () => {
    importCsv.mockRejectedValue(new ApiError(501, 'Not available in the demo', null))
    render(<ImportDataContainer />)
    await waitFor(() => {
      expect(toastQueue.visibleToasts).toHaveLength(1)
    })
    expect(screen.getByText('no result')).toBeInTheDocument()
  })

  it('hands a written count to the screen where the server took the file', async () => {
    importCsv.mockResolvedValue({ added: 2, skipped: 0, replaced: 0, refused: [] })
    render(<ImportDataContainer />)
    await waitFor(() => {
      expect(screen.getByText('a result')).toBeInTheDocument()
    })
    expect(toastQueue.visibleToasts).toHaveLength(0)
  })
})
