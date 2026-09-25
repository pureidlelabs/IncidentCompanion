/**
 * The door that starts a case from an incident, walked as the analyst walks it.
 *
 * No module is mocked: the real container, screen and request layer, with the
 * bundled demo source standing in for the provider (it makes no request) and a
 * model of the network answering the import routes.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { setSession } from '@/api/session'
import { setTransport } from '@/api/transport'

import { ImportSentinelContainer } from './ImportSentinelContainer'

/** Every write the page sent, by path, with its body. */
let writes: { path: string; body: Record<string, unknown> }[]

const json = (status: number, body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  )

const PREVIEW = {
  entities: [
    {
      id: 'SEN-1001\u001Fsystems\u0000wks-0142',
      incident: 'SEN-1001',
      collection: 'systems',
      label: 'wks-0142',
      verdict: 'new',
      fields: { hostname: 'wks-0142' },
      existing: null,
      checked: true,
    },
  ],
  timeline: [],
}

function server(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(input instanceof Request ? input.url : input.toString(), 'http://ic.test')
  const method = init?.method ?? 'GET'
  if (method === 'POST') {
    writes.push({ path: url.pathname, body: JSON.parse(String(init?.body)) as Record<string, unknown> })
  }
  if (url.pathname === '/api/imports/preview' && method === 'POST') return json(200, PREVIEW)
  if (url.pathname === '/api/imports/case' && method === 'POST') {
    return json(201, { caseId: 'case-made', written: 1, skipped: 0, refused: 0 })
  }
  return json(404, { message: `unmodelled ${method} ${url.pathname}` })
}

beforeEach(() => {
  writes = []
  window.history.replaceState({}, '', '/cases?importer=demo')
  setTransport(server)
  setSession({ userId: 'u-a', username: 'analyst-a' })
})

afterEach(() => {
  window.history.replaceState({}, '', '/')
  setTransport((input, init) => fetch(input, init))
})

/** The wizard, walked to the review the server's preview answers. */
async function reachReview(user: ReturnType<typeof userEvent.setup>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const drawn = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/cases']}>
        <Routes>
          <Route path="/cases" element={<ImportSentinelContainer startsACase />} />
          <Route path="/cases/:caseId" element={<div>the case</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  await user.click(await screen.findByRole('button', { name: 'Sign in' }))
  await user.click((await screen.findAllByRole('button', { name: /aurora-soc/ }))[0]!)
  await user.click((await screen.findAllByRole('option', { name: /aurora-soc/ }))[0]!)
  await user.click(screen.getByRole('button', { name: 'Continue' }))
  await user.click(await screen.findByLabelText('Opened'))
  await user.click(await screen.findByRole('option', { name: 'Any time' }))
  await user.click(screen.getByRole('button', { name: /^Search/ }))
  await user.click(await screen.findByLabelText('Import incident SEN-1001'))
  await user.click(screen.getByRole('button', { name: 'Fetch detail' }))
  await screen.findByRole('button', { name: /^Create and import \d+ row/ })
  return drawn
}

describe('a case started from an incident', () => {
  it('is not created when the analyst leaves before accepting the review', async () => {
    const user = userEvent.setup()
    const drawn = await reachReview(user)
    await user.type(screen.getByLabelText(/title/i), 'Left halfway')

    drawn.unmount()

    expect(
      writes.map((one) => one.path),
      'the wizard wrote something other than its preview before the analyst accepted',
    ).toEqual(['/api/imports/preview'])
  })

  it('is created with no reference composed from the incident', async () => {
    const user = userEvent.setup()
    await reachReview(user)
    await user.type(screen.getByLabelText(/title/i), 'From an incident')

    await user.click(screen.getByRole('button', { name: /^Create and import \d+ row/ }))

    await waitFor(() => {
      expect(writes.map((one) => one.path)).toContain('/api/imports/case')
    })
    const created = writes.find((one) => one.path === '/api/imports/case')!.body
    expect(created.title, 'the case was not the one the analyst named').toBe('From an incident')
    expect(
      created.reference,
      `the case carries ${String(created.reference)}, which the next case from this incident cannot also carry`,
    ).toBeUndefined()
  })
})
