/**
 * A change saved from a dialog, on an entry another analyst changed while the
 * dialog was open.
 *
 * No module is mocked: the real containers, dialog, hooks and request layer,
 * and the real change feed reading a `case.changed` frame off a fake socket.
 * The server model applies the version rule and answers after a real delay.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { setSocketFactory, type SocketLike } from '@/api/caseSocket'
import { setSession } from '@/api/session'
import { setTransport } from '@/api/transport'
import { useCaseChanges } from '@/api/useCaseChanges'
import { CaseProvidersLive } from '@/app/case/CaseProviders'
import { EntitiesContainer } from '@/app/case/EntitiesContainer'
import { TimelineContainer } from '@/app/case/TimelineContainer'
import { casePath } from '@/components/blocks/case-paths'
import { campaignCase } from '@/fixtures/campaign'
import { specsWire } from '@/fixtures/specs'

/** The address a request was sent to, whatever form the caller gave it in. */
const urlOf = (input: RequestInfo | URL) =>
  input instanceof Request ? input.url : input.toString()
/** The JSON body a request carried, or nothing. */
const bodyOf = (init?: RequestInit) => (typeof init?.body === 'string' ? init.body : '')

const ID = campaignCase.id
const LATENCY = 30
/** Each analyst's value, distinct from every word the band draws around them. */
const MINE = 'WKS-MINE-2208'
const THEIRS = 'WKS-THEIRS-7731'
/** How long a PATCH takes to be answered, when it is not `LATENCY`. */
let patchLatency: number | undefined

type Row = Record<string, unknown> & { id: string; version: number }
let doc: Record<string, unknown>
let patches: { body: Record<string, unknown>; status: number }[]
let socket: SocketLike | null

const json = (status: number, body: unknown, wait = LATENCY) =>
  new Promise<Response>((done) =>
    setTimeout(() => {
      done(
        new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        }),
      )
    }, wait),
  )

function server(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = urlOf(input)
  const method = init?.method ?? 'GET'
  if (url === '/api/specs') return json(200, specsWire)
  if (url === `/api/cases/${ID}` && method === 'GET') return json(200, doc)
  const one = /\/api\/cases\/[^/]+\/([a-z_]+)\/([0-9a-f-]+)$/.exec(url)
  if (one && method === 'PATCH') {
    const [, collection = '', id] = one
    const body = JSON.parse(bodyOf(init)) as Record<string, unknown>
    const { version, base: _base, ...fields } = body
    const rows = doc[collection] as Row[]
    const row = rows.find((r) => r.id === id)!
    if (version !== row.version) {
      patches.push({ body, status: 409 })
      return json(
        409,
        { message: 'Someone else wrote this first.', currentVersion: row.version },
        patchLatency,
      )
    }
    const stored = { ...row, ...fields, version: row.version + 1 }
    doc = { ...doc, [collection]: rows.map((r) => (r.id === id ? stored : r)) }
    patches.push({ body, status: 200 })
    return json(200, stored, patchLatency)
  }
  if (method === 'GET' && url.startsWith(`/api/cases/${ID}/`) && !url.endsWith('/attribution')) {
    return json(200, doc[url.split('/').pop() ?? ''] ?? [])
  }
  return json(404, { message: `unmodelled ${method} ${url}` })
}

function otherAnalystChanges(
  collection: string,
  id: string,
  fields: Record<string, unknown>,
  frame: boolean,
) {
  doc = {
    ...doc,
    [collection]: (doc[collection] as Row[]).map((r) =>
      r.id === id ? { ...r, ...fields, version: r.version + 1 } : r,
    ),
  }
  if (frame) {
    socket?.onmessage?.({
      data: JSON.stringify({ type: 'case.changed', scopes: [collection] }),
    } as MessageEvent)
  }
}

