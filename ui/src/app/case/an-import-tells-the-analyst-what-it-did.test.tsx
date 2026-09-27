/**
 * An import tells the analyst what the server did with the file.
 *
 * No module is mocked: the analyst picks a table and a file on the real
 * screen, and the counts reach it through the real container, hooks and
 * request layer from a model of the network answering as the import route does.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { Imported } from '@/api/useImportCsv'
import { setSession } from '@/api/session'
import { setTransport } from '@/api/transport'
import collections from '@/demo/catalogue/collections.json'
import { campaignCase } from '@/fixtures/campaign'
import { specsWire } from '@/fixtures/specs'

import { ImportDataContainer } from './ImportDataContainer'

const ID = campaignCase.id
let answer: Imported
let posted: string[]

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
  if (url.pathname === `/api/cases/${ID}` && method === 'GET') return json(200, campaignCase)
  if (url.pathname === '/api/specs') return json(200, specsWire)
  if (url.pathname === '/api/collections') return json(200, collections)
  if (url.pathname === `/api/cases/${ID}/systems.csv` && method === 'POST') {
    posted.push(url.pathname)
    return json(201, answer)
  }
  return json(404, { message: `unmodelled ${method} ${url.pathname}` })
}

beforeEach(() => {
  posted = []
  setTransport(server)
  setSession({ userId: 'u-a', username: 'analyst-a' })
})

afterEach(() => {
  setTransport((input, init) => fetch(input, init))
})

/** The analyst imports a file into Assets, and the screen as it reads once the route answered. */
async function importAFile(): Promise<string> {
  const user = userEvent.setup()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/cases/${ID}/import`]}>
        <Routes>
          <Route path="/cases/:caseId/:section" element={<ImportDataContainer />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  await user.click(await screen.findByRole('button', { name: 'Import CSV into Assets' }))
  const picker = document.querySelector<HTMLInputElement>('input[type="file"]')!
  await user.upload(picker, new File(['hostname\nWKS-0142\n'], 'hosts.csv', { type: 'text/csv' }))
  await waitFor(() => {
    expect(posted, 'the file never reached the import route').toHaveLength(1)
  })
  await waitFor(() => {
    expect(document.body.textContent).toMatch(/into Assets|Nothing new in Assets/)
  })
  return document.body.textContent
}

describe('an import the route took', () => {
  it('says how many rows were added and how many were already there', async () => {
    answer = { added: 5, skipped: 3, replaced: 0, refused: 0, unlinked: 0, unlinkedBy: {} }

    const said = await importAFile()

    expect(said, 'the analyst is not told how many rows were added').toContain(
      '5 rows imported into Assets',
    )
    expect(said, 'the analyst is not told how many rows were already there').toContain(
      '3 already there',
    )
  })

  it('says plainly that it carried every reference', async () => {
    answer = { added: 5, skipped: 0, replaced: 0, refused: 0, unlinked: 0, unlinkedBy: {} }

    const said = await importAFile()

    expect(said, 'an import that lost nothing does not say so').toMatch(/every reference/i)
  })
})
