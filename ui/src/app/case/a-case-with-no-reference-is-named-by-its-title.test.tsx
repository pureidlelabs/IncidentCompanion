/**
 * A case whose optional reference was never filled in is named by its title.
 *
 * No module is mocked: the real frame container, hooks, request layer and
 * socket client, against a model of the network that answers the case's
 * summary and leaves every other read unanswered.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { CaseRailSummary } from '@/api/case'
import { setSocketFactory, type SocketLike } from '@/api/caseSocket'
import { setSession } from '@/api/session'
import { setTransport } from '@/api/transport'

import { CaseFrameContainer } from './CaseFrameContainer'

const ID = 'c-1'
const TITLE = 'Northwind Freight ransomware'

const SUMMARY: CaseRailSummary = {
  id: ID,
  title: TITLE,
  reference: null,
  customer: 'Northwind Freight',
  isDemo: false,
  version: 3,
  counts: {} as CaseRailSummary['counts'],
  attention: {},
  reports: [],
}

const json = (status: number, body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  )

function server(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(input instanceof Request ? input.url : input.toString(), 'http://ic.test')
  const method = init?.method ?? 'GET'
  if (url.pathname === `/api/cases/${ID}/summary` && method === 'GET') return json(200, SUMMARY)
  return json(404, { message: `unmodelled ${method} ${url.pathname}` })
}

beforeEach(() => {
  setTransport(server)
  setSocketFactory(() => {
    const live: SocketLike = {
      readyState: 1,
      send: () => undefined,
      close: () => undefined,
      onopen: null,
      onmessage: null,
      onclose: null,
    }
    queueMicrotask(() => live.onopen?.({} as Event))
    return live
  })
  setSession({ userId: 'u-1', username: 'r.okonkwo@example.test' })
})

afterEach(() => {
  setTransport((input, init) => fetch(input, init))
})

describe('a case whose reference was never filled in', () => {
  it('is named in the rail by its title rather than by its identifier', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[`/cases/${ID}/timeline`]}>
          <Routes>
            <Route path="/cases/:caseId" element={<CaseFrameContainer />}>
              <Route path=":section" element={<div>the section renders here</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    const rail = await screen.findByTestId('rail')
    expect(await within(rail).findByText(TITLE)).toBeInTheDocument()
    expect(within(rail).queryByText(ID)).not.toBeInTheDocument()
  })
})
