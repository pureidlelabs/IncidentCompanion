import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

import { NotesScreen } from './notes'
import { isBlank, withoutBlank } from './notes-index'

/**
 * Writing a note, attacked at the one thing the screen is for: keeping what
 * was typed.
 *
 * The failure this is written against is not a control that refuses to render
 * - it is prose that reaches the screen, looks written, and is gone by the
 * time the analyst comes back to it. So every assertion here reads the text
 * back out of a *different* surface than the one it was typed into: the index
 * row while typing, and the field again after the note has been closed and
 * reopened.
 */

/** The field the note is written in, by the label the served form gives it. */
function noteField(): HTMLElement {
  return screen.getByRole('textbox', { name: 'Note' })
}

/**
 * What the field is showing.
 *
 * **`textContent`, not `value`.** The body is a prose editor over a
 * contenteditable rather than a textarea, so `toHaveValue` reads `undefined`
 * off it and passes or fails for the wrong reason.
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
 *
 * A note the server holds is a Yjs document: every keystroke is applied to it
 * and persisted from there, and the server re-derives `casenotes.note` on the
 * same write. A screen that also PATCHed the row would be a second writer
 * racing the record - last-writer-wins over a CRDT, which is the arrangement
 * the CRDT exists to replace. The failure is silent, so it is asserted on the
 * door rather than on the text.
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

  /**
   * **The window between the first keystroke and looking away.**
   *
   * The screen has no save control, on the stated grounds that a note "is
   * never in an unsaved state". That is true of a note with a row -- its body
   * is the document and every keystroke is persisted from there -- and it was
   * false of one without: the row was created on blur, so a note typed and
   * then left by closing the tab, or by following a link, was never sent and
   * went with the page. Measured in a browser: rows 2 -> 2 and nothing on
   * screen afterwards. -> #388
   *
   * **Not on every keystroke**, which would create a row holding one letter
   * and would break the rule two cases below: a note written in and then
   * emptied is discarded.
   */
  it('sends a note that was never blurred when the screen goes', async () => {
    const user = userEvent.setup()
    const writes = spyWrites()
    const { create } = writes
    const view = render(
      <NotesScreen kase={campaignCase} specs={specsFixture} writes={writes} />,
    )

    await user.click(screen.getByRole('button', { name: 'New note' }))
    await user.type(noteField(), 'Proxy logs pulled for the staging window.')
    expect(create, 'nothing is sent while the analyst is still in the note').not.toHaveBeenCalled()

    // Following a link out of the case: the screen goes, the note has no row.
    view.unmount()

    expect(create, 'the note went with the page').toHaveBeenCalledTimes(1)
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      note: expect.stringContaining('Proxy logs pulled'),
    })
  })

  /**
   * **Blurred and then left is one row, not two.**
   *
   * Both doors now send: the blur that always did, and the leaving added
   * beside it. Nothing on the served case says the row exists until the write
   * comes back, so `casenotes` cannot be the guard for the second door -- that
   * is what the `sent` ref is for. Measured before this case existed: removing
   * the ref kept all eighteen green, so nothing held it.
   */
  it('sends one row when the analyst blurs and then leaves', async () => {
    const user = userEvent.setup()
    const writes = spyWrites()
    const { create } = writes
    const view = render(
      <NotesScreen kase={campaignCase} specs={specsFixture} writes={writes} />,
    )

    await user.click(screen.getByRole('button', { name: 'New note' }))
    await user.type(noteField(), 'Beaconing to a newly registered domain.')
    /**
     * **Blurred without opening another note**, which is the only path where
     * both doors name the *same* note: clicking a different row moves what is
     * picked, so the leaving below would commit that one instead and the
     * served case would turn it away.
     */
    fireEvent.blur(noteField())
    expect(create, 'the blur did not send it').toHaveBeenCalledTimes(1)

    // And then the screen goes, which is the second door onto the same note.
    view.unmount()

    expect(create, 'leaving sent the note a second time').toHaveBeenCalledTimes(1)
  })

  /**
   * **A refused write leaves the note sendable.**
   *
   * The once-only guard records the id before the write is attempted, so
   * without taking it back on a refusal it records *tried* rather than
   * *stored*: the note stays on screen -- this screen has no unsaved state to
   * show -- and every later blur, and the leaving below, return at the guard.
   * A refusal an analyst could have retried becomes the silent loss the whole
   * screen exists to prevent, which `main` did not have.
   */
  it('sends the note again after a write is refused', async () => {
    const user = userEvent.setup()
    const writes = spyWrites()
    const { create } = writes
    create.mockRejectedValueOnce(new Error('the server refused it'))
    render(<NotesScreen kase={campaignCase} specs={specsFixture} writes={writes} />)

    await user.click(screen.getByRole('button', { name: 'New note' }))
    await user.type(noteField(), 'Lateral movement to the finance share.')
    fireEvent.blur(noteField())
    expect(create, 'the first attempt never went').toHaveBeenCalledTimes(1)

    // The analyst adds a sentence and looks away again.
    await user.click(noteField())
    await user.type(noteField(), ' Confirmed on the DC.')
    fireEvent.blur(noteField())

    expect(create, 'the refusal made the note unsendable').toHaveBeenCalledTimes(2)
  })

  /**
   * **The closing page is the only door that asks for the outliving write.**
   *
   * That flag is what makes the container skip the mutation and issue the POST
   * itself with `keepalive` -- and without asserting it, an implementation
   * that never does either passes every case here while losing the note in a
   * browser.
   */
  it('asks for a write that outlives the page only when the page is going', async () => {
    const user = userEvent.setup()
    const writes = spyWrites()
    const { create } = writes
    render(<NotesScreen kase={campaignCase} specs={specsFixture} writes={writes} />)

    await user.click(screen.getByRole('button', { name: 'New note' }))
    await user.type(noteField(), 'svc-backup reached the share.')
    window.dispatchEvent(new Event('pagehide'))

    expect(create.mock.calls[0]?.[1], 'the tab closing took the ordinary write').toBe(true)
  })

  /** And a link followed inside the app takes the ordinary one, which reports. */
  it('takes the ordinary write when only the screen goes', async () => {
    const user = userEvent.setup()
    const writes = spyWrites()
    const { create } = writes
    const view = render(
      <NotesScreen kase={campaignCase} specs={specsFixture} writes={writes} />,
    )

    await user.click(screen.getByRole('button', { name: 'New note' }))
    await user.type(noteField(), 'Proxy logs pulled for the staging window.')
    view.unmount()

    expect(create.mock.calls[0]?.[1], 'an in-app navigation skipped the reporting write').toBe(
      false,
    )
  })

  /** The other way out: the tab is closed rather than navigated. */
  it('sends a note that was never blurred when the tab is closed', async () => {
    const user = userEvent.setup()
    const writes = spyWrites()
    const { create } = writes
    render(<NotesScreen kase={campaignCase} specs={specsFixture} writes={writes} />)

    await user.click(screen.getByRole('button', { name: 'New note' }))
    await user.type(noteField(), 'svc-backup reached the share.')
    window.dispatchEvent(new Event('pagehide'))

    expect(create, 'the note went with the tab').toHaveBeenCalledTimes(1)
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
   * spot.** An untouched body never commits at all, so the emptiness check is
   * unreachable through it -- deleting that check leaves every other case in
   * this file green. This is the path that reaches it: the door refuses an
   * empty `note` (`min(1)`), so without the check the analyst is shown a
   * failed write for deciding not to write anything.
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
 *
 * A note is the one thing on this screen with no other way out: there is no
 * bulk table behind it and no dialog it was created in. The two failures worth
 * asserting are a delete that never reaches the server - the row comes back on
 * the next read, which reads as the app refusing to forget something - and one
 * that goes without being asked, since the words are the whole of the record
 * and nothing restores them.
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

  /**
   * **A note only this screen has never reaches the server.** It has no row,
   * so a delete naming its id is a 404 - which the analyst reads as their note
   * refusing to go.
   */
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
