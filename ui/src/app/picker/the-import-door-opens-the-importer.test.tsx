/**
 * **The import door lands on the section its tile names, and says so first.**
 *
 * The address rather than the call: a spy on `useNavigate` is green for a
 * container that builds the path and never pushes it, so this reads the
 * location a real router arrived at.
 *
 * What it does not reach is the tile, which `start-case-pane.test.tsx` holds
 * to its section's glyph. -> #298
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { DOOR_LABELS, ENTRY_SLUG } from '@/components/blocks/case-sections'
import { specsFixture } from '@/fixtures/specs'

const CASE_ID = 'c0ffee00-0000-4000-8000-000000000001'

vi.mock('@/api/library', () => ({
  useLibrary: () => ({ data: { entries: [] }, isPending: false, error: null }),
}))
vi.mock('@/api/specs', async () => ({
  ...(await vi.importActual<Record<string, unknown>>('@/api/specs')),
  useSpecs: () => ({ data: specsFixture, isPending: false, error: null }),
}))
vi.mock('@/api/useCreateCase', () => ({
  useCreateCase: () => ({ mutateAsync: () => Promise.resolve({ id: CASE_ID }) }),
}))

const { NewCaseContainer } = await import('./NewCaseContainer')

function Address() {
  return <span data-testid="address">{useLocation().pathname}</span>
}

function open(door: 'blank' | 'importer') {
  render(
    <MemoryRouter initialEntries={['/']}>
      <NewCaseContainer door={door} onClose={() => undefined} />
      <Routes>
        <Route path="*" element={<Address />} />
      </Routes>
    </MemoryRouter>,
  )
  return screen.getByRole('dialog')
}

/** The address the door leaves the analyst at, once the case exists. */
async function landing(door: 'blank' | 'importer'): Promise<string> {
  const user = userEvent.setup()
  open(door)
  await user.type(screen.getByRole('textbox', { name: /title/i }), 'A case')
  await user.click(screen.getByTestId('new-case-submit'))
  await waitFor(() => {
    expect(screen.getByTestId('address').textContent).not.toBe('/')
  })
  return screen.getByTestId('address').textContent
}

describe('the picker door that starts a case in the importer', () => {
  it('lands on the import section rather than the case entry', async () => {
    expect(await landing('importer')).toBe(`/cases/${CASE_ID}/import`)
  })

  it('lands the blank door on the case entry', async () => {
    expect(await landing('blank')).toBe(`/cases/${CASE_ID}/${ENTRY_SLUG}`)
  })

  it('names the import in the dialog it opens and on the button that runs it', () => {
    const dialog = open('importer')

    expect(dialog.getAttribute('aria-label')).toBe(DOOR_LABELS.import)
    expect(within(dialog).getByRole('heading', { name: DOOR_LABELS.import })).toBeTruthy()
    expect(within(dialog).getByTestId('new-case-submit').textContent).toMatch(/import/i)
  })

  /**
   * The claim above is met by a dialog that says `import` whatever opened it,
   * which is the blank door mislabelled rather than the import door labelled.
   */
  it('leaves the blank door saying nothing about an import', () => {
    const dialog = open('blank')

    expect(dialog.getAttribute('aria-label')).toBe('New case')
    expect(dialog.textContent).not.toMatch(/import/i)
  })
})
