import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Dialog, DialogBody, DialogHeader } from '@/components/ui/dialog'
import { EntityCombobox } from '@/components/blocks/entity-combobox'

import { pressOutside, pressTrigger } from '@/test/press'

/**
 * The picker itself: filtering, the create row's two positions, and the
 * keyboard vocabulary it shares with `HeaderSearch`.
 *
 * Rows are `<button role="option">` rather than anchors - `userEvent.click` on
 * a link reaches jsdom's own navigation, which is a repository-wide trap and
 * not a property of this control.
 */

const HOSTS = new Map([
  ['s1', 'WKS-FIN01'],
  ['s2', 'WKS-FIN02'],
  ['s3', 'DC-01'],
])

function mount(overrides: Partial<Parameters<typeof EntityCombobox>[0]> = {}) {
  const onPick = vi.fn<(id: string) => void>()
  render(
    <EntityCombobox label="Destination host" options={HOSTS} onPick={onPick} {...overrides} />,
  )
  return { onPick, box: screen.getByRole('combobox', { name: 'Destination host' }) }
}

const list = () => screen.getByRole('listbox', { name: 'Destination host' })

describe('type-to-filter', () => {
  it('narrows the list to the rows whose label contains what was typed', async () => {
    const { box } = mount()
    await userEvent.type(box, 'fin')

    const rows = within(list()).getAllByRole('option')
    expect(rows.map((row) => row.textContent)).toEqual(['WKS-FIN01', 'WKS-FIN02'])
  })

  it('matches a substring, not only a prefix \u2014 which is the whole gain over the native select', async () => {
    const { box } = mount()
    await userEvent.type(box, 'fin02')
    expect(within(list()).getAllByRole('option').map((row) => row.textContent)).toEqual([
      'WKS-FIN02',
    ])
  })

  it('leaves out ids the caller already holds as chips', async () => {
    const { box } = mount({ exclude: ['s1'] })
    await userEvent.click(box)
    await userEvent.type(box, 'wks')
    expect(within(list()).getAllByRole('option').map((row) => row.textContent)).toEqual([
      'WKS-FIN02',
    ])
  })
})

describe('the create row', () => {
  it('is pinned at the foot of the matches', async () => {
    const { box } = mount({ onCreateNew: vi.fn(), createLabel: 'New asset' })
    await userEvent.type(box, 'fin')
    const rows = within(list()).getAllByRole('option')
    expect(rows.map((row) => row.textContent)).toEqual(['WKS-FIN01', 'WKS-FIN02', 'New asset'])
  })

  it('is still offered when the filter matches nothing \u2014 the empty state is where creating is the only useful action', async () => {
    const onCreateNew = vi.fn<() => void>()
    const { box, onPick } = mount({ onCreateNew, createLabel: 'New asset' })
    await userEvent.type(box, 'nothing-matches-this')

    const rows = within(list()).getAllByRole('option')
    expect(rows.map((row) => row.textContent)).toEqual(['New asset'])

    await userEvent.click(rows[0]!)
    expect(onCreateNew).toHaveBeenCalledTimes(1)
    expect(onPick).not.toHaveBeenCalled()
  })

  it('is absent when the caller offers no create, and the no-match state says so instead', async () => {
    const { box } = mount()
    await userEvent.type(box, 'nothing-matches-this')
    // **Rows, not roles.** React Aria wraps the empty state in a `role=option`
    // of its own at `display: contents` - an ARIA requirement, since a listbox
    // may only hold options - so counting the role counts the message as a
    // row. `data-slot` is the kit's own mark on a real one.
    expect(list().querySelectorAll('[data-slot="list-box-item"]')).toHaveLength(0)
    expect(screen.getByText('Nothing matches.')).toBeInTheDocument()
  })
})

