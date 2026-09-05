import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

import { NotesScreen } from './notes'
import { isBlank, withoutBlank } from './notes-index'

/**
 * Writing a note, attacked at the one thing the screen is for: keeping what
 * was typed.
 */

/** The field the note is written in, by the label the served form gives it. */
function noteField(): HTMLElement {
  return screen.getByRole('textbox', { name: 'Note' })
}

/**
 * What the field is showing.
 */
function noteText(): string {
  return noteField().textContent
}

/** The two doors a note can leave by, spied on. */
function spyWrites() {
  return {
    create: vi.fn().mockResolvedValue(campaignCase.casenotes[0]),
    remove: vi.fn().mockResolvedValue(undefined),
  }
}

/** The openings the index is showing, top to bottom. */
function indexLines(): string[] {
  const index = screen.getByRole('navigation', { name: 'Case notes' })
  return within(index)
    .getAllByTestId('note-row')
    .map((row) => row.textContent)
}

describe('writing a note in the pane', () => {
  it('opens a field with the caret already in it, and no dialog', async () => {
    const user = userEvent.setup()
    render(<NotesScreen kase={campaignCase} specs={specsFixture} />)

    await user.click(screen.getByRole('button', { name: 'New note' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(noteField())
  })

  it('shows in the index what was typed into the field', async () => {
    const user = userEvent.setup()
    render(<NotesScreen kase={campaignCase} specs={specsFixture} />)
    const written = 'Reviewed the proxy logs for the staging window.'

    await user.click(screen.getByRole('button', { name: 'New note' }))
    await user.type(noteField(), written)

    // The index is the other surface: a field holding its own text proves
    // nothing about what the screen kept.
    expect(indexLines()[0]).toContain(written)
  })

  it('gives the text back when the note is closed and opened again', async () => {
    const user = userEvent.setup()
    render(<NotesScreen kase={campaignCase} specs={specsFixture} />)
    const written = 'svc-backup reached the backup share from a workstation.'

    await user.click(screen.getByRole('button', { name: 'New note' }))
    await user.type(noteField(), written)

    // Away, onto a note that already existed, and back.
    const rows = screen.getAllByTestId('note-row')
    const other = rows[1]
    expect(other).toBeDefined()
    if (other === undefined) return
    await user.click(other)
    expect(noteText()).not.toContain(written)

    await user.click(screen.getAllByTestId('note-row')[0]!)
    expect(noteText()).toContain(written)
  })

  it('edits a note that was already there, in the same field', async () => {
    const user = userEvent.setup()
    render(<NotesScreen kase={campaignCase} specs={specsFixture} />)
    const added = ' NTDS confirmed dumped.'

    const field = noteField()
    await user.click(field)
    await user.type(field, added)

    expect(noteText()).toContain(added)
    expect(indexLines()[0]).toContain('Human-operated ransomware')
  })

  it('keeps a note nobody signed out of the index rather than a blank row', async () => {
    const user = userEvent.setup()
    render(<NotesScreen kase={campaignCase} specs={specsFixture} />)
    const before = screen.getAllByTestId('note-row').length

    await user.click(screen.getByRole('button', { name: 'New note' }))
    expect(screen.getAllByTestId('note-row')).toHaveLength(before + 1)

    // Left without a word in it: the row goes rather than sitting in the
    // index with nothing to read.
    await user.click(screen.getAllByTestId('note-row')[1]!)
    expect(screen.getAllByTestId('note-row')).toHaveLength(before)
  })

  it('signs a new note with the analyst writing it, and asks nobody to type it', async () => {
    const user = userEvent.setup()
    render(<NotesScreen kase={campaignCase} specs={specsFixture} analyst="r.okonkwo" />)

    await user.click(screen.getByRole('button', { name: 'New note' }))
    await user.type(noteField(), 'Proxy logs pulled.')

    expect(indexLines()[0]).toContain('r.okonkwo')
    // Author is attribution, not a control: nothing on this screen takes one.
    expect(screen.queryByRole('textbox', { name: /author/i })).toBeNull()
    expect(screen.queryByRole('textbox', { name: /tag/i })).toBeNull()
  })
})

/**
 * **What leaves the screen, and what deliberately does not.**
 */
describe('what a note sends', () => {
  it('creates the row for a note that has only ever been on this screen', async () => {
    const user = userEvent.setup()
    const writes = spyWrites()
    const { create } = writes
    render(<NotesScreen kase={campaignCase} specs={specsFixture} writes={writes} />)

    await user.click(screen.getByRole('button', { name: 'New note' }))
    await user.type(noteField(), 'Proxy logs pulled for the staging window.')
    // Away from the note, which is what blurs the body.
    await user.click(screen.getAllByTestId('note-row')[1]!)

    expect(create).toHaveBeenCalledTimes(1)
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      note: expect.stringContaining('Proxy logs pulled'),
    })
  })

  it('sends nothing at all when a note the server holds is edited', async () => {
    const user = userEvent.setup()
    const writes = spyWrites()
    const { create } = writes
    render(<NotesScreen kase={campaignCase} specs={specsFixture} writes={writes} />)

    // The note the screen opens with is one the served case already carries.
    await user.type(noteField(), ' NTDS confirmed dumped.')
    await user.click(screen.getAllByTestId('note-row')[1]!)

    expect(create).not.toHaveBeenCalled()
  })

  it('discards a note nobody wrote in rather than creating an empty row', async () => {
    const user = userEvent.setup()
    const writes = spyWrites()
    const { create } = writes
    render(<NotesScreen kase={campaignCase} specs={specsFixture} writes={writes} />)

    await user.click(screen.getByRole('button', { name: 'New note' }))
    await user.click(screen.getAllByTestId('note-row')[1]!)

    expect(create).not.toHaveBeenCalled()
  })

  /**
   * **A note that was written in and then emptied is the case above's blind
   * spot.**
   */
  it('creates nothing when a new note is written in and then emptied', async () => {
    const user = userEvent.setup()
    const writes = spyWrites()
    const { create } = writes
    render(<NotesScreen kase={campaignCase} specs={specsFixture} writes={writes} />)

    await user.click(screen.getByRole('button', { name: 'New note' }))
    const field = noteField()
    await user.type(field, 'started writing')
    await user.clear(field)
    await user.click(screen.getAllByTestId('note-row')[1]!)

    expect(create).not.toHaveBeenCalled()
  })
})

/**
 * **Taking a note away.**
 */
describe('deleting a note', () => {
  /** The dialog the delete control raises. */
  async function confirmDelete() {
    const dialog = await screen.findByRole('alertdialog')
    await userEvent.click(within(dialog).getByRole('button', { name: /delete/i }))
  }

  it('asks before taking one away', async () => {
    const user = userEvent.setup()
    const writes = spyWrites()
    render(<NotesScreen kase={campaignCase} specs={specsFixture} writes={writes} />)

    await user.click(screen.getByTestId('delete-note'))

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()
    // Still there: raising the question must not be the answer.
    expect(writes.remove).not.toHaveBeenCalled()
  })

  it('sends the delete on the version the screen read', async () => {
    const user = userEvent.setup()
    const writes = spyWrites()
    render(<NotesScreen kase={campaignCase} specs={specsFixture} writes={writes} />)
    const open = campaignCase.casenotes[0]
    expect(open).toBeDefined()
    if (open === undefined) return

    await user.click(screen.getByTestId('delete-note'))
    await confirmDelete()

    // The version, not just the id: a note somebody else has written in has
    // moved, and the delete has to be refusable rather than taken.
    expect(writes.remove).toHaveBeenCalledWith(
      expect.objectContaining({ id: open.id, version: open.version }),
    )
  })

  it('takes the note out of the index and opens what is left', async () => {
    const user = userEvent.setup()
    const writes = spyWrites()
    render(<NotesScreen kase={campaignCase} specs={specsFixture} writes={writes} />)
    const before = screen.getAllByTestId('note-row').length

    await user.click(screen.getByTestId('delete-note'))
    await confirmDelete()

    expect(screen.getAllByTestId('note-row')).toHaveLength(before - 1)
    // A pane with nothing in it after a delete reads as the screen having
    // broken, so the next note takes the place of the one that went.
    expect(noteField()).toBeInTheDocument()
  })

  it('drops a note that was never created without asking the server', async () => {
    const user = userEvent.setup()
    const writes = spyWrites()
    render(<NotesScreen kase={campaignCase} specs={specsFixture} writes={writes} />)

    await user.click(screen.getByRole('button', { name: 'New note' }))
    await user.type(noteField(), 'not saved anywhere yet')
    await user.click(screen.getByTestId('delete-note'))
    await confirmDelete()

    expect(writes.remove).not.toHaveBeenCalled()
    expect(screen.queryByText(/not saved anywhere yet/)).not.toBeInTheDocument()
  })
})

describe('what counts as blank', () => {
  const note = campaignCase.casenotes[0]

  it('is whitespace, not just the empty string', () => {
    expect(note).toBeDefined()
    if (note === undefined) return
    expect(isBlank({ ...note, note: '   \n\t ' })).toBe(true)
    expect(isBlank({ ...note, note: '.' })).toBe(false)
  })

  it('drops only the named note, and only while it is blank', () => {
    expect(note).toBeDefined()
    if (note === undefined) return
    const blank = { ...note, id: 'draft', note: '' }
    expect(withoutBlank([note, blank], 'draft').map((one) => one.id)).toEqual([note.id])
    expect(withoutBlank([note, blank], note.id).map((one) => one.id)).toEqual([note.id, 'draft'])
    expect(withoutBlank([note, blank], undefined).map((one) => one.id)).toEqual([note.id, 'draft'])
  })
})
