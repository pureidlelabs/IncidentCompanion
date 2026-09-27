/**
 * The case's own fields, written against what the analyst read.
 *
 * No module is mocked: the real container, hooks and request layer, and the
 * real change feed reading a `case.changed` frame off a fake socket. Only the
 * network is a model, applying the server's version rule with a real delay,
 * so a write, its answer and the record served again each get a render of
 * their own. A transport answering in the same task merges those renders and
 * certifies a screen no browser draws.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { setSocketFactory, type SocketLike } from '@/api/caseSocket'
import { keys } from '@/api/queryKeys'
import { setSession } from '@/api/session'
import { setTransport } from '@/api/transport'
import { useCaseChanges } from '@/api/useCaseChanges'
import { OverviewContainer } from '@/app/case/OverviewContainer'
import { casePath } from '@/components/blocks/case-paths'
import { campaignCase } from '@/fixtures/campaign'
import { campaignCompliance } from '@/fixtures/compliance'
import { specsWire } from '@/fixtures/specs'

/** The address a request was sent to, whatever form the caller gave it in. */
const urlOf = (input: RequestInfo | URL) =>
  input instanceof Request ? input.url : input.toString()
/** The JSON body a request carried, or nothing. */
const bodyOf = (init?: RequestInit) => (typeof init?.body === 'string' ? init.body : '')

const ID = campaignCase.id
/** Each analyst's value, distinct from every word the band draws around them. */
const MINE = 'Mine 2208'
const THEIRS = 'Theirs 7731'
let latency = 30
/** How long a read of the case takes to be answered, when it is not `latency`. */
let readLatency: number | undefined
/** How long a PATCH takes to be answered, when it is not `latency`. */
let patchLatency: number | undefined

let row: Record<string, unknown>
let patches: { version: unknown; status: number }[]
let socket: SocketLike | null

const json = (status: number, body: unknown, wait = latency) =>
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
  if (url === `/api/cases/${ID}/compliance`) return json(200, campaignCompliance)
  if (url === `/api/cases/${ID}` && method === 'GET') return json(200, row, readLatency)
  if (url === `/api/cases/${ID}` && method === 'PATCH') {
    const { version, ...rest } = JSON.parse(bodyOf(init)) as Record<string, unknown>
    if (version !== row.version) {
      patches.push({ version, status: 409 })
      return json(
        409,
        { message: 'Someone else wrote this first.', currentVersion: row.version },
        patchLatency,
      )
    }
    row = { ...row, ...rest, version: (row.version as number) + 1 }
    patches.push({ version, status: 200 })
    return json(200, row, patchLatency)
  }
  return json(404, { message: `unmodelled ${method} ${url}` })
}

/** Another analyst's committed write, and the frame the server publishes for it unless held back. */
function otherAnalystWrites(fields: Record<string, unknown>, frame = true) {
  row = { ...row, ...fields, version: (row.version as number) + 1 }
  if (frame) {
    socket?.onmessage?.({
      data: JSON.stringify({ type: 'case.changed', scopes: ['cases'] }),
    } as MessageEvent)
  }
}

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  function Shell() {
    useCaseChanges(ID)
    return <OverviewContainer />
  }
  const router = createMemoryRouter([{ path: '/cases/:caseId/:section', element: <Shell /> }], {
    initialEntries: [casePath(ID, 'overview')],
  })
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return client
}

async function field(user: ReturnType<typeof userEvent.setup>, name: string, value: string) {
  await user.click(await screen.findByRole('tab', { name: 'Properties' }))
  const found = await screen.findByRole('textbox', { name })
  await waitFor(() => {
    expect(found).toHaveValue(value)
  })
  return found as HTMLInputElement
}

const servedAt = async (client: QueryClient, version: number) => {
  await waitFor(() => {
    expect(client.getQueryData<{ version: number }>(keys.case(ID))?.version).toBe(version)
  })
}

const settle = () => new Promise((done) => setTimeout(done, latency * 10))

/** The frame the server publishes for a write already committed. */
const announce = () =>
  socket?.onmessage?.({
    data: JSON.stringify({ type: 'case.changed', scopes: ['cases'] }),
  } as MessageEvent)

/** Whether any field says it is waiting to learn why it was refused. */
const waiting = () => document.body.textContent.includes('Not saved yet')

/** The band a collision on `label` draws beside the field. */
const band = (label: string) =>
  screen.queryByRole('group', { name: new RegExp(`changed ${label}`) })

