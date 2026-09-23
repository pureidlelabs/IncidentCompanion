/**
 * A selection is deleted or changed against the versions its rows had when the
 * analyst chose it, on every screen that offers one.
 *
 * No module is mocked: the real containers, hooks and request layer, and the
 * real change feed reading a `case.changed` frame off a fake socket. Another
 * analyst changes a selected row while the confirmation or the bulk edit is
 * open, and the frame repaints the screen behind it.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { setSocketFactory, type SocketLike } from '@/api/caseSocket'
import { keys } from '@/api/queryKeys'
import { setSession } from '@/api/session'
import { setTransport } from '@/api/transport'
import { useCaseChanges } from '@/api/useCaseChanges'
import { EntitiesContainer } from '@/app/case/EntitiesContainer'
import { EvidenceContainer } from '@/app/case/EvidenceContainer'
import { ImpactContainer } from '@/app/case/ImpactContainer'
import { casePath } from '@/components/blocks/case-paths'
import { campaignCase } from '@/fixtures/campaign'
import { specsWire } from '@/fixtures/specs'

/** The address a request was sent to, whatever form the caller gave it in. */
const urlOf = (input: RequestInfo | URL) =>
  input instanceof Request ? input.url : input.toString()
/** The JSON body a request carried, or nothing. */
const bodyOf = (init?: RequestInit) => (typeof init?.body === 'string' ? init.body : '')

const ID = campaignCase.id
const LATENCY = 40

type Row = Record<string, unknown> & { id: string; version: number }
let doc: Record<string, unknown>
let writes: { path: string; body: unknown; status: number }[]
let socket: SocketLike | null

/** Route segment to the document's key. */
const KEY: Record<string, string> = { impact: 'impact', evidence: 'evidence', systems: 'systems' }

const json = (status: number, body: unknown) =>
  new Promise<Response>((done) =>
    setTimeout(() => {
      done(
        new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        }),
      )
    }, LATENCY),
  )
const rows = (collection: string) => doc[KEY[collection] ?? collection] as Row[]

function server(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = urlOf(input)
  const method = init?.method ?? 'GET'
  const body = init?.body ? (JSON.parse(bodyOf(init)) as Record<string, unknown>) : {}
  const record = (status: number) => writes.push({ path: url, body, status })
  if (url === '/api/specs') return json(200, specsWire)
  if (url === `/api/cases/${ID}` && method === 'GET') return json(200, doc)
  if (url.startsWith(`/api/cases/${ID}/`) && method === 'GET' && !url.endsWith('/attribution')) {
    return json(200, rows(url.split('/').pop() ?? ''))
  }
  if (url === `/api/cases/${ID}/bulk-delete` && method === 'POST') {
    const targets = body.targets as {
      collection: string
      rows: { id: string; version: number }[]
    }[]
    const moved = targets.flatMap((one) =>
      one.rows.filter(
        (named) => rows(one.collection).find((r) => r.id === named.id)?.version !== named.version,
      ),
    )
    if (moved.length > 0) {
      record(409)
      return json(409, { message: 'Changed since read.', refused: moved.map((one) => one.id) })
    }
    for (const one of targets) {
      const gone = new Set(one.rows.map((named) => named.id))
      doc = {
        ...doc,
        [KEY[one.collection] ?? one.collection]: rows(one.collection).filter(
          (r) => !gone.has(r.id),
        ),
      }
    }
    record(200)
    return json(200, {
      deleted: targets.flatMap((one) =>
        one.rows.map((named) => ({ collection: one.collection, id: named.id })),
      ),
      missing: [],
    })
  }
  const bulk = /\/api\/cases\/[^/]+\/([a-z_]+)\/bulk$/.exec(url)
  if (bulk && method === 'PATCH') {
    const collection = bulk[1] ?? ''
    const { ids, fields } = body as {
      ids: { id: string; version: number }[]
      fields: Record<string, unknown>
    }
    const updated: string[] = []
    const refused: string[] = []
    doc = {
      ...doc,
      [KEY[collection] ?? collection]: rows(collection).map((r) => {
        const named = ids.find((one) => one.id === r.id)
        if (!named) return r
        if (named.version !== r.version) {
          refused.push(r.id)
          return r
        }
        updated.push(r.id)
        return { ...r, ...fields, version: r.version + 1 }
      }),
    }
    record(200)
    return json(200, { updated, missing: [], refused })
  }
  return json(404, { message: `unmodelled ${method} ${url}` })
}

/** Another analyst's committed write to one row, and the frame that repaints this screen. */
function otherAnalystChanges(collection: string, id: string, fields: Record<string, unknown>) {
  doc = {
    ...doc,
    [KEY[collection] ?? collection]: rows(collection).map((r) =>
      r.id === id ? { ...r, ...fields, version: r.version + 1 } : r,
    ),
  }
  socket?.onmessage?.({
    data: JSON.stringify({ type: 'case.changed', scopes: [collection], by: 'u-b' }),
  } as MessageEvent)
}

function mount(address: string, Screen: () => ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  function Shell() {
    useCaseChanges(ID)
    return <Screen />
  }
  const router = createMemoryRouter([{ path: '/cases/:caseId/:section', element: <Shell /> }], {
    initialEntries: [address],
  })
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return client
}

