import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { PROSE_KEYS, keyLabel } from './prose-keys'
import { ProseShortcuts } from './prose-shortcuts'

/**
 * The cheat sheet, whose only job is to be complete and to be dismissible.
 *
 * **Written from the two ways a rewrite of it fails silently.** A dialog
 * driven by the wrong open prop renders nothing while every other assertion
 * about its contents passes vacuously; and a sheet that lists most of the
 * table is indistinguishable from a correct one to anyone who has not counted.
 */
describe('the shortcuts sheet', () => {
  it('draws nothing while it is closed', () => {
    render(<ProseShortcuts open={false} onOpenChange={vi.fn()} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('draws the sheet while it is open', () => {
    render(<ProseShortcuts open onOpenChange={vi.fn()} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  /**
   * **Every key, not a sample.** The sheet exists because a binding that works
   * and is listed nowhere is indistinguishable from one that does not exist,
   * so a sheet missing one row is the exact defect it was built against.
   */
  it('lists every key in the table the bindings come from', () => {
    render(<ProseShortcuts open onOpenChange={vi.fn()} />)
    const sheet = screen.getByRole('dialog')

    const missing = PROSE_KEYS.filter(
      (key) => !sheet.textContent.includes(key.label),
    ).map((key) => key.label)

    expect(missing, 'a binding the editor answers and the sheet does not list').toEqual([])
  })

  it('shows the platform glyph beside each label, not the `Mod` spelling', () => {
    render(<ProseShortcuts open onOpenChange={vi.fn()} />)
    const text = screen.getByRole('dialog').textContent

    expect(text).not.toContain('Mod-')
    for (const key of PROSE_KEYS) expect(text).toContain(keyLabel(key.keys))
  })

  /**
   * Escape is the only way out that costs nothing to reach, and it is the one
   * a hand-rolled overlay loses. `onOpenChange(false)` is what the caller
   * turns back into `open`.
   */
  it('reports the dismissal rather than closing itself', async () => {
    const onOpenChange = vi.fn<(open: boolean) => void>()
    render(<ProseShortcuts open onOpenChange={onOpenChange} />)

    await userEvent.keyboard('{Escape}')

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})

/**
 * The scroller lives on the list, not on the frame.
 *
 * jsdom lays nothing out, so this is a claim about what the sheet *asks for*
 * rather than what it gets - that it is honoured is `visual-check`'s to see.
 * It is here because the class was lost once already: without it the list ran
 * 400px past the card and painted over the page behind it.
 */
describe('the list carries its own scroll', () => {
  it('keeps the columns scrollable inside the frame', () => {
    render(<ProseShortcuts open onOpenChange={vi.fn()} />)
    const columns = screen.getByRole('dialog').querySelector('[data-slot="prose-shortcuts-list"]')

    expect(columns?.className).toContain('overflow-y-auto')
    expect(columns?.className).toContain('min-h-0')
  })
})
