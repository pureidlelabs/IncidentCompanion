/**
 * The case's keyboard: what a chord reaches, and what it must not.
 *
 * The attacks: a chord fired while typing into a note, a chord fired over an
 * open dialog, and a chord whose command has no opener here.
 *
 * **Where a command *goes* is `useCaseCommands.test.tsx`.** This layer only
 * decides whether a keypress becomes a command at all; one file asserting both
 * cannot fail in a way that says which half broke.
 *
 * jsdom lays nothing out, so nothing here asserts that anything covers the
 * case -- only what is in the document and where a navigation went.
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
  const onPress = vi.fn()
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
              <button type="button" aria-label="Add entry" onClick={onPress} />
              <a href="/cases" aria-label="Back">
                Back
              </a>
              <div role="tab" tabIndex={0} aria-label="Timeline tab" />
              <input type="checkbox" aria-label="Only mine" />
              <div role="menu">
                <div role="menuitem" tabIndex={0} aria-label="Export" />
              </div>
            </>
          }
        />
        <Route path="*" element={<Address />} />
      </Routes>
    </MemoryRouter>,
  )
  return { view, onSearch, onPress }
}

describe('the chord layer', () => {
  /**
   * **Both chords land in the omnibox, and there is no dialog to find.** A
   * case asserting only "no dialog" passes with the chord doing nothing at
   * all, so the reached-for handler is what is asserted.
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

  /** The state an analyst is in most of the time, argued in `chords.test.ts`. */
  it.each([
    ['a button', 'Add entry'],
    ['a link', 'Back'],
    ['a tab', 'Timeline tab'],
    ['a checkbox', 'Only mine'],
  ])('fires a chord with the focus on %s', async (_name, label) => {
    const analyst = userEvent.setup()
    mount()
    screen.getByLabelText(label).focus()
    await analyst.keyboard('?')
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  /**
   * **A typeahead miss is silent.** A collection stops the keypress it uses,
   * and lets the one that matches nothing through untouched -- so a chord
   * fires on the letter the analyst meant for the list.
   */
  it('leaves the keyboard to an open menu whose typeahead misses', async () => {
    const analyst = userEvent.setup()
    const { onSearch } = mount()
    screen.getByLabelText('Export').focus()
    await analyst.keyboard('n')
    await analyst.keyboard('?')
    await analyst.keyboard('/')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(onSearch).not.toHaveBeenCalled()
  })

  /**
   * A button's own keys stay its own. `chords.test.ts` holds the registry to
   * claiming none of them; this is the other half, that the layer lets the
   * press through.
   */
  it('leaves Enter and Space to a focused button', async () => {
    const analyst = userEvent.setup()
    const { onPress } = mount()
    screen.getByLabelText('Add entry').focus()
    await analyst.keyboard('{Enter}')
    await analyst.keyboard(' ')
    expect(onPress).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('dialog')).toBeNull()
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
