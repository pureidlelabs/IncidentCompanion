/**
 * **What changed while the socket was away reaches the screen** -- the second
 * clause of `live`'s reconnect scenario, and the one that was not met:
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type * as caseSocket from './caseSocket'
import { keys } from './queryKeys'
import { useCaseChanges } from './useCaseChanges'

/** The watchers the hook registers, so a test can drive the connection. */
const watchers = new Set<(up: boolean) => void>()

const link = {
  send: () => {
    /* nothing reads it back */
  },
  subscribe: () => () => {
    /* this file drives the connection, never a message */
  },
  onConnected: (listener: (up: boolean) => void) => {
    watchers.add(listener)
    // The real link reports the current state on registration, and it is
    // connected by the time a screen mounts.
    listener(true)
    return () => {
      watchers.delete(listener)
    }
  },
}

vi.mock('./caseSocket', async (importOriginal) => ({
  ...(await importOriginal<typeof caseSocket>()),
  acquireLink: () => link,
  releaseLink: () => {
    /* the stub link is shared */
  },
}))

const drop = () => {
  for (const watch of [...watchers]) watch(false)
}
const restore = () => {
  for (const watch of [...watchers]) watch(true)
}

function Screen({ caseId }: { caseId: string }): ReactNode {
  useCaseChanges(caseId)
  return null
}

function mount(client: QueryClient, caseId = 'C-1') {
  return render(
    <QueryClientProvider client={client}>
      <Screen caseId={caseId} />
    </QueryClientProvider>,
  )
}

/**
 * **Unmounted explicitly, and this file is why that line exists.**
 */
afterEach(() => {
  cleanup()
  watchers.clear()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('a reconnect re-reads the case', () => {
  it('invalidates nothing while the socket simply stays up', () => {
    vi.useFakeTimers()
    const client = new QueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    mount(client)
    vi.advanceTimersByTime(500)

    expect(
      invalidate,
      'opening a case refetched everything before a single write happened',
    ).not.toHaveBeenCalled()
  })

  /**
   * **The widest answer, because it is the only honest one.**
   */
  it('re-reads the whole case after the socket drops and returns', () => {
    vi.useFakeTimers()
    const client = new QueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    mount(client)
    invalidate.mockClear()

    drop()
    restore()
    vi.advanceTimersByTime(500)

    expect(invalidate, 'nothing was re-read, so the screen keeps its pre-drop rows').toHaveBeenCalled()
    const keysAsked = invalidate.mock.calls.map(([one]) => JSON.stringify(one?.queryKey))
    expect(keysAsked).toContain(JSON.stringify(keys.case('C-1')))
  })

  /** A drop with no return leaves the screen alone rather than thrashing it. */
  it('does not re-read while the socket is still down', () => {
    vi.useFakeTimers()
    const client = new QueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    mount(client)
    invalidate.mockClear()

    drop()
    vi.advanceTimersByTime(500)

    expect(invalidate).not.toHaveBeenCalled()
  })
})