describe('the + button', () => {
  it('opens the picker rather than creating', () => {
    const onCreateNew = vi.fn<() => void>()
    mount({ onCreateNew, createLabel: 'New asset' })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

    // `pressTrigger`, not `userEvent.click` - see `test/press.ts` for the
    // measured table. A Base UI trigger opens under `fireEvent.click` and only
    // sometimes under `userEvent`, and the failure looks like an absent list.
    pressTrigger(screen.getByRole('button', { name: 'Choose Destination host' }))

    expect(within(list()).getAllByRole('option')).toHaveLength(4)
    expect(onCreateNew).not.toHaveBeenCalled()
  })
})

describe('the keyboard vocabulary', () => {
  it('does not open on tab, where a click does \u2014 a form tabbed through would open every picker in it', async () => {
    mount()
    await userEvent.tab()
    expect(screen.getByRole('combobox', { name: 'Destination host' })).toHaveFocus()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })


  it('opens with nothing highlighted, and ArrowDown enters row 0 and wraps', async () => {
    const { box } = mount()
    await userEvent.click(box)
    const rows = () => within(list()).getAllByRole('option')
    // Nothing highlighted at open: `autoHighlight` acts while *filtering*, and
    // the list opens unfiltered.
    expect(box).not.toHaveAttribute('aria-activedescendant')

    await userEvent.keyboard('{ArrowDown}')
    expect(box).toHaveAttribute('aria-activedescendant', rows()[0]?.id)

    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}')
    expect(box).toHaveAttribute('aria-activedescendant', rows()[0]?.id)
  })

  /**
   * The one key the move to the primitive changed. It used to hand the caret
   * back to the box; `loopFocus` is either-or and its `false` setting stops
   * `ArrowDown` wrapping too, which is the more used half. Asserted rather
   * than left silent so the divergence from `HeaderSearch` is written down
   * somewhere a reader will meet it.
   */
  it('ArrowUp on the first row wraps to the last, where it used to leave the list', async () => {
    const { box } = mount()
    await userEvent.click(box)
    const rows = () => within(list()).getAllByRole('option')
    await userEvent.keyboard('{ArrowDown}{ArrowUp}')
    expect(box).toHaveAttribute('aria-activedescendant', rows()[rows().length - 1]?.id)
  })

  it('Enter picks the highlighted row', async () => {
    const { box, onPick } = mount()
    await userEvent.type(box, 'fin')
    // One ArrowDown, not two: typing narrows to two rows and `autoHighlight`
    // has already taken the first, so the second is one step away.
    await userEvent.keyboard('{ArrowDown}{Enter}')
    expect(onPick).toHaveBeenCalledWith('s2')
  })

  it('Enter with nothing highlighted picks the first match, so a narrowed filter needs no ArrowDown', async () => {
    const { box, onPick } = mount()
    await userEvent.type(box, 'dc-')
    await userEvent.keyboard('{Enter}')
    expect(onPick).toHaveBeenCalledWith('s3')
  })

  it('Escape closes the list and drops the filter', async () => {
    const { box, onPick } = mount()
    await userEvent.type(box, 'fin')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => {
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    })
    expect(box).toHaveValue('')
    expect(onPick).not.toHaveBeenCalled()
  })
})

/**
 * The four props a caller hands down and never looks at again.
 *
 * Each is wired through one line, each goes silently inert when that line is
 * wrong, and the callers are a live timeline control and the entity dialog's
 * form - `field-control` passes all four out of one bundle.
 */
describe('what the caller wires through', () => {
  it('puts the caller\u2019s id on the box itself, which is what a `<label for>` points at', () => {
    mount({ id: 'field-destination-host' })
    // Not `getByRole(...).id`: React Aria generates one of its own for the
    // input, and merging the two is where the caller's can be dropped.
    const box = document.getElementById('field-destination-host')
    expect(box?.getAttribute('role')).toBe('combobox')
  })

  it('marks a refused field, so it gains the destructive border the rest of the dialog has', () => {
    const { box } = mount({ 'aria-invalid': true })
    expect(box).toHaveAttribute('aria-invalid', 'true')
  })

  it('leaves a valid field unmarked rather than saying so', () => {
    const { box } = mount()
    expect(box).not.toHaveAttribute('aria-invalid')
  })

  it('offers no list at all when the field is disabled', async () => {
    const { box } = mount({ disabled: true })
    await userEvent.click(box)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(box).toBeDisabled()
  })
})

