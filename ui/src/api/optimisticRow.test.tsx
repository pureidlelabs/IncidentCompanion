/**
 * The optimistic row a create hook appends is a *whole* row.
 *
 * **A per-reader guard is the wrong mechanism**, and the crash it leaves is
 * always the same shape: `entry.type.trim()` on a record added without a type,
 * the section to the error boundary, zero rows until reload.
 *
 * **This tier proves the hook *uses* the blank; it cannot prove the blank is
 * complete.** Completeness is a property of the server's Zod schemas and is
 * asserted there - `specs.controller.test.ts` walks every form and fails on a
 * field the blank does not carry, and on any value a reader could not `.trim()`.
 * Asserting it here as well would mean a fixture enumerating every field of
 * every collection, which is the hand-kept list this whole mechanism replaced.
 *
 * So the specs seeded below are deliberately small and explicit. They are not a
 * claim about what the server serves.
 */

import { jsonBody } from '@/test/fetchArgs'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { CollectionName, EvidenceEntry, TimelineEntry } from './model'
import { blankRowFor, newOptimisticId, optimisticRow } from './optimisticRow'
import { keys } from './queryKeys'
import { setSession } from './session'
import type { FormSpec, Specs } from './specs'
import { useEntryCreate } from './useEntryCreate'
import { useEvidenceRecordCreate } from './useEvidenceRecordCreate'

const CASE = 'DEMO-CAMPAIGN'

const fetchMock = vi.fn<typeof fetch>()

function form(collection: CollectionName, blank: Record<string, unknown>): FormSpec {
  return { collection, columns: 1, fields: [], blank }
}

/** Only the part of the document this file reads. */
function specsWith(forms: Record<string, FormSpec>): Specs {
  return { forms } as unknown as Specs
}

const EVIDENCE_BLANK = {
  type: '',
  name: '',
  location: '',
  dataClassification: '',
  systemId: null,
  accountId: null,
  tags: '',
}

const SPECS = specsWith({
  EVIDENCE_FIELDS: form('evidence', EVIDENCE_BLANK),
  // Two forms on one collection, which is the case `blankRowFor` merges for.
  EVENT_FIELDS: form('timeline', { description: '', tactic: '', severity: '' }),
  TIMELINE_ACTION_FIELDS: form('timeline', { description: '', owner: '' }),
  SYSTEM_FIELDS: form('systems', { hostname: '', verdict: 'unknown', zone: 'external' }),
})

function answered(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function harness() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  client.setQueryData(keys.specs(), SPECS)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  setSession({ userId: 'u-analyst', username: 'analyst' })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the blank a collection is given', () => {
  it('merges every form that writes into it', () => {
    // The Timeline is written through an event schema and an action schema, and
    // a create hook is told the collection rather than which dialog was open -
    // so the union is what makes the row complete either way.
    const blank = blankRowFor(SPECS, 'timeline')
    expect(Object.keys(blank).sort()).toEqual(['description', 'owner', 'severity', 'tactic'])
  })

  it('is empty when the document has not loaded', () => {
    // Leaves the caller exactly where it was before this existed, rather than
    // throwing inside `onMutate` where the rollback would never run.
    expect(blankRowFor(undefined, 'evidence')).toEqual({})
  })

  it('is empty for a collection no form writes into', () => {
    expect(blankRowFor(SPECS, 'reports')).toEqual({})
  })
})

describe('the id an optimistic row carries', () => {
  it('differs between two rows made in the same millisecond', () => {
    // `Date.now()` alone collided on a paste, and a duplicate React key renders
    // as one row rather than as an error.
    const many = new Set(Array.from({ length: 50 }, () => newOptimisticId()))
    expect(many.size).toBe(50)
  })
})