async function repainted(client: QueryClient, collection: string, id: string, version: number) {
  await waitFor(() => {
    const held = client.getQueryData<Record<string, Row[]>>(keys.case(ID))
    expect(held?.[KEY[collection] ?? collection]?.find((r) => r.id === id)?.version).toBe(version)
  })
}

const settle = () => new Promise((done) => setTimeout(done, LATENCY * 8))

interface Surface {
  name: string
  address: string
  Screen: () => ReactNode
  collection: string
  label: (row: Row) => string
  /** The bulk edit's control, and the option it sets. */
  control: RegExp
  option: string
  field: string
  theirs: string
}

const SURFACES: Surface[] = [
  {
    name: 'Impact',
    address: casePath(ID, 'impact'),
    Screen: ImpactContainer,
    collection: 'impact',
    label: (row) => String(row.label),
    control: /happened/i,
    option: 'encrypted',
    field: 'disposition',
    theirs: 'destroyed',
  },
  {
    name: 'Evidence',
    address: casePath(ID, 'evidence'),
    Screen: EvidenceContainer,
    collection: 'evidence',
    label: (row) => String(row.name),
    control: /\bType\b/,
    option: 'screenshot',
    field: 'type',
    theirs: 'disk image',
  },
  {
    name: 'Entities',
    address: `${casePath(ID, 'entities')}#assets`,
    Screen: EntitiesContainer,
    collection: 'systems',
    label: (row) => String(row.hostname),
    control: /\bVerdict\b/,
    option: 'compromised',
    field: 'verdict',
    theirs: 'accessed',
  },
]

beforeEach(() => {
  doc = JSON.parse(JSON.stringify(campaignCase)) as Record<string, unknown>
  doc.version = 7
  writes = []
  socket = null
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
    socket = live
    queueMicrotask(() => live.onopen?.({} as Event))
    return live
  })
  setSession({ userId: 'u-a', username: 'analyst-a' })
})

afterEach(() => {
  setTransport((input, init) => fetch(input, init))
})

describe.each(SURFACES)('a selection on $name', (surface) => {
  it('is not deleted when a row in it changed while the confirmation was open', async () => {
    const user = userEvent.setup()
    const client = mount(surface.address, surface.Screen)
    const first = rows(surface.collection)[0]!
    await user.click(
      await screen.findByRole('checkbox', { name: `Select ${surface.label(first)}` }),
    )
    await user.click(await screen.findByRole('button', { name: 'Delete 1' }))
    const confirm = await screen.findByRole('alertdialog')

    otherAnalystChanges(surface.collection, first.id, { notes: 'B: this is the one that matters' })
    await repainted(client, surface.collection, first.id, first.version + 1)

    await user.click(within(confirm).getByRole('button', { name: /delete/i }))
    await settle()
    await waitFor(
      () => {
        expect({
          named: (
            writes[0]?.body as
              { targets: { rows: { id: string; version: number }[] }[] } | undefined
          )?.targets[0]?.rows,
          status: writes[0]?.status,
          survives: rows(surface.collection).some((r) => r.id === first.id),
          told:
            within(confirm).queryByText(
              new RegExp(surface.label(first).replace(/[()[\].*+?^$|\\]/g, '\\$&')),
            ) !== null,
        }).toEqual({
          named: [{ id: first.id, version: first.version }],
          status: 409,
          survives: true,
          told: true,
        })
      },
      { timeout: 10_000 },
    )
  })

  it('does not overwrite a row another analyst changed while the bulk edit was open', async () => {
    const user = userEvent.setup()
    const client = mount(surface.address, surface.Screen)
    const [first, second] = rows(surface.collection)
    await user.click(
      await screen.findByRole('checkbox', { name: `Select ${surface.label(first!)}` }),
    )
    await user.click(
      await screen.findByRole('checkbox', { name: `Select ${surface.label(second!)}` }),
    )
    await user.click(await screen.findByRole('button', { name: 'Edit 2' }))
    const dialog = await screen.findByRole('dialog')

    otherAnalystChanges(surface.collection, first!.id, { [surface.field]: surface.theirs })
    await repainted(client, surface.collection, first!.id, first!.version + 1)

    await user.click(within(dialog).getByRole('button', { name: surface.control }))
    await user.click(await screen.findByRole('option', { name: surface.option }))
    await user.click(within(dialog).getByRole('button', { name: 'Apply' }))
    await settle()
    await waitFor(
      () => {
        const bulk = writes.find((one) => one.path.endsWith('/bulk'))
        expect({
          requests: writes.filter((one) => !one.path.endsWith('/bulk')).length,
          named: (bulk?.body as { ids: { id: string; version: number }[] } | undefined)?.ids,
          first: rows(surface.collection).find((r) => r.id === first!.id)?.[surface.field],
          second: rows(surface.collection).find((r) => r.id === second!.id)?.[surface.field],
        }).toEqual({
          requests: 0,
          named: [
            { id: first!.id, version: first!.version },
            { id: second!.id, version: second!.version },
          ],
          first: surface.theirs,
          second: surface.option,
        })
      },
      { timeout: 10_000 },
    )
  })
})
