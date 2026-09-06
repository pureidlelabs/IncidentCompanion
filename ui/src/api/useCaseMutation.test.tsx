/**
 * **The case's own fields are written under the same version check as a row.**
 *
 * A `PATCH /api/cases/{id}` carrying only the fields answers **422 - "A patch
 * has to name the version it read."**, so a helper that omits the version
 * makes every field on Case settings unsaveable.
 *
 * `useEntryMutation` had this right from the start and says why in its own
 * docstring: the version travels with the write, and the *caller* supplies it,
 * because taking whatever is in the cache at send time adopts another
 * analyst's row as your base and the check then passes on a save that should
 * have been a question.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Case } from './model'
import { keys } from './queryKeys'
import { setSession } from './session'
import { useCaseMutation } from './useCaseMutation'

const CASE = 'DEMO-CAMPAIGN'
const caseKey = keys.case(CASE)

const stored = { id: CASE, title: 'Before', customer: 'Acme', version: 7 } as unknown as Case

const fetchMock = vi.fn<typeof fetch>()

function ok(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function harness() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  client.setQueryData(caseKey, stored)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, hook: renderHook(() => useCaseMutation(CASE), { wrapper }) }
}

/** The body of the one PATCH the hook sent. */
function sentBody(): Record<string, unknown> {
  const call = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH')
  // **Named rather than asserted through.** A missing PATCH is the failure this
  // helper's callers are usually looking for, and `call![1]!.body` reports it
  // as a TypeError about `undefined` inside a helper nobody suspects.
  if (!call) throw new Error('no PATCH was sent')
  const body = call[1]?.body
  if (typeof body !== 'string') throw new Error('the PATCH carried no JSON body')
  return JSON.parse(body) as Record<string, unknown>
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  setSession({ userId: 'u-analyst', username: 'analyst' })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('writing the case\u2019s own fields', () => {
  it('names the version it read, which the server refuses a patch without', async () => {
    fetchMock.mockResolvedValue(ok({ caseId: CASE }))
    const { hook } = harness()

    act(() => {
      hook.result.current.mutate({ version: 7, fields: { customer: 'Globex' } })
    })

    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true))
    expect(sentBody()).toEqual({ version: 7, customer: 'Globex' })
  })

  /**
   * **The caller's version, not whatever the cache holds when the request
   * leaves.** Another analyst's write can land between the render the analyst
   * read and the blur that commits; sending the cache's newer version would
   * make the check pass on a save built from the older value.
   */
  it('sends the version the caller read, not the one in the cache', async () => {
    fetchMock.mockResolvedValue(ok({ caseId: CASE }))
    const { client, hook } = harness()

    client.setQueryData<Case>(caseKey, (current) =>
      current ? ({ ...current, version: 9 }) : current,
    )

    act(() => {
      hook.result.current.mutate({ version: 7, fields: { customer: 'Globex' } })
    })

    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true))
    expect(sentBody().version).toBe(7)
  })

  it('still applies the edit optimistically and rolls it back on refusal', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: 'Validation failed' }), { status: 422 }),
    )
    const { client, hook } = harness()

    act(() => {
      hook.result.current.mutate({ version: 7, fields: { customer: 'Globex' } })
    })

    await waitFor(() => expect(hook.result.current.isError).toBe(true))
    expect(client.getQueryData<Case>(caseKey)?.customer).toBe('Acme')
  })
})
