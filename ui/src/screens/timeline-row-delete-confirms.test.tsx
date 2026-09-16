/**
 * **A timeline row's delete asks before it writes, from every door that offers
 * it.**
 *
 * The row's trash button went straight to the write: one press and the entry
 * was gone, with no dialog and no undo. Every other collection screen confirms
 * the same act, and so did this screen's own bulk bar -- the confirm existed
 * and only the bulk path reached it. -> #831
 *
 * **Both doors, because they are two controls over one call.** The toolbar's
 * button and the row menu's item both go through the screen's `act`, so a fix
 * applied at either control leaves the other writing on one press, and the
 * menu is the one nobody presses while testing.
 *
 * **Asserted on the write, not on the row.** A row that disappears is what the
 * defect did; what separates asking from not asking is whether anything left
 * the screen before the analyst said yes.
 *
 * **The confirmed write is asserted too.** A screen that refused to delete at
 * all would satisfy every assertion about writing nothing.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

import { TimelineScreen } from './timeline'
import type { TimelineWrites } from './timeline'

/** Any entry, so the spies resolve with the shape the screen expects back. */
function anEntry() {
  const found = campaignCase.timeline[0]
  if (!found) throw new Error('the campaign fixture holds no timeline entry')
  return found
}

/**
 * The first row the screen actually drew, and its delete control.
 *
 * **Read off the screen rather than the fixture.** The list is grouped into
 * runs and drawn newest-first, so the fixture's first entry is not reliably a
 * row with a toolbar of its own -- and a test naming it would be asserting
 * against the sort rather than against the delete.
 */
function firstDelete(): { button: HTMLElement; id: string } {
  const button = screen.getAllByRole('button', { name: /^Delete / })[0]
  if (!button) throw new Error('the screen drew no row with a delete')
  const described = (button.getAttribute('aria-label') ?? '').replace(/^Delete /, '')
  const entry = campaignCase.timeline.find((one) => one.description === described)
  if (!entry) throw new Error(`no fixture entry is described ${described}`)
  return { button, id: entry.id }
}

function spies(): TimelineWrites {
  return {
    save: vi.fn(() => Promise.resolve(anEntry())),
    patch: vi.fn(() => Promise.resolve([anEntry()])),
    remove: vi.fn(() => Promise.resolve()),
  } as unknown as TimelineWrites
}

async function drawn(writes: TimelineWrites) {
  render(<TimelineScreen kase={campaignCase} specs={specsFixture} writes={writes} />)
  await screen.findAllByRole('listitem')
}

/** The dialog the bulk bar has always opened, by the role it announces as. */
function confirmation(): HTMLElement | null {
  return screen.queryByRole('alertdialog')
}

describe('deleting one timeline entry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('asks before anything leaves the screen, from the row toolbar', async () => {
    const user = userEvent.setup()
    const writes = spies()
    await drawn(writes)

    await user.click(firstDelete().button)

    expect(writes.remove, 'the entry was deleted on one press').not.toHaveBeenCalled()
    expect(confirmation(), 'nothing was asked before the write').not.toBeNull()
  })

  it('writes once the analyst confirms, and only what was named', async () => {
    const user = userEvent.setup()
    const writes = spies()
    await drawn(writes)

    const row = firstDelete()
    await user.click(row.button)
    const dialog = confirmation()
    expect(dialog).not.toBeNull()
    await user.click(within(dialog!).getByRole('button', { name: /^delete/i }))

    expect(writes.remove).toHaveBeenCalledWith([row.id])
  })

  /**
   * The second door, and the one nobody presses while testing: the row menu
   * offers the same act through the same call, so a fix applied at the toolbar
   * alone leaves this one writing on a press.
   */
  it('asks before anything leaves the screen, from the row menu', async () => {
    const user = userEvent.setup()
    const writes = spies()
    await drawn(writes)

    const described = (firstDelete().button.getAttribute('aria-label') ?? '').replace(/^Delete /, '')
    await user.click(screen.getByRole('button', { name: `More for ${described}` }))
    await user.click(await screen.findByRole('menuitem', { name: /^delete$/i }))

    expect(writes.remove, 'the menu deleted the entry on one press').not.toHaveBeenCalled()
    expect(confirmation(), 'the menu asked nothing before the write').not.toBeNull()
  })

  it('writes nothing when the analyst backs out', async () => {
    const user = userEvent.setup()
    const writes = spies()
    await drawn(writes)

    await user.click(firstDelete().button)
    await user.click(within(confirmation()!).getByRole('button', { name: /cancel/i }))

    expect(writes.remove, 'a cancelled delete wrote anyway').not.toHaveBeenCalled()
  })
})
