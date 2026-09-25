/**
 * A note whose words the install holds unsaved, as its writer sees it.
 *
 * No module is mocked: the real notes container, request layer, case socket
 * and prose channel. The network is a model: reads are answered as the server
 * answers them, and the socket answers the channel's opening with an empty
 * document and then says what the install holds.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as encoding from 'lib0/encoding'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { writeSyncStep2 } from 'y-protocols/sync'
import * as Y from 'yjs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { setSocketFactory, type SocketLike } from '@/api/caseSocket'
import { setSession } from '@/api/session'
import { setTransport } from '@/api/transport'
import { campaignCase } from '@/fixtures/campaign'
import { specsWire } from '@/fixtures/specs'

import { NotesContainer } from './NotesContainer'

const ID = campaignCase.id
const note = campaignCase.casenotes[0]!
const FIELD = `casenotes:${note.id}:document`

let socket: SocketLike | null

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
  return json(404, { message: `unmodelled ${method} ${url.pathname}` })
}

/** An empty document, as the install answers a channel opening on a field with no words stored. */
function emptyDocument(): string {
  const encoder = encoding.createEncoder()
  writeSyncStep2(encoder, new Y.Doc())
  return btoa(String.fromCharCode(...encoding.toUint8Array(encoder)))
}

/** A frame from the install, delivered as the socket delivers it. */
function installSays(message: Record<string, unknown>) {
  act(() => {
    socket?.onmessage?.({ data: JSON.stringify(message) } as MessageEvent)
  })
}

beforeEach(() => {
  socket = null
  setTransport(server)
  setSocketFactory(() => {
    const live: SocketLike = {
      readyState: 1,
      send: (data: string) => {
        const sent = JSON.parse(data) as { type?: string; field?: string }
        if (sent.type === 'prose.sync' && sent.field) {
          queueMicrotask(() => {
            live.onmessage?.({
              data: JSON.stringify({
                type: 'prose.sync',
                field: sent.field,
                update: emptyDocument(),
              }),
            } as MessageEvent)
          })
        }
      },
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

function draw() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [
      { path: '/cases/:caseId/:section', element: <NotesContainer /> },
      { path: '/elsewhere', element: <p>Elsewhere</p> },
    ],
    { initialEntries: [`/cases/${ID}/notes`] },
  )
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

/** The note's editor, once the channel has settled and it is writable. */
async function editor() {
  const found = await screen.findByRole('textbox', { name: 'Note' })
  await waitFor(() => {
    expect(found.getAttribute('contenteditable')).toBe('true')
  })
  return found
}

function clipboard() {
  const written: string[] = []
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: (value: string) => {
        written.push(value)
        return Promise.resolve()
      },
    },
  })
  return written
}

describe('a note whose words the install holds unsaved', () => {
  it('tells its writer, offers the text to copy, and lets them go on writing', async () => {
    const user = userEvent.setup()
    // After `setup`, which puts a clipboard of its own in place.
    const written = clipboard()
    draw()
    const field = await editor()
    await user.type(field, 'Mailbox rule found at 09:14')

    installSays({ type: 'prose.state', field: FIELD, state: 'unsaved' })

    expect(await screen.findByText('Not saved yet')).toBeVisible()
    await user.type(field, ', forwarding outside')
    expect(field).toHaveTextContent('Mailbox rule found at 09:14, forwarding outside')
    await user.click(screen.getByRole('button', { name: /Copy the text/ }))
    await waitFor(() => {
      expect(written).toEqual(['Mailbox rule found at 09:14, forwarding outside'])
    })
  })

  it('takes the notice away once the install says the words are saved', async () => {
    draw()
    await editor()
    installSays({ type: 'prose.state', field: FIELD, state: 'unsaved' })
    expect(await screen.findByText('Not saved yet')).toBeVisible()

    installSays({ type: 'prose.state', field: FIELD, state: 'saved' })

    await waitFor(() => {
      expect(screen.queryByText('Not saved yet')).toBeNull()
    })
  })

  it('says it once the words are given up, and offers the copy again', async () => {
    const user = userEvent.setup()
    const written = clipboard()
    draw()
    await user.type(await editor(), 'given up')
    installSays({ type: 'prose.state', field: FIELD, state: 'unsaved' })

    installSays({ type: 'prose.state', field: FIELD, state: 'lost' })

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('This text can no longer be saved')
    await user.click(within(dialog).getByRole('button', { name: /Copy the text/ }))
    await waitFor(() => {
      expect(written).toEqual(['given up'])
    })
  })

  it('asks before its writer leaves with the words unsaved, and leaves once told to', async () => {
    const user = userEvent.setup()
    const router = draw()
    await editor()
    installSays({ type: 'prose.state', field: FIELD, state: 'unsaved' })
    await screen.findByText('Not saved yet')

    await act(() => router.navigate('/elsewhere'))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Leave with the text unsaved?')
    await waitFor(() => {
      expect(within(dialog).getByRole('button', { name: /Copy the text/ })).toBeVisible()
    })
    expect(router.state.location.pathname).toBe(`/cases/${ID}/notes`)
    await user.click(screen.getByRole('button', { name: 'Leave' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/elsewhere')
    })
  })
})
