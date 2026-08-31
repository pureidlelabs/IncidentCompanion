/**
 * The case's keyboard, and where a committed palette row lands.
 *
 * The attacks: a chord fired while typing into a note, a chord fired over an
 * open dialog, a row whose id names one section and whose address names
 * another, and a command with a row and no dispatch.
 *
 * jsdom lays nothing out, so nothing here asserts that the palette covers the
 * case -- only what is in the document and where a navigation went.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { campaignCase } from '@/fixtures/campaign'
import { COMMANDS } from '@/lib/shortcut-registry'

import { ChordLayerContainer } from './ChordLayerContainer'

const kase = vi.fn<() => { data: typeof campaignCase | undefined }>()

vi.mock('@/api/case', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useCase: () => kase(),
}))

/** Where the router stands, printed so an assertion can read it. */
function Address() {
  const { pathname } = useLocation()
  return <p>{`at ${pathname}`}</p>
}

function mount(initial = '/cases/abc/timeline') {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route
          path="/cases/:caseId/:section"
          element={
            <>
              <ChordLayerContainer />
              <Address />
              <textarea aria-label="A note" />
            </>
          }
        />
        <Route path="*" element={<Address />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  kase.mockReturnValue({ data: campaignCase })
})

describe('the chord layer', () => {
  it('opens the palette on its chord and shuts it on Escape', async () => {
    const analyst = userEvent.setup()
    mount()
    expect(screen.queryByRole('dialog')).toBeNull()
    await analyst.keyboard('{Control>}k{/Control}')
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    await analyst.keyboard('{Escape}')
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
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
    mount()
    await analyst.click(screen.getByLabelText('A note'))
    await analyst.keyboard('{Control>}k{/Control}')
    await analyst.keyboard('?')
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

  it('sends the search chord to the section that answers it', async () => {
    const analyst = userEvent.setup()
    mount()
    await analyst.keyboard('/')
    expect(await screen.findByText('at /cases/abc/search')).toBeInTheDocument()
  })

  it('opens a section chosen in the palette, and shuts the palette', async () => {
    const analyst = userEvent.setup()
    mount()
    await analyst.keyboard('{Control>}k{/Control}')
    const box = await screen.findByRole('searchbox')
    await analyst.type(box, 'evidence')
    // The section row and the case's own Evidence rows both match the word,
    // which is the palette working: the exact name is the section's.
    await analyst.click(await screen.findByRole('option', { name: 'Evidence' }))
    expect(await screen.findByText('at /cases/abc/evidence')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })

  /**
   * A label reaching an address. Case notes are grouped under `Case notes` and
   * live at `notes`; an id built from the label navigates to
   * `/cases/abc/Case notes`, which renders as a refusal rather than a failure.
   */
  it('opens the section a case row lives in, by its slug', async () => {
    const analyst = userEvent.setup()
    const note = campaignCase.casenotes[0]
    expect(note, 'the fixture owes a case note for this attack').toBeDefined()
    mount()
    await analyst.keyboard('{Control>}k{/Control}')
    const box = await screen.findByRole('searchbox')
    await analyst.type(box, note?.note.split(/\s+/)[0] ?? '')
    const row = await screen.findByRole('option', { name: new RegExp(/Case notes/) })
    await analyst.click(row)
    expect(await screen.findByText('at /cases/abc/notes')).toBeInTheDocument()
  })

  /**
   * Every command the palette draws does something visible. One that
   * dispatches to nothing shuts the dialog and leaves the analyst where they
   * were, which reads as a swallowed press; a count of rows cannot see it.
   *
   * The two openers answer with a dialog rather than a navigation.
   */
  it.each(COMMANDS.filter((one) => one.parked !== true).map((one) => [one.id, one.title]))(
    'gets somewhere on %s',
    async (id, title) => {
      const analyst = userEvent.setup()
      // **From the overview, not the timeline.** Two of these commands go to
      // the timeline, and a test standing there already cannot tell arriving
      // from never having left.
      const view = mount('/cases/abc/overview')
      await analyst.keyboard('{Control>}k{/Control}')
      // A row's accessible name carries its key caps after the title, so an
      // exact match finds only the one command with no chord.
      const row = await screen.findByRole('option', {
        name: (accessible: string) => accessible.startsWith(title),
      })
      await analyst.click(row)
      if (id === 'palette' || id === 'shortcuts') {
        expect(await screen.findByRole('dialog')).toBeInTheDocument()
      } else {
        await waitFor(() => {
          expect(screen.queryByText('at /cases/abc/overview')).toBeNull()
        })
      }
      view.unmount()
    },
  )
})
