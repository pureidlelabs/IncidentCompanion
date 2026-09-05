/**
 * The case's keyboard: what a chord reaches, and what it must not.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { ChordLayerContainer } from './ChordLayerContainer'

/** Where the router stands, printed so an assertion can read it. */
function Address() {
  const { pathname } = useLocation()
  return <p>{`at ${pathname}`}</p>
}

function mount(onSearch = vi.fn(), initial = '/cases/abc/timeline') {
  const view = render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route
          path="/cases/:caseId/:section"
          element={
            <>
              <ChordLayerContainer onSearch={onSearch} />
              <Address />
              <textarea aria-label="A note" />
            </>
          }
        />
        <Route path="*" element={<Address />} />
      </Routes>
    </MemoryRouter>,
  )
  return { view, onSearch }
}

describe('the chord layer', () => {
  /**
   * **Both chords land in the omnibox, and there is no dialog to find.**
   */
  it.each([
    ['the palette chord', '{Control>}k{/Control}'],
    ['the search chord', '/'],
  ])('sends %s to the omnibox', async (_name, chord) => {
    const analyst = userEvent.setup()
    const { onSearch } = mount()
    await analyst.keyboard(chord)
    await waitFor(() => {
      expect(onSearch).toHaveBeenCalled()
    })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens the cheat sheet on its own chord', async () => {
    const analyst = userEvent.setup()
    mount()
    await analyst.keyboard('?')
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Keyboard shortcuts')).toBeInTheDocument()
  })

  /**
   * The suppression that makes `n` typeable. Without it the layer is actively
   * harmful rather than merely absent: a note cannot be written.
   */
  it('leaves the keyboard to a control that types', async () => {
    const analyst = userEvent.setup()
    const { onSearch } = mount()
    await analyst.click(screen.getByLabelText('A note'))
    await analyst.keyboard('{Control>}k{/Control}')
    await analyst.keyboard('?')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(onSearch).not.toHaveBeenCalled()
  })

  /**
   * Shift+Q from inside a half-filled dialog would leave the case. The
   * dialog's own presence is the whole test, so nothing has to enrol.
   */
  it('leaves the keyboard to an open dialog', async () => {
    const analyst = userEvent.setup()
    mount()
    await analyst.keyboard('?')
    await screen.findByRole('dialog')
    await analyst.keyboard('{Shift>}Q{/Shift}')
    expect(screen.getByText('at /cases/abc/timeline')).toBeInTheDocument()
  })

  it('leaves the case on its chord, and goes to the picker', async () => {
    const analyst = userEvent.setup()
    mount()
    await analyst.keyboard('{Shift>}Q{/Shift}')
    expect(await screen.findByText('at /cases')).toBeInTheDocument()
  })
})
