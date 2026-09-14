/**
 * **The controls on the languages pane reach the install.**
 *
 * The pane's own cases drive it with `vi.fn()` doors, which says the pane asks
 * rather than that anything answers. Deleting the whole `onRemove`/`onUpload` block
 * from `LanguagesPaneView` left the entire client suite green, so the half the
 * issue was about was the half nothing executed. -> #664
 *
 * **Asserted on the request.** What a write does is the server's; what this
 * owes is that the press turns into the call the route takes, with the value
 * the row carries.
 *
 * **What this does not cover:** what the server stores, and the confirmation
 * the pane draws before a removal, which is the pane's own case.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type * as ApiClient from '@/api/client'
import type * as ApiSession from '@/api/useSession'

/** Every request the pane made, in order. */
const sent = vi.hoisted(() => ({ calls: [] as { path: string; method: string; body: unknown }[] }))

vi.mock('@/api/client', async () => {
  const real = await vi.importActual<typeof ApiClient>('@/api/client')
  return {
    ...real,
    request: (path: string, init?: { method?: string; body?: unknown }) => {
      sent.calls.push({ path, method: init?.method ?? 'GET', body: init?.body })
      if (path.startsWith('/report/languages') && (init?.method ?? 'GET') === 'GET') {
        return Promise.resolve({
          languages: [
            { code: 'nl', label: 'Nederlands', coverage: 1, builtin: false },
            { code: 'en', label: 'English', coverage: 1, builtin: true },
          ],
          keyCount: 139,
        })
      }
      return Promise.resolve({ removed: 'nl' })
    },
  }
})
vi.mock('@/api/useSession', async () => {
  const real = await vi.importActual<typeof ApiSession>('@/api/useSession')
  return { ...real, useAnalyst: () => 'r.okonkwo' }
})

const { LanguagesPaneView } = await import('./panes')

const draw = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <LanguagesPaneView onPane={() => undefined} userMenu={null} onAbout={() => undefined} />
      </MemoryRouter>
    </QueryClientProvider>,
  )

/** Requests that changed something, which is what a door is for. */
const writes = () => sent.calls.filter((one) => one.method !== 'GET')

beforeEach(() => {
  sent.calls.length = 0
})

describe('the languages pane, wired to the install', () => {
  it('asks the route to remove the pack the row names', async () => {
    draw()

    await userEvent.click(await screen.findByRole('button', { name: 'More for Nederlands' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: /remove/i }))
    await userEvent.click(await screen.findByRole('button', { name: /^delete$/i }))

    await waitFor(() => {
      expect(
        writes(),
        'the press reached no route, so the pack is still on the install and comes back on ' +
          'the next fetch',
      ).toHaveLength(1)
    })
    expect(writes()[0]?.method).toBe('DELETE')
    expect(writes()[0]?.path).toContain('/report/languages/nl')
  })

  it('says how many strings a complete pack carries, as the install answered', async () => {
    draw()

    expect(await screen.findByText(/139 strings/)).toBeDefined()
  })

  /**
   * **The upload half had no executed coverage anywhere.** Nothing in the tree
   * fired a change on the input, so the door could have been wired to nothing.
   */
  it('puts a pack the analyst chose at the route that takes one', async () => {
    const { container } = draw()
    await screen.findByText(/139 strings/)

    const pack = { code: 'de', label: 'Deutsch', strings: { 'heading.evidence': 'Beweise' } }
    const file = new File([JSON.stringify(pack)], 'de.json', { type: 'application/json' })
    const input = container.querySelector('input[type="file"]')
    expect(input, 'the pane drew no file input to choose with').not.toBeNull()

    await userEvent.upload(input as HTMLInputElement, file)

    await waitFor(() => {
      expect(writes()).toHaveLength(1)
    })
    expect(writes()[0]?.method).toBe('PUT')
    expect(writes()[0]?.body).toEqual(pack)
  })

  /**
   * **A file that is not a pack never reaches the route.** What the analyst is
   * told about it is `packFromFile`'s, and is asserted there.
   */
  it('refuses a file that is not a pack without asking the install', async () => {
    const { container } = draw()
    await screen.findByText(/139 strings/)

    const file = new File(['not json at all'], 'notes.txt', { type: 'application/json' })
    await userEvent.upload(container.querySelector('input[type="file"]')!, file)

    // **Asserted on the silence, not on the card.** The toast region is
    // mounted by the app rather than by this pane, so what is observable here
    // is that the route was never asked; `api/languages.ts` holds the words.
    await waitFor(() => {
      expect(sent.calls.length).toBeGreaterThan(0)
    })
    expect(
      writes(),
      'a file that is not a pack was sent anyway, and comes back as a 422 about a body',
    ).toEqual([])
  })
})