describe('the row a create hook shows before the server answers', () => {
  it('carries the fields the analyst never touched', async () => {
    fetchMock.mockResolvedValue(answered({ id: 'ev-real' }))
    const { client, wrapper } = harness()
    const listKey = keys.collection(CASE, 'evidence')
    client.setQueryData<EvidenceEntry[]>(listKey, [])

    const hook = renderHook(() => useEvidenceRecordCreate(CASE), { wrapper })
    await act(async () => {
      await hook.result.current.mutateAsync({ fields: { name: 'note.txt' } })
    })

    const [row] = client.getQueryData<EvidenceEntry[]>(listKey) ?? []
    // The field the third crash was on. `toHaveProperty` alone passes on an
    // explicit undefined, so the value is what is asserted.
    expect(row?.type).toBe('')
    expect(row?.tags).toBe('')
    expect(row?.name).toBe('note.txt')
  })

  it('states the computed-only fields this door refuses', async () => {
    fetchMock.mockResolvedValue(answered({ id: 'ev-real' }))
    const { client, wrapper } = harness()
    const listKey = keys.collection(CASE, 'evidence')
    client.setQueryData<EvidenceEntry[]>(listKey, [])

    const hook = renderHook(() => useEvidenceRecordCreate(CASE), { wrapper })
    await act(async () => {
      await hook.result.current.mutateAsync({ fields: { name: 'note.txt' } })
    })

    const [row] = client.getQueryData<EvidenceEntry[]>(listKey) ?? []
    expect(row?.hash).toBe('')
    /**
     * **Absent, not null - and that is the door refusing it.** The blank is
     * built from the fields `GET /api/specs` publishes for this form, and
     * `storedAt` is not one: it is set when the install takes the bytes, so a
     * create form has no value to offer for it. It read `null` while the row
     * type came from Python, where the same field was called `filePath` and
     * was a nullable column the form knew about.
     */
    expect(row?.storedAt).toBeUndefined()
  })

  it('completes a generic collection row too, not only evidence', async () => {
    fetchMock.mockResolvedValue(answered({ id: 't-real' }))
    const { client, wrapper } = harness()
    const listKey = keys.collection(CASE, 'timeline')
    client.setQueryData<TimelineEntry[]>(listKey, [])

    const hook = renderHook(() => useEntryCreate(CASE, 'timeline'), { wrapper })
    await act(async () => {
      await hook.result.current.mutateAsync({ fields: { description: 'first contact' } })
    })

    const [row] = client.getQueryData<TimelineEntry[]>(listKey) ?? []
    expect(row?.tactic).toBe('')
    expect(row?.severity).toBe('')
    expect(row?.description).toBe('first contact')
  })

  it('shows a defaulted field at the value the server will store', async () => {
    // Why the blank is the schema's and not a zero-fill: a row that appears as
    // `unknown` and refetches as `unknown` does not change under the analyst
    // when the request settles.
    fetchMock.mockResolvedValue(answered({ id: 's-real' }))
    const { client, wrapper } = harness()
    const listKey = keys.collection(CASE, 'systems')
    client.setQueryData(listKey, [])

    const hook = renderHook(() => useEntryCreate(CASE, 'systems'), { wrapper })
    await act(async () => {
      await hook.result.current.mutateAsync({ fields: { hostname: 'DC-01' } })
    })

    const rows = client.getQueryData<{ verdict: string; zone: string }[]>(listKey) ?? []
    expect(rows[0]?.verdict).toBe('unknown')
    expect(rows[0]?.zone).toBe('external')
  })

  it('lets the analyst beat the blank', async () => {
    fetchMock.mockResolvedValue(answered({ id: 's-real' }))
    const { client, wrapper } = harness()
    const listKey = keys.collection(CASE, 'systems')
    client.setQueryData(listKey, [])

    const hook = renderHook(() => useEntryCreate(CASE, 'systems'), { wrapper })
    await act(async () => {
      await hook.result.current.mutateAsync({
        fields: { hostname: 'DC-01', verdict: 'compromised' },
      })
    })

    const rows = client.getQueryData<{ verdict: string }[]>(listKey) ?? []
    expect(rows[0]?.verdict).toBe('compromised')
  })

  it('still posts only the fields the dialog filled', async () => {
    // The completion is a *cache* concern. A `time` that arrives
    // present-and-empty is acted on, so posting the blanks would stamp every
    // timeless entry at the moment Save was pressed and take it out of the gap
    // queue.
    fetchMock.mockResolvedValue(answered({ id: 't-real' }))
    const { client, wrapper } = harness()
    client.setQueryData(keys.collection(CASE, 'timeline'), [])

    const hook = renderHook(() => useEntryCreate(CASE, 'timeline'), { wrapper })
    await act(async () => {
      await hook.result.current.mutateAsync({ fields: { description: 'first contact' } })
    })

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
    })
    const [, init] = fetchMock.mock.calls[0] ?? []
    const sent = jsonBody(init)
    expect(Object.keys(sent)).toEqual(['description'])
  })

  it('rolls the append back when the request fails', async () => {
    // The blank must not survive a refusal either: a row that stays after the
    // server said no is the same lie in the other direction.
    fetchMock.mockResolvedValue(new Response('nope', { status: 400 }))
    const { client, wrapper } = harness()
    const listKey = keys.collection(CASE, 'timeline')
    client.setQueryData<TimelineEntry[]>(listKey, [])

    const hook = renderHook(() => useEntryCreate(CASE, 'timeline'), { wrapper })
    await act(async () => {
      await hook.result.current.mutateAsync({ fields: { description: 'x' } }).catch(() => undefined)
    })

    expect(client.getQueryData<TimelineEntry[]>(listKey)).toEqual([])
  })
})

describe('the row builder on its own', () => {
  it('puts the caller ahead of the blank and the id ahead of both', () => {
    const client = new QueryClient()
    client.setQueryData(keys.specs(), SPECS)
    const row = optimisticRow<Record<string, unknown>>(client, 'systems', {
      hostname: 'DC-01',
      id: 'ignored',
    })
    expect(row.hostname).toBe('DC-01')
    expect(row.zone).toBe('external')
    expect(row.id).not.toBe('ignored')
  })
})