describe('reopening after a pick', () => {
  it('offers every row again, though the box now holds the chosen row\u2019s own label', async () => {
    const { box } = mount({ value: 's3' })
    expect(box).toHaveValue('DC-01')
    await userEvent.click(box)
    // The box's text is not a query. React Aria writes the picked label back
    // into the input, so a filter that trusted it would narrow the next open
    // to the one row already chosen.
    expect(within(list()).getAllByRole('option').map((row) => row.textContent)).toEqual([
      'WKS-FIN01',
      'WKS-FIN02',
      'DC-01',
    ])
  })
})

describe('what the closed box shows', () => {
  it('the chosen row\u2019s label, and the id beside it for a caller that has to assert which row landed', () => {
    const { box } = mount({ value: 's3' })
    expect(box).toHaveValue('DC-01')
    expect(box).toHaveAttribute('data-selected', 's3')
  })

  it('keeps a dangling id visible rather than reading as an empty field', () => {
    const { box } = mount({ value: 'gone' })
    expect(box).toHaveValue('gone (missing reference)')
  })
})

describe('the list is portalled out of whatever is clipping it', () => {
  it('renders the list outside the field, so an ancestor\u2019s overflow cannot clip it', async () => {
    const { box } = mount()
    await userEvent.click(box)

    const portal = document.body.querySelector('[data-combobox-portal]')
    expect(portal).not.toBeNull()
    expect(portal?.contains(list())).toBe(true)

    // The field itself no longer holds the list - the whole point, since an
    // ancestor's `overflow-y-auto` is what was cutting the rows off.
    //
    // **Where it mounts is not asserted.** The primitive owns its own portal
    // root, and pinning the parent would pin the library's
    // internals rather than the property that matters.
    expect(box.closest('[data-combobox-portal]')).toBeNull()
  })
})

describe('a portalled list inside a dialog', () => {
  function mountInDialog() {
    const onPick = vi.fn<(id: string) => void>()
    const onOpenChange = vi.fn<(open: boolean) => void>()
    render(
      <Dialog isOpen onOpenChange={onOpenChange} dialogProps={{ 'aria-label': 'Link a host' }}>
        <DialogHeader title="Link a host" />
        <DialogBody>
          <EntityCombobox label="Destination host" options={HOSTS} onPick={onPick} />
        </DialogBody>
      </Dialog>,
    )
    return { onPick, onOpenChange }
  }

  it('picks the row and leaves the dialog open, though the row is not a DOM descendant of it', async () => {
    const { onPick, onOpenChange } = mountInDialog()

    const box = screen.getByRole('combobox', { name: 'Destination host' })
    await userEvent.click(box)
    const row = list().querySelector<HTMLElement>('[role="option"][data-entity-id="s2"]')
    expect(screen.getByRole('dialog').contains(row)).toBe(false)
    await userEvent.click(row!)

    expect(onPick).toHaveBeenCalledWith('s2')
    // Quick-add's whole premise. Radix reads "outside" off a React synthetic
    // capture handler, which reaches through the portal along the React tree -
    // so nothing has to gate the dismissal, and nothing does.
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('still closes on a click that is genuinely outside \u2014 the gate is the portal, not every outside click', () => {
    const { onOpenChange } = mountInDialog()
    // The scrim, because that is the only outside surface a modal dialog
    // leaves clickable: it zeroes the body's own pointer events.
    //
    // `pressOutside`, for the reason `test/press.ts` records: dismissal is
    // decided on the press, so a click alone leaves the dialog open.
    //
    // **By slot, not by class.** A utility class is a styling decision and
    // moves; the slot is the handle the kit publishes for exactly this.
    pressOutside(document.querySelector<HTMLElement>('[data-slot="dialog"]')!)
    // `toHaveBeenCalledWith(false)` would fail on the arity, not the value:
    // the primitive hands the handler `(open, eventDetails)`, and the matcher
    // is exact about the whole argument list.
    expect(onOpenChange.mock.calls[0]?.[0]).toBe(false)
  })
})
