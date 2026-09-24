/**
 * The reorder helper, at the level each of its two claims can actually be seen.
 *
 * Both are here rather than in the screen test, and a break-verify is why:
 *
 * - **The rollback is invisible from the screen.** `onSettled` invalidates and
 *   refetches on failure as well as success, and the server answers with the
 *   order that was never changed - so deleting `onError` outright leaves the
 *   screen test green, restored by the refetch instead of by the rollback.
 *   Here the query has no mounted observer, so an invalidation refetches
 *   nothing and the cache shows which mechanism put it back.
 * - **The full-table composition is invisible in the demo case.** It holds one
 *   report, so the blocks on screen *are* the whole table and a helper sending
 *   only the visible slice is indistinguishable from a correct one. The
 *   two-report case exists only here.
 */

import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Case, ReportBlock } from './model'
import { keys } from './queryKeys'
import { setSession } from './session'
import { moveWithin, resequence, useEntryReorder } from './useEntryReorder'

const CASE = 'DEMO-CAMPAIGN'
const listKey = keys.collection(CASE, 'report_blocks')

const id = (name: string) => ({ id: name })

function block(name: string, position: number): ReportBlock {
  return { id: name, position } as ReportBlock
}

/** A block as the screen holds it after reading it, at the version it was read at. */
function held(name: string, position: number): ReportBlock {
  return { id: name, position, version: position + 3 } as ReportBlock
}

const fetchMock = vi.fn<typeof fetch>()

/** What the route answers moving `c` to the top of a, b, c held at versions 3, 4, 5. */
const ANSWERED = JSON.stringify({
  rows: [
    { id: 'c', version: 6 },
    { id: 'a', version: 4 },
    { id: 'b', version: 5 },
  ],
})

function harness() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  client.setQueryData(listKey, [held('a', 0), held('b', 1), held('c', 2)])
  client.setQueryData<Case>(keys.case(CASE), { reportBlocks: [held('a', 0), held('b', 1), held('c', 2)] } as Case)
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
        release(new Response(ANSWERED, { status: 200 }))
      })
    })
  })

  it('moves the section in the case document before the request resolves', async () => {
    let release: (value: Response) => void = () => undefined
    fetchMock.mockReturnValue(
      new Promise<Response>((resolve) => {
        release = resolve
      }),
    )
    const { client, hook } = harness()
    const onScreen = () =>
      (client.getQueryData<Case>(keys.case(CASE))?.reportBlocks ?? []).map((one) => one.id)

    act(() => {
      hook.result.current.mutate({ ids: ['c', 'a', 'b'] })
    })

    await waitFor(() => expect(onScreen()).toEqual(['c', 'a', 'b']))
    act(() => {
      release(new Response(ANSWERED, { status: 200 }))
    })
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true))
  })

  it('sends each row with the version the screen read it at', async () => {
    fetchMock.mockResolvedValue(new Response(ANSWERED, { status: 200 }))
    const { hook } = harness()

    act(() => {
      hook.result.current.mutate({ ids: ['c', 'a', 'b'] })
    })
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true))

    const init = fetchMock.mock.calls[0]?.[1]
    expect(JSON.parse(init?.body as string)).toEqual({
      rows: [
        { id: 'c', version: 5 },
        { id: 'a', version: 3 },
        { id: 'b', version: 4 },
      ],
    })
  })

  it('puts the whole order back when a row moved since it was read', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: 'One of those changed since you read it.', refused: ['a'] }), {
        status: 409,
      }),
    )
    const { client, hook } = harness()

    act(() => {
      hook.result.current.mutate({ ids: ['c', 'a', 'b'] })
    })
    await waitFor(() => expect(hook.result.current.isError).toBe(true))

    expect(hook.result.current.error?.status).toBe(409)
    expect(rows(client).map((row) => [row.id, row.position])).toEqual([
      ['a', 0],
      ['b', 1],
      ['c', 2],
    ])
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
   * A collection the server orders by something else has no `position` at all.
   * Stamping one invents a field the server never returns, so it survives
   * exactly until the refetch - and anything that started reading it would work
   * optimistically and break on the round trip. The array order is the whole
   * optimistic answer for such a table, and it is what the screen renders.
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

/**
 * One analyst moving a section twice, against a server that keeps the route's
 * rule: a moved row's version goes up, and a stale version is refused whole.
 * The case document is observed by the screen and refetches slowly, as the
 * real one does.
 */
describe('moving a section twice', () => {
  function twice() {
    const stored = new Map([held('a', 0), held('b', 1), held('c', 2)].map((row) => [row.id, row]))
    const answers: number[] = []
    fetchMock.mockImplementation(async (_url, init) => {
      if (init?.method !== 'POST') {
        await new Promise((wake) => setTimeout(wake, 150))
        return new Response(JSON.stringify({ reportBlocks: [...stored.values()] }), { status: 200 })
      }
      const body = JSON.parse(init.body as string) as { rows: { id: string; version: number }[] }
      await new Promise((wake) => setTimeout(wake, 20))
      const refused = body.rows.filter((row) => stored.get(row.id)?.version !== row.version).map((row) => row.id)
      answers.push(refused.length ? 409 : 200)
      if (refused.length) return new Response(JSON.stringify({ refused }), { status: 409 })
      body.rows.forEach((row, at) => {
        const one = stored.get(row.id)!
        if (one.position !== at) stored.set(row.id, { ...one, position: at, version: one.version + 1 })
      })
      const written = body.rows.map((row) => ({ id: row.id, version: stored.get(row.id)!.version }))
      return new Response(JSON.stringify({ rows: written }), { status: 200 })
    })

    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    client.setQueryData<Case>(keys.case(CASE), { reportBlocks: [...stored.values()] } as Case)
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const hook = renderHook(
      () => {
        useQuery({
          queryKey: keys.case(CASE),
          queryFn: async () => (await fetch(`/api/cases/${CASE}`)).json() as Promise<Case>,
          staleTime: Infinity,
        })
        return useEntryReorder(CASE, 'report_blocks')
      },
      { wrapper },
    )
    const order = () => [...stored.values()].sort((x, y) => x.position - y.position).map((row) => row.id)
    return { hook, answers, order }
  }

  it('takes the second move once the first has landed', async () => {
    const { hook, answers, order } = twice()

    await act(async () => {
      await hook.result.current.mutateAsync({ ids: ['b', 'a', 'c'] })
    })
    await act(async () => {
      await new Promise((wake) => setTimeout(wake, 30))
      await hook.result.current.mutateAsync({ ids: ['b', 'c', 'a'] }).catch(() => undefined)
    })

    expect({ answers, order: order() }).toEqual({ answers: [200, 200], order: ['b', 'c', 'a'] })
  })

  it('takes the second move pressed while the first is still on its way', async () => {
    const { hook, answers, order } = twice()

    await act(async () => {
      const first = hook.result.current.mutateAsync({ ids: ['b', 'a', 'c'] })
      const second = hook.result.current.mutateAsync({ ids: ['b', 'c', 'a'] }).catch(() => undefined)
      await Promise.all([first, second])
    })

    expect({ answers, order: order() }).toEqual({ answers: [200, 200], order: ['b', 'c', 'a'] })
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
   * A row created by another analyst since the screen read the list. Placing
   * the rest anyway would drop the unnamed one off the screen until the
   * refetch, which reads as a delete rather than as a reorder.
   *
   * **This is what is left of "refuse a partial list".** That guard counted
   * the named rows against the cache, which was correct only while a reorder
   * named the whole table; a per-report reorder names fewer by design. The
   * property that survives is the narrower one - every id has to resolve.
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
