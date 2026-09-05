import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { PaletteResults, type PaletteGroup } from './palette-results'

/**
 * **Written to make the list run the wrong row, or draw a chord and a hint chip
 * on rows that should carry neither.**
 */
const PROPS = { emptyLabel: 'Nothing matches.' }

describe('PaletteResults', () => {
  it('reports the row that was pressed, not the first row in its group', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    const groups: PaletteGroup[] = [
      {
        label: 'Actions',
        items: [
          { id: 'first', label: 'First action' },
          { id: 'second', label: 'Second action' },
        ],
      },
    ]
    render(<PaletteResults {...PROPS} groups={groups} onAction={onAction} />)

    await user.click(screen.getByRole('option', { name: 'Second action' }))

    expect(onAction).toHaveBeenCalledExactlyOnceWith('second')
  })

  it('draws a chord, not a hint chip, on a row that carries a chord', () => {
    const groups: PaletteGroup[] = [
      {
        label: 'Actions',
        items: [{ id: 'save', label: 'Save', chord: [{ key: 's', mod: true }], hint: 'stale' }],
      },
    ]
    render(<PaletteResults {...PROPS} groups={groups} />)

    const row = screen.getByRole('option', { name: /^Save/ })
    expect(within(row).queryByText('stale')).toBeNull()
  })

  it('draws a hint chip, not a chord, on a row with no chord', () => {
    const groups: PaletteGroup[] = [
      { label: 'Recent', items: [{ id: 'doc', label: 'A document', hint: 'Letters' }] },
    ]
    render(<PaletteResults {...PROPS} groups={groups} />)

    expect(
      within(screen.getByRole('option', { name: /^A document/ })).getByText('Letters'),
    ).toBeVisible()
  })

  it('drops a group whose items filtered to nothing rather than heading an empty list', () => {
    const groups: PaletteGroup[] = [
      { label: 'Actions', items: [{ id: 'save', label: 'Save' }] },
      { label: 'Recent', items: [] },
    ]
    render(<PaletteResults {...PROPS} groups={groups} />)

    expect(screen.queryByText('Recent')).toBeNull()
  })

  it('shows the empty label only when every group is empty', () => {
    render(<PaletteResults {...PROPS} groups={[{ label: 'Actions', items: [] }]} />)

    expect(screen.getByText('Nothing matches.')).toBeVisible()
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('does not throw when a row is pressed with no onAction wired', async () => {
    const user = userEvent.setup()
    const groups: PaletteGroup[] = [{ label: 'Actions', items: [{ id: 'save', label: 'Save' }] }]
    render(<PaletteResults {...PROPS} groups={groups} />)

    await expect(user.click(screen.getByRole('option', { name: 'Save' }))).resolves.not.toThrow()
  })
})
