/**
 * **A refused profile write is said out loud, and the control goes back to
 * what the server serves.**
 *
 * The colour, the initials and the picture removal each called `mutate` with
 * no handler, so a refusal left the swatch selected, the field holding letters
 * nobody stored, and nothing on the screen saying so -- the analyst finds out
 * on the next reload. -> #830
 *
 * Driven through the container against a stubbed `fetch` rather than a stubbed
 * `@/api/appearance`: the sentence an analyst reads is the server's own, and it
 * only exists once `client.ts` has mapped the response into an `ApiError`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setSession } from '@/api/session'
import { toastQueue } from '@/components/blocks/notify'
import { ToastRegion } from '@/components/ui/toast'
import { urlOf } from '@/test/fetchArgs'

import { AccountContainer } from './AccountContainer'

vi.mock('@/lib/useGround', () => ({
  useGround: () => ({ theme: 'light', setTheme: vi.fn() }),
}))

/** What the roster serves for the analyst reading the dialog. */
let stored: { tone?: number; initials: string; avatarVersion?: number }

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
  stored = { tone: 1, initials: 'AB', avatarVersion: 2 }
  refusal = null
  fetchMock.mockReset()
  fetchMock.mockImplementation((input, init) => {
    const method = (init?.method ?? 'GET').toUpperCase()
    if (method === 'GET') {
      return Promise.resolve(json({ rows: [{ userId: 'ada', ...stored }] }))
    }
    if (refusal) return Promise.resolve(json(refusal.body, refusal.status))
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : {}
    if (urlOf(input).includes('/avatar')) delete stored.avatarVersion
    // The server upper-cases the initials it stores, which is what makes the
    // served value distinguishable from the one that was typed.
    if (typeof body.initials === 'string') stored.initials = body.initials.toUpperCase()
    if ('tone' in body) {
      if (body.tone === null) delete stored.tone
      else stored.tone = Number(body.tone)
    }
    return Promise.resolve(json(stored))
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  toastQueue.clear()
  vi.unstubAllGlobals()
})

function open() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <AccountContainer isOpen onOpenChange={vi.fn()} />
      <ToastRegion queue={toastQueue} />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

/**
 * The two refusals a write meets: one about the body, one about the analyst.
 *
 * Counted rather than found: a 422 names the field it refused, so the card
 * draws the server's sentence as its own description and again in the list
 * beneath it.
 */
const REFUSED: readonly [number, unknown, () => number][] = [
  [
    422,
    { errors: [{ field: 'tone', message: 'Not a colour this install offers.' }] },
    () => screen.getAllByText('Not a colour this install offers.').length,
  ],
  [403, { message: 'You may not change this.' }, () => screen.getAllByText('You may not change this.').length],
]

/** Waits for the roster read, so the controls start on the served values. */
async function served() {
  expect(await screen.findByRole('button', { name: 'Colour 2', pressed: true })).toBeInTheDocument()
}

describe('the colour', () => {
  it.each(REFUSED)('says so and leaves the served swatch chosen on a %i', async (status, body, said) => {
    const user = open()
    await served()
    refusal = { status, body }

    await user.click(screen.getByRole('button', { name: 'Colour 1' }))

    expect(await screen.findByText('your colour was not saved.')).toBeInTheDocument()
    expect(said(), 'the server\'s own sentence did not reach the screen').toBeGreaterThan(0)
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Colour 2' }),
        'the swatch kept the colour the server refused to store',
      ).toHaveAttribute('aria-pressed', 'true')
    })
    expect(screen.getByRole('button', { name: 'Colour 1' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('keeps the chosen swatch when the write lands', async () => {
    const user = open()
    await served()

    await user.click(screen.getByRole('button', { name: 'Colour 1' }))

    expect(await screen.findByRole('button', { name: 'Colour 1', pressed: true })).toBeInTheDocument()
    expect(toastQueue.visibleToasts, 'an accepted write raised a toast').toHaveLength(0)
  })
})

describe('the initials', () => {
  it.each(REFUSED)('says so and puts the served letters back on a %i', async (status, body, said) => {
    const user = open()
    await served()
    refusal = { status, body }

    const field = screen.getByLabelText('Initials')
    await user.clear(field)
    await user.type(field, 'zz')
    await user.tab()

    expect(await screen.findByText('your initials was not saved.')).toBeInTheDocument()
    expect(said(), 'the server\'s own sentence did not reach the screen').toBeGreaterThan(0)
    await waitFor(() => {
      expect(field, 'the field kept letters the server refused to store').toHaveValue('AB')
    })
  })

  it('shows the letters the server stored, not the ones that were typed', async () => {
    const user = open()
    await served()

    const field = screen.getByLabelText('Initials')
    await user.clear(field)
    await user.type(field, 'zz')
    await user.tab()

    await waitFor(() => {
      expect(field).toHaveValue('ZZ')
    })
  })
})

describe('removing the picture', () => {
  it.each(REFUSED)('says so and leaves the picture in place on a %i', async (status, body, said) => {
    const user = open()
    await served()
    refusal = { status, body }

    await user.click(screen.getByRole('button', { name: 'Remove' }))

    expect(await screen.findByText('your picture was not saved.')).toBeInTheDocument()
    expect(said(), 'the server\'s own sentence did not reach the screen').toBeGreaterThan(0)
    expect(
      screen.getByRole('button', { name: 'Remove' }),
      'the row stopped offering the removal the server refused',
    ).toBeInTheDocument()
  })

  it('drops the picture when the write lands', async () => {
    const user = open()
    await served()

    await user.click(screen.getByRole('button', { name: 'Remove' }))

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument()
    })
    expect(toastQueue.visibleToasts, 'an accepted write raised a toast').toHaveLength(0)
  })
})
