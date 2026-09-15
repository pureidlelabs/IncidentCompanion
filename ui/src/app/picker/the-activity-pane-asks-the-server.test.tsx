/**
 * The controls on the Activity pane reach the request, with the values they show.
 *
 * The pane used to call the reader with two literals and hand fifty rows of
 * one day to a block that filtered them itself, so choosing 30 days or
 * Critical narrowed a page rather than the table.
 *
 * **Asserted on the value, not on the string changing.** `since` is
 * `Date.now()` to the millisecond, so any refetch at all produces a different
 * query -- an assertion that the string moved is satisfied by the clock, and a
 * pane that ignored the choice and always asked for 24 hours passed it. -> #663
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const sent = vi.hoisted(() => ({ paths: [] as string[] }))

vi.mock('@/api/client', () => ({
  request: (path: string) => {
    sent.paths.push(path)
    return Promise.resolve({
      events: [],
      counts: { authentication: 3, administration: 1 },
      outcomes: { success: 3, failure: 1 },
      severities: { High: 2, Critical: 1 },
      nextCursor: null,
    })
  },
}))

const { ActivityPaneView } = await import('./panes')

function draw() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <ActivityPaneView onPane={() => undefined} userMenu={null} onAbout={() => undefined} />
    </QueryClientProvider>,
  )
}

/** What the newest request asked for, as parameters rather than as a string. */
const asked = () => new URL(sent.paths.at(-1) ?? '', 'http://x').searchParams

async function drawn() {
  draw()
  await vi.waitFor(() => {
    expect(sent.paths.length).toBeGreaterThan(0)
  })
}

/** Hours between now and the `since` the request carried. */
const reachBack = () =>
  (Date.now() - Date.parse(asked().get('since') ?? '')) / 3_600_000

/** A chip by the words on it, which is what `data-value` carries. */
async function pressChip(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(await screen.findByRole('button', { name: 'Filters' }))
  const chip = document.querySelector(`[role="dialog"] [data-value="${label}"]`)
  if (!chip) throw new Error(`no chip for ${label}`)
  await user.click(chip)
}

describe('the Activity pane asks the server', () => {
  beforeEach(() => {
    sent.paths.length = 0
  })

  it('opens on seven days, and asks for that many', async () => {
    await drawn()
    expect(reachBack()).toBeGreaterThan(24 * 7 - 1)
    expect(reachBack()).toBeLessThan(24 * 7 + 1)
  })

  it('asks for the range the reader chose, not merely a different one', async () => {
    const user = userEvent.setup()
    await drawn()

    await user.click(await screen.findByRole('button', { name: /7 days/ }))
    await user.click(await screen.findByRole('option', { name: '30 days' }))

    await vi.waitFor(() => {
      expect(reachBack()).toBeGreaterThan(24 * 30 - 1)
    })
    expect(reachBack()).toBeLessThan(24 * 30 + 1)
  })

  it('asks for the log a chip names', async () => {
    const user = userEvent.setup()
    await drawn()

    await pressChip(user, 'Sign-in')

    await vi.waitFor(() => {
      expect(asked().get('channel')).toBe('authentication')
    })
  })

  it('asks for the severity floor a chip names', async () => {
    const user = userEvent.setup()
    await drawn()

    await pressChip(user, 'Critical')

    // 5 is OCSF's Critical, which is what a floor means to the reader.
    await vi.waitFor(() => {
      expect(asked().get('minSeverity')).toBe('5')
    })
  })

  it('asks for the outcome a chip names', async () => {
    const user = userEvent.setup()
    await drawn()

    await pressChip(user, 'Failure')

    await vi.waitFor(() => {
      expect(asked().get('outcome')).toBe('failure')
    })
  })

  it('takes the page size from the reader rather than offering its own', async () => {
    await drawn()
    expect(asked().get('limit')).toBe('50')
  })
})
