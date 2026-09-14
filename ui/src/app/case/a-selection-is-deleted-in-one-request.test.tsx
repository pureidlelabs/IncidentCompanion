/**
 * **A selection spanning tables is deleted in one request.**
 *
 * `useBulkDelete`'s own docstring says why a loop cannot work: malware names a
 * system, so a loop deleting the asset first is refused and one deleting the
 * malware first is not -- the outcome depends on the order the client happened
 * to send. The route counts references against what survives the call, which
 * no client-side loop can express. The hook was written and called by nothing.
 * -> #665
 *
 * **Two things followed from the loop.** A selection half-deleted, stopping at
 * the first refusal with the rest already gone; and the confirm dialog's line
 * about rows still referenced could never draw, because it reads a 409 body
 * only the bulk route produces.
 *
 * **What this does not cover:** what the route counts as a reference, which is
 * the server's and is #637.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Case } from '@/api/model'
import type * as SpecsModuleShape from '@/api/specs'

type SpecsModule = typeof SpecsModuleShape

const CASE = '33333333-3333-4333-8333-333333333333'

/** Every request the container made, in order. */
const sent = vi.hoisted(() => ({
  calls: [] as { path: string; body: unknown }[],
}))
/** What the screen was handed, so the delete door can be pressed. */
const held = vi.hoisted(() => ({ props: null as Record<string, unknown> | null }))

vi.mock('@/app/useCaseId', () => ({ useCaseId: () => CASE }))
// `request` takes the body as an object and serialises it itself, so this
// records what the call site handed over rather than a JSON string.
vi.mock('@/api/client', () => ({
  request: (path: string, init?: { body?: unknown }) => {
    sent.calls.push({ path, body: init?.body })
    return Promise.resolve({ deleted: [], missing: [] })
  },
}))
vi.mock('@/api/case', () => ({
  useCase: () => ({
    data: {
      id: CASE,
      systems: [{ id: 'sys-1', version: 1, hostname: 'WKS-1' }],
      malware: [{ id: 'mal-1', version: 1, filename: 'evil.exe' }],
      accounts: [],
      networkIndicators: [],
      cloudApps: [],
    } as unknown as Case,
    isPending: false,
    error: null,
    refetch: vi.fn(),
  }),
}))
vi.mock('@/api/specs', async () => {
  const real = await vi.importActual<SpecsModule>('@/api/specs')
  return { ...real, useSpecs: () => ({ data: undefined, isPending: false }) }
})
vi.mock('@/screens/entities', () => ({
  EntitiesScreen: (props: Record<string, unknown>) => {
    held.props = props
    return null
  },
}))

const { EntitiesContainer } = await import('./EntitiesContainer')

interface Writes {
  remove: (rows: readonly { collection: string; id: string; version: number }[]) => Promise<void>
}

const draw = async () => {
  // A client, because the delete path invalidates the case on it.
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <EntitiesContainer />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  await waitFor(() => {
    expect(held.props).not.toBeNull()
  })
  return (held.props as { writes: Writes }).writes
}

beforeEach(() => {
  sent.calls.length = 0
  held.props = null
})

describe('deleting a selection that spans tables', () => {
  it('is one request, not one per row', async () => {
    const writes = await draw()

    await writes.remove([
      { collection: 'systems', id: 'sys-1', version: 1 },
      { collection: 'malware', id: 'mal-1', version: 1 },
    ])

    expect(
      sent.calls.length,
      'the selection went as a request per row, so the order the client happened to send ' +
        'decides whether the reference check refuses it',
    ).toBe(1)
  })

  it('names the bulk route, with the rows grouped by their collection', async () => {
    const writes = await draw()

    await writes.remove([
      { collection: 'systems', id: 'sys-1', version: 1 },
      { collection: 'malware', id: 'mal-1', version: 1 },
    ])

    const only = sent.calls[0]
    expect(only?.path).toContain('bulk-delete')
    // **Pairs, not a map keyed by the collection.** The server camelCases
    // every key of a request body, so `network_indicators` as a key arrives
    // as `networkIndicators` and is refused by the enum.
    expect((only?.body as { targets?: unknown[] }).targets).toEqual([
      { collection: 'systems', ids: ['sys-1'] },
      { collection: 'malware', ids: ['mal-1'] },
    ])
  })

  it('sends nothing at all for an empty selection', async () => {
    const writes = await draw()

    await writes.remove([])

    expect(sent.calls.length).toBe(0)
  })
})
