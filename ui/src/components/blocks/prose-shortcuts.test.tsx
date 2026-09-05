import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { PROSE_KEYS, keyLabel } from './prose-keys'
import { ProseShortcuts } from './prose-shortcuts'

/**
 * The cheat sheet, whose only job is to be complete and to be dismissible.
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
   * Escape is the only way out that costs nothing to reach, and it is the one a
   * hand-rolled overlay loses.
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
 */
describe('the list carries its own scroll', () => {
  it('keeps the columns scrollable inside the frame', () => {
    render(<ProseShortcuts open onOpenChange={vi.fn()} />)
    const columns = screen.getByRole('dialog').querySelector('[data-slot="prose-shortcuts-list"]')

    expect(columns?.className).toContain('overflow-y-auto')
    expect(columns?.className).toContain('min-h-0')
  })
})
