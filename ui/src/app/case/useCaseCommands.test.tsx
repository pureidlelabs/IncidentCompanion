/**
 * Every command the omnibox draws does something visible.
 *
 * **The attack is a command that dispatches to nothing.** It leaves the analyst
 * where they were, which reads as a swallowed press, and a count of rows in the
 * list cannot see it. So the table below is the registry itself: adding a
 * command without giving it a destination fails here rather than in use.
 *
 * A committed row is also read for its own id -- `command:`, `section:` or
 * `row:` -- and a row naming one section while addressing another is the
 * second attack.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { COMMANDS } from '@/lib/shortcut-registry'

import { useCaseCommands } from './useCaseCommands'

const HOME = '/cases/abc/overview'

/** Where the router stands, and a button per thing under test. */
function Probe({
  onFocusSearch,
  onShortcuts,
  run: which,
  commit: row,
}: {
  onFocusSearch: () => void
  onShortcuts: () => void
  run?: string
  commit?: string
}) {
  const { pathname, search, hash } = useLocation()
  const { run, commit } = useCaseCommands({ caseId: 'abc', onFocusSearch, onShortcuts })
  return (
    <>
      <p>{`at ${pathname}${search}${hash}`}</p>
      {which !== undefined && (
        <button
          type="button"
          onClick={() => {
            run(which)
          }}
        >
          go
        </button>
      )}
      {row !== undefined && (
        <button
          type="button"
          onClick={() => {
            commit(row)
          }}
        >
          go
        </button>
      )}
    </>
  )
}

function mount(props: { run?: string; commit?: string }) {
  const onFocusSearch = vi.fn()
  const onShortcuts = vi.fn()
  const view = render(
    <MemoryRouter initialEntries={[HOME]}>
      <Routes>
        <Route
          path="*"
          element={<Probe onFocusSearch={onFocusSearch} onShortcuts={onShortcuts} {...props} />}
        />
      </Routes>
    </MemoryRouter>,
  )
  return { view, onFocusSearch, onShortcuts }
}

describe('what a command does', () => {
  it.each(COMMANDS.filter((one) => one.parked !== true).map((one) => [one.id]))(
    'gets somewhere on %s',
    async (id) => {
      const analyst = userEvent.setup()
      // **From the overview.** Two of these go to the timeline, and a test
      // standing there already cannot tell arriving from never having left.
      const { onFocusSearch, onShortcuts } = mount({ run: id })
      await analyst.click(screen.getByRole('button', { name: 'go' }))

      if (id === 'palette' || id === 'search') {
        await waitFor(() => {
          expect(onFocusSearch).toHaveBeenCalled()
        })
        return
      }
      if (id === 'shortcuts') {
        expect(onShortcuts).toHaveBeenCalled()
        return
      }
      await waitFor(() => {
        expect(screen.queryByText(`at ${HOME}`)).toBeNull()
      })
    },
  )

  /**
   * A command whose control is on another screen carries itself there, or the
   * jump is all that happens -- which is what the dispatcher did before, and
   * what "it just goes to the page" was.
   */
  it.each(COMMANDS.filter((one) => one.section !== undefined).map((one) => [one.id, one.section]))(
    'sends %s to %s carrying itself',
    async (id, slug) => {
      const analyst = userEvent.setup()
      mount({ run: id })
      await analyst.click(screen.getByRole('button', { name: 'go' }))
      expect(await screen.findByText(`at /cases/abc/${String(slug)}?do=${id}`)).toBeInTheDocument()
    },
  )
})

describe('what a committed row does', () => {
  /**
   * A label reaching an address. Case notes are grouped under `Case notes` and
   * live at `notes`; an id built from the label would navigate to
   * `/cases/abc/Case notes`, which renders as a refusal rather than a failure.
   */
  it.each([
    ['section:evidence', '/cases/abc/evidence'],
    ['row:notes:some-id', '/cases/abc/notes'],
    ['section:entities#assets', '/cases/abc/entities#assets'],
  ])('lands %s at %s', async (rowId, where) => {
    const analyst = userEvent.setup()
    mount({ commit: rowId })
    await analyst.click(screen.getByRole('button', { name: 'go' }))
    expect(await screen.findByText(`at ${where}`)).toBeInTheDocument()
  })

  /** A row with no id after its kind is a row the list should never have drawn. */
  it('does nothing for a kind with nothing after it', async () => {
    const analyst = userEvent.setup()
    mount({ commit: 'section' })
    await analyst.click(screen.getByRole('button', { name: 'go' }))
    expect(screen.getByText(`at ${HOME}`)).toBeInTheDocument()
  })
})
