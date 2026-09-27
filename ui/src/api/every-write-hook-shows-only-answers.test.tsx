/**
 * The cache holds what the server answered, whatever a write hook is doing.
 *
 * Every write below is refused, two of them in flight at once and answered in
 * the order that exposes a snapshot put back over another write's copy. Every
 * state the case document passes through is recorded, so a value drawn before
 * its answer is caught even when a later refetch hides it.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useComplianceMutation } from './compliance'
import { keys } from './queryKeys'
import { drawn } from './rowWrite'
import { setSession } from './session'
import { setTransport } from './transport'
import { useCaseMutation } from './useCaseMutation'
import { useEntryCreate } from './useEntryCreate'
import { useEntryDelete } from './useEntryDelete'
import { useEntryMutation } from './useEntryMutation'
import { useEvidenceRecordCreate } from './useEvidenceRecordCreate'

/** The address a request was sent to, whatever form the caller gave it in. */
const urlOf = (input: RequestInfo | URL) =>
  input instanceof Request ? input.url : input.toString()
/** The JSON body a request carried, or nothing. */
const bodyOf = (init?: RequestInit) => (typeof init?.body === 'string' ? init.body : '')

const CASE = 'case-1'
const at = (version: number) => drawn({ version }).version

const STORED = {
  id: CASE,
  version: 7,
  title: 'As stored',
  customer: 'As stored',
  impact: [
    { id: 'a', version: 1, notes: 'A as stored' },
    { id: 'b', version: 1, notes: 'B as stored' },
  ],
  evidence: [{ id: 'e', version: 1, name: 'E as stored' }],
}
const RECORD = { caseId: CASE, version: 3, financialImpact: 'As stored', notes: 'As stored' }

/** Answered after a delay that differs per request, so two refusals land apart. */
function server(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = urlOf(input)
  const method = init?.method ?? 'GET'
  const after = (ms: number, status: number, body: unknown) =>
    new Promise<Response>((done) =>
      setTimeout(() => {
        done(
          new Response(JSON.stringify(body), {
            status,
            headers: { 'content-type': 'application/json' },
          }),
        )
      }, ms),
    )
  if (method === 'GET') return after(400, 200, url.endsWith('/compliance') ? RECORD : STORED)
  const refusal = { message: 'Someone else wrote this first.', currentVersion: 99 }
  const body = bodyOf(init)
  return after(body.includes('first') || url.endsWith('/a') ? 20 : 60, 409, refusal)
}

function mount<T>(hook: () => T) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  client.setQueryData(keys.case(CASE), STORED)
  client.setQueryData([...keys.compliance(CASE), 'record'], RECORD)
  const seen: unknown[] = []
  client.getQueryCache().subscribe(() => {
    seen.push(
      JSON.parse(
        JSON.stringify({
          kase: client.getQueryData(keys.case(CASE)),
          record: client.getQueryData([...keys.compliance(CASE), 'record']),
        }),
      ),
    )
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { result: renderHook(hook, { wrapper }).result, seen }
}

/** Every state the cache passed through, as the server would have it. */
const onlyAnswers = { kase: STORED, record: RECORD }

beforeEach(() => {
  setTransport(server)
  setSession({ userId: 'u-a', username: 'analyst-a' })
})

afterEach(() => {
  setTransport((input, init) => fetch(input, init))
})

const settle = () => new Promise((done) => setTimeout(done, 150))

describe('a refused write leaves nothing of itself in the cache', () => {
  it('row patches', async () => {
    const { result, seen } = mount(() => useEntryMutation(CASE, 'impact'))
    await Promise.all([
      result.current
        .mutateAsync({ entryId: 'a', version: at(1), fields: { notes: 'A REFUSED' } })
        .catch(() => null),
      result.current
        .mutateAsync({ entryId: 'b', version: at(1), fields: { notes: 'B REFUSED' } })
        .catch(() => null),
    ])
    await settle()
    expect(new Set(seen.map((one) => JSON.stringify(one)))).toEqual(
      new Set([JSON.stringify(onlyAnswers)]),
    )
  })

  it('row deletes', async () => {
    const { result, seen } = mount(() => useEntryDelete(CASE, 'impact'))
    await Promise.all([
      result.current.mutateAsync({ entryId: 'a', version: at(1) }).catch(() => null),
      result.current.mutateAsync({ entryId: 'b', version: at(1) }).catch(() => null),
    ])
    await settle()
    expect(new Set(seen.map((one) => JSON.stringify(one)))).toEqual(
      new Set([JSON.stringify(onlyAnswers)]),
    )
  })

  it('row creates', async () => {
    const { result, seen } = mount(() => useEntryCreate(CASE, 'impact'))
    await Promise.all([
      result.current.mutateAsync({ fields: { notes: 'first REFUSED' } }).catch(() => null),
      result.current.mutateAsync({ fields: { notes: 'second REFUSED' } }).catch(() => null),
    ])
    await settle()
    expect(new Set(seen.map((one) => JSON.stringify(one)))).toEqual(
      new Set([JSON.stringify(onlyAnswers)]),
    )
  })

  it('evidence records', async () => {
    const { result, seen } = mount(() => useEvidenceRecordCreate(CASE))
    await Promise.all([
      result.current.mutateAsync({ fields: { name: 'first REFUSED' } }).catch(() => null),
      result.current.mutateAsync({ fields: { name: 'second REFUSED' } }).catch(() => null),
    ])
    await settle()
    expect(new Set(seen.map((one) => JSON.stringify(one)))).toEqual(
      new Set([JSON.stringify(onlyAnswers)]),
    )
  })

  it('case fields', async () => {
    const { result, seen } = mount(() => useCaseMutation(CASE))
    await Promise.all([
      result.current
        .mutateAsync({ version: at(7), fields: { title: 'first REFUSED' } })
        .catch(() => null),
      result.current
        .mutateAsync({ version: at(7), fields: { customer: 'second REFUSED' } })
        .catch(() => null),
    ])
    await settle()
    expect(new Set(seen.map((one) => JSON.stringify(one)))).toEqual(
      new Set([JSON.stringify(onlyAnswers)]),
    )
  })

  it('compliance answers', async () => {
    const { result, seen } = mount(() => useComplianceMutation(CASE))
    await Promise.all([
      result.current
        .mutateAsync({ version: at(3), fields: { financialImpact: 'first REFUSED' } })
        .catch(() => null),
      result.current
        .mutateAsync({ version: at(3), fields: { notes: 'second REFUSED' } })
        .catch(() => null),
    ])
    await settle()
    expect(new Set(seen.map((one) => JSON.stringify(one)))).toEqual(
      new Set([JSON.stringify(onlyAnswers)]),
    )
  })
})