function mount(address: string, Screen: () => ReactNode, live = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  function Shell() {
    useCaseChanges(ID)
    return live ? (
      <CaseProvidersLive caseId={ID}>
        <Screen />
      </CaseProvidersLive>
    ) : (
      <Screen />
    )
  }
  const router = createMemoryRouter([{ path: '/cases/:caseId/:section', element: <Shell /> }], {
    initialEntries: [address],
  })
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

/** The frame the server publishes for a change to `collection` already committed. */
const announce = (collection: string) =>
  socket?.onmessage?.({
    data: JSON.stringify({ type: 'case.changed', scopes: [collection] }),
  } as MessageEvent)

const settle = () => new Promise((done) => setTimeout(done, LATENCY * 12))

interface Surface {
  name: string
  address: string
  Screen: () => ReactNode
  collection: string
  row: () => Row
  edit: (row: Row) => string
  field: string
  label: RegExp
  other: string
}

const SURFACES: Surface[] = [
  {
    name: 'Timeline',
    address: casePath(ID, 'timeline'),
    Screen: TimelineContainer,
    collection: 'timeline',
    row: () => (doc.timeline as Row[])[0]!,
    edit: (row) => `Edit ${String(row.description)} in full`,
    field: 'description',
    label: /^Description/,
    other: 'severity',
  },
  {
    name: 'Entities',
    address: `${casePath(ID, 'entities')}#assets`,
    Screen: EntitiesContainer,
    collection: 'systems',
    row: () => (doc.systems as Row[])[0]!,
    edit: (row) => `Edit ${String(row.hostname)} in full`,
    field: 'hostname',
    label: /^Name/,
    other: 'notes',
  },
]

beforeEach(() => {
  doc = JSON.parse(JSON.stringify(campaignCase)) as Record<string, unknown>
  patchLatency = undefined
  doc.version = 7
  patches = []
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

async function openEditor(surface: Surface, user: ReturnType<typeof userEvent.setup>) {
  mount(surface.address, surface.Screen)
  const row = surface.row()
  await user.click(await screen.findByRole('button', { name: surface.edit(row) }))
  const dialog = await screen.findByRole('dialog')
  const input = within(dialog).getByRole<HTMLInputElement>('textbox', { name: surface.label })
  await user.clear(input)
  await user.type(input, MINE)
  return { row, dialog, input }
}

describe.each(SURFACES)('an edit dialog on $name', (surface) => {
  it('stays open holding the draft, and names the field and the value that stands', async () => {
    const user = userEvent.setup()
    const { row, dialog, input } = await openEditor(surface, user)

    otherAnalystChanges(surface.collection, row.id, { [surface.field]: THEIRS }, false)
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    await settle()
    await waitFor(
      () => {
        const band = within(dialog).queryByRole('group', { name: /changed/ })
        expect({
          open: dialog.isConnected,
          shown: input.value,
          theirs: band?.textContent.includes(`Theirs: ${THEIRS}.`) ?? false,
          stored: surface.row()[surface.field],
        }).toEqual({ open: true, shown: MINE, theirs: true, stored: THEIRS })
      },
      { timeout: 10_000 },
    )
  })

  it('stores the draft once the analyst keeps it', async () => {
    const user = userEvent.setup()
    const { row, dialog } = await openEditor(surface, user)

    otherAnalystChanges(surface.collection, row.id, { [surface.field]: THEIRS }, true)
    await waitFor(() => {
      expect(within(dialog).queryByRole('group', { name: /changed/ })).not.toBeNull()
    })
    await user.click(within(dialog).getByRole('button', { name: 'Keep mine' }))
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    await settle()
    await waitFor(
      () => {
        expect({
          open: dialog.isConnected,
          stored: surface.row()[surface.field],
          sent: patches.map((one) => one.status),
        }).toEqual({
          open: false,
          stored: MINE,
          sent: [200],
        })
      },
      { timeout: 10_000 },
    )
  })

  it('stores the draft once the analyst keeps it after a refused save', async () => {
    const user = userEvent.setup()
    const { row, dialog } = await openEditor(surface, user)

    otherAnalystChanges(surface.collection, row.id, { [surface.field]: THEIRS }, false)
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    const band = await within(dialog).findByRole('group', { name: /changed/ }, { timeout: 10_000 })
    await user.click(within(band).getByRole('button', { name: 'Keep mine' }))
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    await settle()
    await waitFor(
      () => {
        expect({
          open: dialog.isConnected,
          stored: surface.row()[surface.field],
          sent: patches.map((one) => one.status),
        }).toEqual({ open: false, stored: MINE, sent: [409, 200] })
      },
      { timeout: 10_000 },
    )
  })

  it('saves a change to a field the other analyst did not touch, without asking', async () => {
    const user = userEvent.setup()
    const { row, dialog } = await openEditor(surface, user)

    otherAnalystChanges(surface.collection, row.id, { [surface.other]: 'Their change' }, false)
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    await settle()
    await waitFor(
      () => {
        expect({
          open: dialog.isConnected,
          stored: [surface.row()[surface.field], surface.row()[surface.other]],
          sent: patches.map((one) => one.status),
        }).toEqual({ open: false, stored: [MINE, 'Their change'], sent: [409, 200] })
      },
      { timeout: 10_000 },
    )
  })

  it('shows the choice when theirs is announced while the refused save is still out', async () => {
    patchLatency = 600
    const user = userEvent.setup()
    const { row, dialog, input } = await openEditor(surface, user)

    otherAnalystChanges(surface.collection, row.id, { [surface.field]: THEIRS }, false)
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    announce(surface.collection)
    await waitFor(
      () => {
        const band = within(dialog).queryByRole('group', { name: /changed/ })
        expect({
          open: dialog.isConnected,
          shown: input.value,
          theirs: band?.textContent.includes(`Theirs: ${THEIRS}.`) ?? false,
          checking: dialog.textContent.includes('Checking what they changed'),
          sent: patches.map((one) => one.status),
        }).toEqual({ open: true, shown: MINE, theirs: true, checking: false, sent: [409] })
      },
      { timeout: 10_000 },
    )
  })

  it('saves a field the other analyst did not touch when theirs is announced while the save is out', async () => {
    patchLatency = 600
    const user = userEvent.setup()
    const { row, dialog } = await openEditor(surface, user)

    otherAnalystChanges(surface.collection, row.id, { [surface.other]: 'Their change' }, false)
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    announce(surface.collection)
    await waitFor(
      () => {
        expect({
          open: dialog.isConnected,
          stored: [surface.row()[surface.field], surface.row()[surface.other]],
          sent: patches.map((one) => one.status),
        }).toEqual({ open: false, stored: [MINE, 'Their change'], sent: [409, 200] })
      },
      { timeout: 10_000 },
    )
  })
})

describe('an entry another analyst holds, as the case socket reports it', () => {
  it('names the holder in the edit dialog, and still saves the edit', async () => {
    const user = userEvent.setup()
    mount(`${casePath(ID, 'entities')}#assets`, EntitiesContainer, true)
    const row = (doc.systems as Row[])[0]!
    const edit = await screen.findByRole('button', { name: `Edit ${String(row.hostname)} in full` })
    const claim = { table: 'systems', entry_id: row.id, user_id: 'u-b', username: 'Jo Meyer', session_id: 's-b', taken_at: 1 }
    socket?.onmessage?.({ data: JSON.stringify({ type: 'presence', roster: [], claims: [claim] }) } as MessageEvent)

    await user.click(edit)
    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByText('Jo Meyer is editing this entry')).toBeInTheDocument()
    const input = within(dialog).getByRole<HTMLInputElement>('textbox', { name: /^Name/ })
    await user.clear(input)
    await user.type(input, MINE)
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(
      () => {
        expect({ stored: (doc.systems as Row[])[0]!.hostname, sent: patches.map((one) => one.status) }).toEqual({
          stored: MINE,
          sent: [200],
        })
      },
      { timeout: 10_000 },
    )
  })
})
