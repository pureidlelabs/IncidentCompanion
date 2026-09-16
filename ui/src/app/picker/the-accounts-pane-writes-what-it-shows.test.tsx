/**
 * Disabling an account on the Accounts pane reaches the server.
 *
 * The row menu offered Enable and Disable and both called a handler that
 * updated React state, so the row moved to `disabled`, nothing was written, the
 * analyst went on signing in, and a refresh put the row back. A control that
 * reports a change it did not make is worse than one that is missing: an
 * administrator cutting somebody off believes they have. -> #794
 *
 * **Asserted on the request, not on the row.** The row moving is exactly what
 * the defect did; what separates a write from a repaint is whether anything
 * left the browser.
 *
 * **What this does not cover:** what the server does with the write, which is
 * `server/test/analyst-privilege.test.ts` and the accounts controller's own
 * cases; and the other row actions, which have no control to press yet.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const sent = vi.hoisted(() => ({
  reads: [] as string[],
  writes: [] as { path: string; body: unknown }[],
}))

vi.mock('@/api/client', () => ({
  ApiError: class extends Error {
    status = 0
    body: unknown = null
  },
  request: (path: string, init?: { method?: string; body?: unknown }) => {
    if (init?.method === 'POST') {
      sent.writes.push({ path, body: init.body })
      return Promise.resolve({ ok: true, messages: [['Done.', 'positive']] })
    }
    sent.reads.push(path)
    return Promise.resolve({
      accounts: [
        {
          username: 'nina@example.test',
          displayName: 'Nina',
          role: 'analyst',
          state: 'active',
          tone: 'positive',
          disabled: false,
        },
      ],
      roles: ['analyst', 'admin'],
      defaultRole: 'analyst',
    })
  },
}))

const { AccountsPaneView } = await import('./panes')

function draw() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <AccountsPaneView onPane={() => undefined} userMenu={null} onAbout={() => undefined} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  sent.reads.length = 0
  sent.writes.length = 0
})

describe('the Accounts pane', () => {
  it('sends a write when an administrator disables an account', async () => {
    draw()
    await vi.waitFor(() => {
      expect(screen.getByText('nina@example.test')).toBeInTheDocument()
    })

    await userEvent.click(screen.getByRole('button', { name: /more for Nina/i }))
    await userEvent.click(await screen.findByRole('menuitem', { name: /disable/i }))

    await vi.waitFor(() => {
      expect(
        sent.writes.map((one) => one.path),
        'the row changed on screen and nothing was written',
      ).toEqual(['/accounts/nina%40example.test/disable'])
    })
  })

  /**
   * *An administrator MUST be able to end a session* -- and the route has
   * existed with nothing to press it. Asserted on the request for the reason
   * above: a control that ends no session looks the same from the row.
   */
  it('sends a write when an administrator ends an account\'s sessions', async () => {
    draw()
    await vi.waitFor(() => {
      expect(screen.getByText('nina@example.test')).toBeInTheDocument()
    })

    await userEvent.click(screen.getByRole('button', { name: /more for Nina/i }))
    await userEvent.click(await screen.findByRole('menuitem', { name: /end sessions/i }))

    await vi.waitFor(() => {
      expect(sent.writes.map((one) => one.path)).toEqual([
        '/accounts/nina%40example.test/sessions/end',
      ])
    })
  })

  /**
   * **A role is the reach an account has**, so changing one is the write an
   * administrator makes least often and can least afford to have silently not
   * happen. One item per role the server named, this row's own excepted.
   */
  it('sends a write when an administrator changes a role', async () => {
    draw()
    await vi.waitFor(() => {
      expect(screen.getByText('nina@example.test')).toBeInTheDocument()
    })

    await userEvent.click(screen.getByRole('button', { name: /more for Nina/i }))
    await userEvent.click(await screen.findByRole('menuitem', { name: /make admin/i }))

    await vi.waitFor(() => {
      expect(sent.writes).toEqual([
        { path: '/accounts/nina%40example.test/role', body: { role: 'admin' } },
      ])
    })
  })

  /**
   * *An administrator MUST be able to end every session at once.*
   *
   * **Confirmed before it runs**, because it signs the administrator out with
   * everybody else -- a control whose cost lands on the person pressing it owes
   * them the sentence first.
   */
  it('asks before ending every session, and writes only once confirmed', async () => {
    draw()
    await vi.waitFor(() => {
      expect(screen.getByText('nina@example.test')).toBeInTheDocument()
    })

    await userEvent.click(screen.getByRole('button', { name: /end every session/i }))
    expect(sent.writes, 'the sweep ran before anybody confirmed it').toEqual([])

    await userEvent.click(
      await screen.findByRole('button', { name: /^end every session$/i, hidden: false }),
    )

    await vi.waitFor(() => {
      expect(sent.writes.map((one) => one.path)).toEqual(['/accounts/sessions/end'])
    })
  })
})
