/**
 * The reorder helper, at the level each of its two claims can actually be seen.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ReportBlock } from './model'
import { keys } from './queryKeys'
import { setSession } from './session'
import { moveWithin, resequence, useEntryReorder } from './useEntryReorder'

const CASE = 'DEMO-CAMPAIGN'
const listKey = keys.collection(CASE, 'report_blocks')

const id = (name: string) => ({ id: name })

function block(name: string, position: number): ReportBlock {
  return { id: name, position } as ReportBlock
}

const fetchMock = vi.fn<typeof fetch>()

function harness() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  client.setQueryData(listKey, [block('a', 0), block('b', 1), block('c', 2)])
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const hook = renderHook(() => useEntryReorder(CASE, 'report_blocks'), { wrapper })
  return { client, hook }
}

function rows(client: QueryClient): ReportBlock[] {
  return client.getQueryData<ReportBlock[]>(listKey) ?? []
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  setSession({ userId: 'u-analyst', username: 'analyst' })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('reordering a table', () => {
  it('renumbers positions, not just the array', () => {
    // The server rewrites positions to 0..n-1 from the list it is given. An
    // optimistic list that only reordered the array would carry the old
    // numbers, and the next render - which sorts by position - puts it back.
    let release: (value: Response) => void = () => undefined
    fetchMock.mockReturnValue(
      new Promise<Response>((resolve) => {
        release = resolve
      }),
    )
    const { client, hook } = harness()

    act(() => {
      hook.result.current.mutate({ ids: ['c', 'a', 'b'] })
    })

    return waitFor(() => {
      expect(rows(client).map((row) => [row.id, row.position])).toEqual([
        ['c', 0],
        ['a', 1],
        ['b', 2],
      ])
    }).then(() => {
      act(() => {
        release(new Response(JSON.stringify({ ids: ['c', 'a', 'b'] }), { status: 200 }))
      })
    })
  })

  it('puts the whole order back when the API refuses it', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'not every id listed' }), { status: 422 }),
    )
    const { client, hook } = harness()

    act(() => {
      hook.result.current.mutate({ ids: ['c', 'a', 'b'] })
    })
    await waitFor(() => expect(hook.result.current.isError).toBe(true))

    expect(rows(client).map((row) => row.id)).toEqual(['a', 'b', 'c'])
    expect(rows(client).map((row) => row.position)).toEqual([0, 1, 2])
  })

  it('renumbers every row it is given the full list for', () => {
    const table = [block('a', 0), block('b', 1), block('c', 2)]
    expect(resequence(table, ['c', 'a', 'b']).map((row) => [row.id, row.position])).toEqual(
      [
        ['c', 0],
        ['a', 1],
        ['b', 2],
      ],
    )
  })

  /**
   * `reports` is ordered by its place in the list (`case_api.LIST_ORDERED`) and
   * has no `position` at all.
   *
   * Asserted on `resequence` for the reason the two above are: through the hook
   * the cache is read before `onMutate` has touched it.
   */
  it('adds no position to a table that is ordered by its list', () => {
    const listed = [{ id: 'a', label: 'first' }, { id: 'b', label: 'second' }]

    const after = resequence(listed, ['b', 'a'])

    expect(after.map((row) => row.id)).toEqual(['b', 'a'])
    for (const row of after) expect(row).not.toHaveProperty('position')
  })
})

describe('composing a reorder', () => {
  it('names the moved block\'s own report and nothing else', () => {
    // A payload carrying the whole case's blocks spans both reports.
    // `report_blocks` declares `orderWithin: 'reportId'`, so the route refuses
    // a list spanning two of them - 422 on the scope check, or 409 first where
    // either report has been sent. Every screen with a second report is
    // refused, and the demo case hides it by holding one.
    const peers = ['a1', 'a2', 'a3'].map(id)

    expect(moveWithin(peers, 'a1', 1)).toEqual(['a2', 'a1', 'a3'])
  })

  it('refuses a move off either end rather than clamping it', () => {
    // A clamped move would POST an order identical to the stored one: an undo
    // frame, a refetch and a write for a button press that did nothing.
    const table = ['a', 'b'].map(id)
    expect(moveWithin(table, 'a', -1)).toBeNull()
    expect(moveWithin(table, 'b', 1)).toBeNull()
  })

  it('refuses an id that is not in the slice', () => {
    expect(moveWithin([id('a')], 'zzz', 1)).toBeNull()
  })
})

describe('resequencing a cache that holds more than the reorder named', () => {
  // `useCollection` is per case, so the cached list is every report's blocks
  // while a reorder names one report's. Optimism has to reach into that list
  // rather than replace it.

  it('reorders the named rows and leaves the rest at their own slots', () => {
    const rows = [block('a1', 0), block('b1', 0), block('a2', 1), block('b2', 1)]

    const after = resequence(rows, ['a2', 'a1'])

    expect(after.map((row) => row.id)).toEqual(['a2', 'b1', 'a1', 'b2'])
  })

  it('numbers the moved rows within their own report, not within the cache', () => {
    // The server writes the index in the list it was posted, so an optimistic
    // row stamped with its index in the whole case shows the new order and
    // then jumps back on the refetch, which sorts by `position`.
    const rows = [block('a1', 0), block('b1', 0), block('a2', 1), block('b2', 1)]

    const after = resequence(rows, ['a2', 'a1'])

    expect(after.filter((row) => ['a1', 'a2'].includes(row.id))).toEqual([
      { id: 'a2', position: 0 },
      { id: 'a1', position: 1 },
    ])
  })

  it('leaves the other report\'s positions untouched', () => {
    const rows = [block('a1', 0), block('b1', 7), block('a2', 1), block('b2', 9)]

    const after = resequence(rows, ['a2', 'a1'])

    expect(after.filter((row) => row.id.startsWith('b'))).toEqual([
      { id: 'b1', position: 7 },
      { id: 'b2', position: 9 },
    ])
  })

  /**
   * A row created by another analyst since the screen read the list.
   *
   * Asserted on `resequence` rather than through the hook, because through the
   * hook it cannot be seen: `onMutate` awaits `cancelQueries` before touching
   * the cache, so an assertion made straight after `mutate()` reads it
   * untouched and passes whichever branch is taken. Deleting the guard left
   * that version of this test green.
   */
  it('changes nothing when an id names no cached row', () => {
    const rows = [block('a1', 0), block('a2', 1)]

    expect(resequence(rows, ['a2', 'zzz'])).toBe(rows)
  })
})