beforeEach(() => {
  row = JSON.parse(JSON.stringify(campaignCase)) as Record<string, unknown>
  row.version = 7
  latency = 30
  patchLatency = undefined
  readLatency = undefined
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

describe('a case field another analyst saves while this analyst is changing it', () => {
  it('is not written over theirs when the analyst leaves it, and shows both values', async () => {
    const user = userEvent.setup()
    const client = mount()
    const title = await field(user, 'Title', campaignCase.title)
    await user.clear(title)
    await user.type(title, MINE)

    otherAnalystWrites({ title: THEIRS })
    await servedAt(client, 8)
    await user.tab()
    await settle()
    await waitFor(
      () => {
        expect({
          sent: patches,
          stored: row.title,
          shown: title.value,
          theirs: band('Title')?.textContent.includes(`Theirs: ${THEIRS}.`) ?? false,
        }).toEqual({ sent: [], stored: THEIRS, shown: MINE, theirs: true })
      },
      { timeout: 10_000 },
    )
  })

  it('sends nothing for a field the analyst only put the cursor in', async () => {
    const user = userEvent.setup()
    const client = mount()
    const title = await field(user, 'Title', campaignCase.title)
    await user.click(title)

    otherAnalystWrites({ title: THEIRS })
    await servedAt(client, 8)
    await user.tab()
    await settle()
    await waitFor(
      () => {
        expect({ sent: patches, stored: row.title, shown: title.value }).toEqual({
          sent: [],
          stored: THEIRS,
          shown: THEIRS,
        })
      },
      { timeout: 10_000 },
    )
  })

  it('keeps what the analyst typed when the refusal arrives before the announcement', async () => {
    const user = userEvent.setup()
    const client = mount()
    const title = await field(user, 'Title', campaignCase.title)
    await user.clear(title)
    await user.type(title, MINE)

    otherAnalystWrites({ title: THEIRS }, false)
    await user.tab()
    await servedAt(client, 8)
    await settle()
    // Leaving the field again is not a choice.
    await user.click(title)
    await user.tab()
    await settle()
    await waitFor(
      () => {
        expect({
          sent: patches,
          stored: row.title,
          shown: title.value,
          theirs: band('Title')?.textContent.includes(`Theirs: ${THEIRS}.`) ?? false,
        }).toEqual({
          sent: [{ version: 7, status: 409 }],
          stored: THEIRS,
          shown: MINE,
          theirs: true,
        })
      },
      { timeout: 10_000 },
    )
  })

  it('shows both values when theirs is announced while the refused write is still out', async () => {
    patchLatency = 600
    const user = userEvent.setup()
    const client = mount()
    const title = await field(user, 'Title', campaignCase.title)
    await user.clear(title)
    await user.type(title, MINE)

    otherAnalystWrites({ title: THEIRS }, false)
    await user.tab()
    announce()
    await servedAt(client, 8)
    await waitFor(
      () => {
        expect({
          sent: patches,
          stored: row.title,
          shown: title.value,
          theirs: band('Title')?.textContent.includes(`Theirs: ${THEIRS}.`) ?? false,
          waiting: waiting(),
        }).toEqual({
          sent: [{ version: 7, status: 409 }],
          stored: THEIRS,
          shown: MINE,
          theirs: true,
          waiting: false,
        })
      },
      { timeout: 10_000 },
    )
  })

  it('says the change is not saved while the refusal is checked, then shows what the server holds', async () => {
    const user = userEvent.setup()
    const client = mount()
    const title = await field(user, 'Title', campaignCase.title)
    await user.clear(title)
    await user.type(title, MINE)

    otherAnalystWrites({ title: THEIRS }, false)
    readLatency = 1500
    await user.tab()
    await waitFor(
      () => {
        expect({ sent: patches, waiting: waiting(), shown: title.value }).toEqual({
          sent: [{ version: 7, status: 409 }],
          waiting: true,
          shown: MINE,
        })
      },
      { timeout: 5_000 },
    )
    await servedAt(client, 8)
    await waitFor(
      () => {
        expect({
          stored: row.title,
          shown: title.value,
          theirs: band('Title')?.textContent.includes(`Theirs: ${THEIRS}.`) ?? false,
          waiting: waiting(),
        }).toEqual({ stored: THEIRS, shown: MINE, theirs: true, waiting: false })
      },
      { timeout: 10_000 },
    )
  })

  it('stores the analyst value over theirs when the analyst keeps it', async () => {
    const user = userEvent.setup()
    const client = mount()
    const title = await field(user, 'Title', campaignCase.title)
    await user.clear(title)
    await user.type(title, MINE)
    otherAnalystWrites({ title: THEIRS })
    await servedAt(client, 8)

    await user.click(within(band('Title')!).getByRole('button', { name: 'Keep mine' }))
    await settle()
    await waitFor(
      () => {
        expect({
          sent: patches,
          stored: row.title,
          shown: title.value,
          band: band('Title'),
        }).toEqual({
          sent: [{ version: 8, status: 200 }],
          stored: MINE,
          shown: MINE,
          band: null,
        })
      },
      { timeout: 10_000 },
    )
  })

  it('stores nothing when the analyst takes theirs', async () => {
    const user = userEvent.setup()
    const client = mount()
    const title = await field(user, 'Title', campaignCase.title)
    await user.clear(title)
    await user.type(title, MINE)
    otherAnalystWrites({ title: THEIRS })
    await servedAt(client, 8)

    await user.click(within(band('Title')!).getByRole('button', { name: 'Take theirs' }))
    await settle()
    await waitFor(
      () => {
        expect({
          sent: patches,
          stored: row.title,
          shown: title.value,
          band: band('Title'),
        }).toEqual({
          sent: [],
          stored: THEIRS,
          shown: THEIRS,
          band: null,
        })
      },
      { timeout: 10_000 },
    )
  })
})

describe('a case field another analyst did not touch', () => {
  it('is stored against the newer version when theirs was announced first', async () => {
    const user = userEvent.setup()
    const client = mount()
    const title = await field(user, 'Title', campaignCase.title)
    await user.clear(title)
    await user.type(title, MINE)
    otherAnalystWrites({ summary: 'Their summary' })
    await servedAt(client, 8)
    await user.tab()
    await settle()
    await waitFor(
      () => {
        expect({
          sent: patches,
          title: row.title,
          summary: row.summary,
          band: band('Title'),
        }).toEqual({
          sent: [{ version: 8, status: 200 }],
          title: MINE,
          summary: 'Their summary',
          band: null,
        })
      },
      { timeout: 10_000 },
    )
  })

  it('is stored when theirs landed but was not yet announced', async () => {
    const user = userEvent.setup()
    mount()
    const title = await field(user, 'Title', campaignCase.title)
    await user.clear(title)
    await user.type(title, MINE)
    otherAnalystWrites({ summary: 'Their summary' }, false)
    await user.tab()
    await settle()
    await waitFor(
      () => {
        expect({
          sent: patches,
          title: row.title,
          summary: row.summary,
          band: band('Title'),
        }).toEqual({
          sent: [
            { version: 7, status: 409 },
            { version: 8, status: 200 },
          ],
          title: MINE,
          summary: 'Their summary',
          band: null,
        })
      },
      { timeout: 10_000 },
    )
  })
  it('is stored when theirs is announced while the refused write is still out', async () => {
    patchLatency = 600
    const user = userEvent.setup()
    const client = mount()
    const title = await field(user, 'Title', campaignCase.title)
    await user.clear(title)
    await user.type(title, MINE)
    otherAnalystWrites({ summary: 'Their summary' }, false)
    await user.tab()
    announce()
    await servedAt(client, 8)
    await waitFor(
      () => {
        expect({
          sent: patches,
          title: row.title,
          summary: row.summary,
          waiting: waiting(),
        }).toEqual({
          sent: [
            { version: 7, status: 409 },
            { version: 8, status: 200 },
          ],
          title: MINE,
          summary: 'Their summary',
          waiting: false,
        })
      },
      { timeout: 10_000 },
    )
  })
})

describe('one analyst alone on the Overview', () => {
  it('stores two fields left inside one round trip, and blames nobody', async () => {
    latency = 80
    const user = userEvent.setup()
    mount()
    const title = await field(user, 'Title', campaignCase.title)
    const customer = screen.getByRole('textbox', { name: 'Customer' })

    await user.clear(title)
    await user.type(title, 'T')
    await user.click(customer)
    await user.clear(customer)
    await user.type(customer, 'C')
    await user.tab()
    await settle()
    await waitFor(
      () => {
        expect({
          sent: patches,
          stored: [row.title, row.customer],
          bands: screen.queryAllByRole('group', { name: /changed/ }).length,
        }).toEqual({
          sent: [
            { version: 7, status: 200 },
            { version: 8, status: 200 },
          ],
          stored: ['T', 'C'],
          bands: 0,
        })
      },
      { timeout: 10_000 },
    )
  })
})
