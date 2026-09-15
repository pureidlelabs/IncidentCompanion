/**
 * The controls on the Activity pane reach the request.
 *
 * The pane used to call the reader with two literals and hand fifty rows of
 * one day to a block that filtered them itself, so choosing 30 days or
 * Critical narrowed a page rather than the table. The assertion that matters
 * is what the query string carries. -> #663
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

/** The newest request, which is the one a press produced. */
const asked = () => sent.paths.at(-1) ?? ''

describe('the Activity pane asks the server', () => {
  beforeEach(() => {
    sent.paths.length = 0
  })

  it('carries the range it was opened on', async () => {
    draw()
    await vi.waitFor(() => {
      expect(sent.paths.length).toBeGreaterThan(0)
    })
    // Seven days, which is the range the pane opens on rather than the day the
    // block used to be handed.
    expect(asked()).toMatch(/since=/)
  })

  it('carries a range the reader chose', async () => {
    const user = userEvent.setup()
    draw()
    await vi.waitFor(() => {
      expect(sent.paths.length).toBeGreaterThan(0)
    })
    const before = asked()

    await user.click(await screen.findByRole('button', { name: /7 days/ }))
    await user.click(await screen.findByRole('option', { name: '30 days' }))

    await vi.waitFor(() => {
      expect(asked(), 'the range never reached the request').not.toBe(before)
    })
  })

  it('does not ask for a page size the block used to offer', async () => {
    draw()
    await vi.waitFor(() => {
      expect(sent.paths.length).toBeGreaterThan(0)
    })
    // The reader's own page size is the only one now; the block's four went
    // with the filtering.
    expect(asked()).toContain('limit=50')
  })
})
