import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { CommandPalette, type PaletteGroup } from './command-palette'

/**
 * **Written to make the palette run the wrong row, or show a chord and a
 * hint chip on rows that should carry neither.**
 *
 * Those are the two failures a screen can never see rendered correctly by
 * eye and wrong underneath: an `onAction` that fires with the previous row's
 * id, and a row whose `chord`/`hint` branch prints the wrong end-of-row
 * decoration because the two are mutually exclusive by convention rather
 * than by type.
 */

const PROPS = {
  placeholder: 'Search',
  emptyLabel: 'Nothing matches.',
  query: '',
  onQueryChange: () => undefined,
}

describe('CommandPalette', () => {
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
    render(<CommandPalette {...PROPS} groups={groups} onAction={onAction} />)

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
    render(<CommandPalette {...PROPS} groups={groups} />)

    const row = screen.getByRole('option', { name: /^Save/ })
    expect(within(row).queryByText('stale')).toBeNull()
  })

  it('draws a hint chip, not a chord, on a row with no chord', () => {
    const groups: PaletteGroup[] = [
      { label: 'Recent', items: [{ id: 'doc', label: 'A document', hint: 'Letters' }] },
    ]
    render(<CommandPalette {...PROPS} groups={groups} />)

    expect(
      within(screen.getByRole('option', { name: /^A document/ })).getByText('Letters'),
    ).toBeVisible()
  })

  it('drops a group whose items filtered to nothing rather than heading an empty list', () => {
    const groups: PaletteGroup[] = [
      { label: 'Actions', items: [{ id: 'save', label: 'Save' }] },
      { label: 'Recent', items: [] },
    ]
    render(<CommandPalette {...PROPS} groups={groups} />)

    expect(screen.queryByText('Recent')).toBeNull()
  })

  it('shows the empty label only when every group is empty', () => {
    render(<CommandPalette {...PROPS} groups={[{ label: 'Actions', items: [] }]} />)

    expect(screen.getByText('Nothing matches.')).toBeVisible()
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('does not throw when a row is pressed with no onAction wired', async () => {
    const user = userEvent.setup()
    const groups: PaletteGroup[] = [{ label: 'Actions', items: [{ id: 'save', label: 'Save' }] }]
    render(<CommandPalette {...PROPS} groups={groups} />)

    await expect(user.click(screen.getByRole('option', { name: 'Save' }))).resolves.not.toThrow()
  })
})
