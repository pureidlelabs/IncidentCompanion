/**
 * **A refused upload stores nothing, so it moves nothing in the picture row.**
 *
 * The attack is the second write: a refusal that outlives the write after it
 * tells an analyst their picture was rejected when the thing on screen is the
 * removal they just made land, and a row offering `Remove` after a refusal
 * offers to remove a picture that was never stored.
 *
 * Driven through the container against a stubbed `fetch`, because both states
 * are the container's and the row three components down is where they are read.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setSession } from '@/api/session'
import { urlOf } from '@/test/fetchArgs'

import { AccountContainer } from './AccountContainer'

vi.mock('@/lib/useGround', () => ({
  useGround: () => ({ theme: 'light', setTheme: vi.fn() }),
}))

/** What the roster serves for the analyst reading the dialog. */
let stored: { initials: string; avatarVersion?: number }

/** What the next write answers, or null for the write that lands. */
let refusal: { status: number; body: unknown } | null

const fetchMock = vi.fn<typeof fetch>()

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

beforeEach(() => {
  setSession({ userId: 'ada', username: 'Ada' })
  stored = { initials: 'AB', avatarVersion: 2 }
  refusal = null
  fetchMock.mockReset()
  fetchMock.mockImplementation((input, init) => {
    const method = (init?.method ?? 'GET').toUpperCase()
    if (method === 'GET') {
      return Promise.resolve(json({ rows: [{ userId: 'ada', ...stored }] }))
    }
    if (refusal) return Promise.resolve(json(refusal.body, refusal.status))
    if (urlOf(input).includes('/avatar')) {
      if (method === 'DELETE') delete stored.avatarVersion
      else stored.avatarVersion = (stored.avatarVersion ?? 0) + 1
    }
    return Promise.resolve(json(stored))
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function open() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <AccountContainer isOpen onOpenChange={vi.fn()} />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

/**
 * The file door is opened by a button, so nothing labels the input itself, and
 * the dialog draws into a portal rather than into the render container.
 */
function door(): HTMLInputElement {
  const input = document.body.querySelector<HTMLInputElement>('input[type="file"]')
  if (input === null) throw new Error('the picture row drew no file input')
  return input
}

const TOO_BIG = {
  status: 413,
  body: { message: 'That file is 4.2MB. The largest this install stores is 2MB.' },
}

function image(): File {
  return new File(['x'], 'face.png', { type: 'image/png' })
}

/** Waits for the roster read, so the row starts on the served picture. */
async function served(name: string): Promise<void> {
  expect(await screen.findByRole('button', { name })).toBeInTheDocument()
}

describe('a refused upload', () => {
  it('stops being said once a later write lands', async () => {
    const user = open()
    await served('Replace picture')
    refusal = TOO_BIG

    await user.upload(door(), image())
    expect(await screen.findByText('That image was not stored')).toBeInTheDocument()

    refusal = null
    await user.click(screen.getByRole('button', { name: 'Remove' }))

    await waitFor(() => {
      expect(
        screen.queryByText('That image was not stored'),
        'the removal landed and the refused upload was still on screen',
      ).not.toBeInTheDocument()
    })
  })

  it('leaves a row with no served picture offering nothing to remove', async () => {
    stored = { initials: 'AB' }
    const user = open()
    await served('Choose picture')
    refusal = TOO_BIG

    await user.upload(door(), image())
    expect(await screen.findByText('That image was not stored')).toBeInTheDocument()

    expect(
      screen.getByRole('button', { name: 'Choose picture' }),
      'the row read as though the refused image had been stored',
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Remove' }),
      'the row offered to remove a picture the server would not store',
    ).not.toBeInTheDocument()
  })
})
