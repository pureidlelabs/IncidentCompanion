/**
 * **A refused profile write is said out loud, and the control goes back to
 * what the server serves.**
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

import { AccountProfileSection } from '@/components/blocks/account-profile-section'

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
 * **The 422 carries a Zod issue**, which is what the server sends and what
 * `ApiError.fieldErrors` reads -- `path`, never `field`. A body naming the
 * field the other way draws a row with no field on it and still passes an
 * assertion about the sentence.
 */
const REFUSED: readonly [number, unknown, string][] = [
  [
    422,
    { errors: [{ path: ['tone'], message: 'Not a colour this install offers.' }] },
    'Not a colour this install offers.',
  ],
  [403, { message: 'You may not change this.' }, 'You may not change this.'],
]

/**
 * The server's own sentence, wherever the card drew it.
 *
 * All of them, because a 422 draws it twice: as the card's description and
 * again beside the field it named. Absent, this throws.
 */
function says(said: string): void {
  screen.getAllByText(said)
}

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

    expect(await screen.findByText('The colour was not saved.')).toBeInTheDocument()
    says(said)
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

    expect(await screen.findByText('The initials were not saved.')).toBeInTheDocument()
    says(said)
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
    // The patch answers with the row as stored, so a second read to learn what
    // the write already said is a round trip the analyst waits through.
    expect(
      fetchMock.mock.calls.filter(([, init]) => (init?.method ?? 'GET') === 'GET'),
      'the stored letters arrived by re-reading the roster',
    ).toHaveLength(1)
  })
})

describe('removing the picture', () => {
  it.each(REFUSED)('says so and leaves the picture in place on a %i', async (status, body, said) => {
    const user = open()
    await served()
    refusal = { status, body }

    await user.click(screen.getByRole('button', { name: 'Remove' }))

    expect(await screen.findByText('The picture was not removed.')).toBeInTheDocument()
    says(said)
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

/**
 * **One control's refusal is not another's.**
 *
 * A single signal for "something was refused" put both controls back, so a
 * colour the server would not take also took whatever was half typed in the
 * initials field -- and the press that sends the colour is the same press that
 * blurs the field, so the two are always in flight together.
 *
 * Rendered against the section rather than the container: the initials write
 * has to still be unanswered when the colour's refusal lands, which is the
 * ordering that a real server decides.
 */
describe('two controls refused separately', () => {
  it('leaves the letters being typed when the colour is refused', async () => {
    const user = userEvent.setup()
    render(
      <AccountProfileSection
        name="Ada"
        tone={1}
        initials="AB"
        writes={{
          setPicture: vi.fn(),
          clearPicture: vi.fn(),
          setTone: () => Promise.reject(new Error('refused')),
          setInitials: () => new Promise<void>(() => undefined),
        }}
      />,
    )

    const field = screen.getByLabelText('Initials')
    await user.clear(field)
    await user.type(field, 'zz')
    await user.click(screen.getByRole('button', { name: 'Colour 1' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Colour 2' })).toHaveAttribute('aria-pressed', 'true')
    })
    expect(field, 'the refused colour took the letters being typed with it').toHaveValue('zz')
  })
})
