import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { CaseLink, Message } from '@/api/caseSocket'
import type * as ProseSync from '@/api/proseSync'
import type { ProseChannel } from '@/api/proseSync'
import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

/**
 * The notes screen while the install holds a note's words unsaved: told
 * beside the editor with the text to copy, nothing locked, told again when the
 * words are given up, and asked before leaving with them unsaved.
 *
 * The channel is the real one, over a link standing in for the install, so the
 * frame the server sends is what moves the screen.
 */

/** The install, as far as a screen can tell: it says what it holds. */
class Install implements CaseLink {
  connected = true
  private readonly listeners = new Set<(message: Message) => void>()
  /** What the screen sends is not what these cases are about. */
  send() {
    return undefined
  }
  subscribe(listener: (message: Message) => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  onConnected(listener: (up: boolean) => void) {
    listener(true)
    return () => undefined
  }
  says(message: Message) {
    act(() => {
      for (const listener of [...this.listeners]) listener(message)
    })
  }
}

let install = new Install()
const channels = new Map<string, ProseChannel>()

/** Told whenever a channel's status moves, so the screen draws what the channel says. */
const statusListeners = new Set<() => void>()

vi.mock('@/api/proseSync', async (original) => {
  const real = await original<typeof ProseSync>()
  const { useSyncExternalStore } = await import('react')
  const follow = (listener: () => void) => {
    statusListeners.add(listener)
    return () => statusListeners.delete(listener)
  }
  return {
    ...real,
    useProseSync: (_caseId: string, docKey: string) => {
      let channel = docKey ? channels.get(docKey) : undefined
      if (docKey && !channel) {
        channel = new real.ProseChannel(install, docKey, {
          onStatus: () => {
            for (const listener of [...statusListeners]) listener()
          },
        })
        channels.set(docKey, channel)
      }
      // The channel's own status, so a lock it takes reaches the editor; nothing here answers the opening.
      const status = useSyncExternalStore(follow, () => channel?.status ?? 'ready')
      return {
        channel: channel ?? null,
        status: status === 'opening' ? ('ready' as const) : status,
        settled: true,
      }
    },
  }
})

const { NotesScreen } = await import('./notes')

afterEach(() => {
  for (const channel of channels.values()) channel.destroy()
  channels.clear()
  install = new Install()
})

const note = campaignCase.casenotes[0]!
const FIELD = `casenotes:${note.id}:document`

function draw() {
  const router = createMemoryRouter(
    [
      {
        path: '/notes',
        element: <NotesScreen kase={campaignCase} specs={specsFixture} caseId={campaignCase.id} />,
      },
      { path: '/elsewhere', element: <p>Elsewhere</p> },
    ],
    { initialEntries: ['/notes'] },
  )
  render(<RouterProvider router={router} />)
  return router
}

const field = () => screen.getByRole('textbox', { name: 'Note' })

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
  it('says so beside the editor, offers the text to copy, and leaves the editor writable', async () => {
    const user = userEvent.setup()
    // After `setup`, which puts a clipboard of its own in place.
    const written = clipboard()
    draw()
    await user.type(field(), 'Mailbox rule found at 09:14')
    expect(screen.queryByText('Not saved yet')).toBeNull()

    install.says({ type: 'prose.state', field: FIELD, state: 'unsaved' })

    expect(screen.getByText('Not saved yet')).toBeVisible()
    await user.type(field(), ', forwarding outside')
    expect(field()).toHaveTextContent('Mailbox rule found at 09:14, forwarding outside')
    await user.click(screen.getByRole('button', { name: /Copy the text/ }))
    await waitFor(() => {
      expect(written).toEqual(['Mailbox rule found at 09:14, forwarding outside'])
    })
  })

  it('takes the notice away once the install says the words are saved', () => {
    draw()
    install.says({ type: 'prose.state', field: FIELD, state: 'unsaved' })
    expect(screen.getByText('Not saved yet')).toBeVisible()
    install.says({ type: 'prose.state', field: FIELD, state: 'saved' })
    expect(screen.queryByText('Not saved yet')).toBeNull()
  })

  it('says it once the words are given up, and offers the copy again', async () => {
    const user = userEvent.setup()
    // After `setup`, which puts a clipboard of its own in place.
    const written = clipboard()
    draw()
    await user.type(field(), 'given up')
    install.says({ type: 'prose.state', field: FIELD, state: 'unsaved' })
    install.says({ type: 'prose.state', field: FIELD, state: 'lost' })

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('This text can no longer be saved')
    await user.click(within(dialog).getByRole('button', { name: /Copy the text/ }))
    await waitFor(() => {
      expect(written).toEqual(['given up'])
    })
  })

  it("ignores a state it does not know, and another note's", () => {
    draw()
    install.says({ type: 'prose.state', field: FIELD, state: 'maybe' })
    install.says({ type: 'prose.state', field: 'casenotes:another:document', state: 'unsaved' })
    expect(screen.queryByText('Not saved yet')).toBeNull()
  })

  it('asks before the analyst leaves with the words unsaved, and leaves once told to', async () => {
    const user = userEvent.setup()
    const router = draw()
    install.says({ type: 'prose.state', field: FIELD, state: 'unsaved' })

    await act(() => router.navigate('/elsewhere'))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Leave with the text unsaved?')
    // The dialog fades in from `opacity: 0` on animation frames, which a loaded worker holds back.
    await waitFor(() => {
      expect(within(dialog).getByRole('button', { name: /Copy the text/ })).toBeVisible()
    })
    expect(router.state.location.pathname).toBe('/notes')

    await user.click(screen.getByRole('button', { name: 'Leave' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/elsewhere')
    })
  })

  it('lets the analyst leave without asking once the words are saved', async () => {
    const router = draw()
    install.says({ type: 'prose.state', field: FIELD, state: 'unsaved' })
    install.says({ type: 'prose.state', field: FIELD, state: 'saved' })

    await act(() => router.navigate('/elsewhere'))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/elsewhere')
    })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('holds a closing tab only while the words are unsaved', () => {
    const unloading = () => {
      const event = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(event)
      return event.defaultPrevented
    }
    draw()
    expect(unloading()).toBe(false)
    install.says({ type: 'prose.state', field: FIELD, state: 'unsaved' })
    expect(unloading()).toBe(true)
    install.says({ type: 'prose.state', field: FIELD, state: 'saved' })
    expect(unloading()).toBe(false)
  })

  it('gives way to the refusal once the report is sent', () => {
    draw()
    install.says({ type: 'prose.state', field: FIELD, state: 'unsaved' })
    install.says({
      type: 'prose.refused',
      field: FIELD,
      reason: 'report-sent',
      sentAt: '2026-09-25T10:00:00.000Z',
    })
    expect(screen.queryByText('Not saved yet')).toBeNull()
    expect(field().getAttribute('contenteditable')).toBe('false')
  })
})
