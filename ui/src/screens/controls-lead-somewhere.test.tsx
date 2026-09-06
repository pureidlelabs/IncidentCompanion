/**
 * Controls that are not dialogs, pressed.
 *
 * What is asserted here is never "a callback ran" - a screen can attach no
 * handler at all and still satisfy that - but that pressing the control
 * changes what the screen shows, or hands over the file it names.
 *
 * A control that genuinely cannot act on mock data is asserted to be *drawn
 * disabled*, which is the honest half of the same rule: an absent control
 * reads as absent, and a dead one reads as working.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { PICKER_CASES, PICKER_LANGUAGES, PICKER_TEMPLATES } from '@/components/blocks/picker-rows'

import { campaignCase } from '@/fixtures/campaign'
import { campaignCompliance } from '@/fixtures/compliance'
import { specsFixture } from '@/fixtures/specs'

import { ImportDataScreen } from './import-data'
import { IndicatorsScreen } from './indicators'
import { OverviewScreen } from './overview'
import { KillchainCoverageScreen } from './killchain-coverage'
import { NotesScreen } from './notes'
import { PickerCasesScreen } from './picker-cases'
import { PickerLanguagesScreen } from './picker-languages'
import { PickerTemplatesScreen } from './picker-templates'
import { TimelineScreen } from './timeline'

describe('the kill chain absence doors', () => {
  it('names what it counted, and puts it away again', async () => {
    const user = userEvent.setup()
    render(<KillchainCoverageScreen kase={campaignCase} specs={specsFixture} />)

    const door = screen.getByTestId('coverage-unplaced')
    expect(screen.queryByTestId('coverage-names')).toBeNull()

    await user.click(door)
    const named = screen.getByTestId('coverage-names')
    // The door says how many; the list has to hold that many, or it is a
    // panel that opened on somebody else's rows.
    const counted = /^(\d+) of/.exec(door.textContent)?.[1]
    expect(counted).toBeDefined()
    expect(within(named).getAllByRole('listitem')).toHaveLength(Number(counted))

    await user.click(door)
    expect(screen.queryByTestId('coverage-names')).toBeNull()
  })

  it('shows one absence at a time, not both', async () => {
    const user = userEvent.setup()
    const { container } = render(<KillchainCoverageScreen kase={campaignCase} specs={specsFixture} />)

    // Whichever absences this case has: the demo has no untagged events, and
    // naming one would tie the test to a fixture rather than to the rule.
    const doors = [...container.querySelectorAll('[data-testid^="coverage-"]')]
    expect(doors.length).toBeGreaterThan(1)

    const listed = async (door: Element) => {
      await user.click(door)
      return within(screen.getByTestId('coverage-names'))
        .getAllByRole('listitem')
        .map((row) => row.textContent)
    }
    const first = await listed(doors[0]!)
    const second = await listed(doors[1]!)

    expect(screen.getAllByTestId('coverage-names')).toHaveLength(1)
    expect(second).not.toEqual(first)
  })
})

describe("the indicators screen's exports", () => {
  /** The CSV the export link would hand over, decoded. */
  function csv(): string {
    const link = screen.getByRole('link', { name: /CSV/ })
    const href = link.getAttribute('href') ?? ''
    return decodeURIComponent(href.replace(/^data:text\/csv;charset=utf-8,/, ''))
  }

  /** The data rows the table is drawing, header excluded. */
  function shownRows(): number {
    return screen.getAllByRole('row').length - 1
  }

  it('hands over the rows that are on screen', () => {
    render(<IndicatorsScreen kase={campaignCase} specs={specsFixture} />)
    // The marking line, the header line, and one line per visible row: an
    // export built from the unfiltered case would be longer than the table.
    expect(csv().trim().split('\n')).toHaveLength(shownRows() + 2)
  })

  it('shortens when the search does', async () => {
    const user = userEvent.setup()
    render(<IndicatorsScreen kase={campaignCase} specs={specsFixture} />)
    const whole = csv().trim().split('\n').length

    // The first cell is the Value, which is what the search box narrows on -
    // the Type column draws a chip that carries no cell text of its own.
    const first = screen.getAllByRole('row')[1]
    const value = within(first!).getAllByRole('gridcell')[0]?.textContent.trim() ?? ''
    expect(value, 'no value to search for').not.toBe('')
    await user.type(screen.getByRole('textbox', { name: /^Value / }), value)

    const narrowed = csv().trim().split('\n')
    expect(narrowed).toHaveLength(shownRows() + 2)
    expect(narrowed.length).toBeLessThan(whole)
  })

  it('marks the file with the marking that is chosen', async () => {
    const user = userEvent.setup()
    render(<IndicatorsScreen kase={campaignCase} specs={specsFixture} />)
    expect(csv().startsWith('# TLP:AMBER')).toBe(true)

    await user.click(screen.getByRole('button', { name: /Marking/ }))
    await user.click(screen.getByRole('option', { name: 'TLP:RED' }))
    expect(csv().startsWith('# TLP:RED')).toBe(true)
  })

  /**
   * The bundle is assembled by the export route, which this tier does not
   * have. Drawn and refused rather than drawn and inert.
   */
  it('hands over a STIX bundle rather than refusing one', () => {
    render(<IndicatorsScreen kase={campaignCase} specs={specsFixture} />)
    const door = screen.getByRole('link', { name: /STIX bundle/ })
    const href = door.getAttribute('href') ?? ''
    expect(href.startsWith('data:application/json')).toBe(true)
    const bundle = JSON.parse(decodeURIComponent(href.split(',').slice(1).join(','))) as {
      type: string
      objects: { type: string; pattern?: string }[]
    }
    expect(bundle.type).toBe('bundle')
    // Patterns, not a list of values: a bundle whose indicators carry no
    // pattern is one a consumer accepts and can match nothing with.
    const found = bundle.objects.filter((one) => one.type === 'indicator')
    expect(found.length).toBeGreaterThan(0)
    for (const one of found) {
      expect(one.pattern).toMatch(/^\[.+ = '.*'\]$/)
    }
  })
})

describe("the case overview's queue doors", () => {
  it('opens the section the row is answered on', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()
    render(<OverviewScreen kase={campaignCase} specs={specsFixture} record={campaignCompliance} onOpen={onOpen} />)

    const queue = screen.getByRole('region', { name: 'Open items' })
    const doors = within(queue).getAllByRole('button')
    await user.click(doors[0]!)

    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onOpen.mock.calls[0]?.[0]).toHaveProperty('section')
  })

})

describe('the picker', () => {
  it('leads somewhere when the header offers a new case', async () => {
    const user = userEvent.setup()
    const went: string[] = []
    render(<PickerCasesScreen cases={PICKER_CASES} analyst="r.okonkwo" userMenu={null} onAbout={() => undefined} onPane={(next) => went.push(next)} />)

    // The rail carries a row of the same name; the header's is the one being
    // pressed, so it is taken from the header rather than by name alone.
    const header = screen.getByRole('banner')
    await user.click(within(header).getByRole('button', { name: 'New case' }))
    expect(went).toEqual(['new'])
  })

  it('takes a language pack out of the list', async () => {
    const user = userEvent.setup()
    render(<PickerLanguagesScreen languages={PICKER_LANGUAGES} analyst="r.okonkwo" userMenu={null} onAbout={() => undefined} />)

    const rows = screen.getAllByRole('row').length
    // An uploaded pack is the only one with a menu at all: a built-in ships
    // with the image and offers nothing, which is what the `...` being absent on
    // those rows says.
    // Read off the table rather than named here: which packs ship with the
    // image is the fixture's business, and only an uploaded one is removable.
    const uploaded = screen
      .getAllByRole('row')
      .find((row) => row.textContent.includes('Uploaded'))
    expect(uploaded, 'no uploaded pack to remove').toBeDefined()
    await user.click(within(uploaded!).getByRole('button', { name: /^More for / }))
    await user.click(screen.getByRole('menuitem', { name: /^Remove/ }))

    expect(screen.getAllByRole('row')).toHaveLength(rows - 1)
  })

  it('duplicates a built-in template into the library', async () => {
    const user = userEvent.setup()
    render(<PickerTemplatesScreen entries={PICKER_TEMPLATES} analyst="r.okonkwo" userMenu={null} onAbout={() => undefined} />)

    const before = screen.getAllByRole('row').length
    await user.click(screen.getAllByRole('button', { name: /^More for / })[0]!)
    await user.click(screen.getByRole('menuitem', { name: 'Duplicate' }))

    expect(screen.getAllByRole('row')).toHaveLength(before + 1)
    expect(screen.getByText(/\(copy\)/)).toBeVisible()
  })
})

describe('the import data screen', () => {
  it('hands over a template of the served columns', () => {
    render(<ImportDataScreen kase={campaignCase} specs={specsFixture} />)
    const link = screen.getAllByRole('link', { name: /Template/ })[0]
    const href = link?.getAttribute('href') ?? ''
    const header = decodeURIComponent(href.replace(/^data:text\/csv;charset=utf-8,/, '')).trim()

    expect(header).not.toBe('')
    expect(header.split(',').length).toBeGreaterThan(1)
  })

  it('refuses the import rather than opening a picker onto nothing', () => {
    render(<ImportDataScreen kase={campaignCase} specs={specsFixture} />)
    for (const control of screen.getAllByRole('button', { name: /Import CSV/ })) {
      expect(control).toBeDisabled()
    }
  })
})

describe('the notes screen', () => {
  /**
   * The add door leads to a note that is written and then findable. There is
   * no dialog to fill in and no Create to press, so what is asserted is this
   * file's own question -- whether the control leads anywhere. The writing
   * itself is attacked in `notes-writing.test.tsx`.
   */
  it('opens what it just wrote', async () => {
    const user = userEvent.setup()
    render(<NotesScreen kase={campaignCase} specs={specsFixture} />)

    await user.click(screen.getByRole('button', { name: 'New note' }))
    const written = 'Reviewed the proxy logs for the staging window.'
    await user.type(screen.getByRole('textbox', { name: 'Note' }), written)

    expect(screen.queryByRole('dialog')).toBeNull()
    // In the index and open in the reading pane: written and then lost is the
    // failure this asserts against.
    expect(screen.getAllByText(new RegExp(written.slice(0, 20)))).not.toHaveLength(0)
  })
})

describe('the timeline add doors', () => {
  it.each([
    { name: 'event', label: 'New event' },
    { name: 'activity', label: 'New activity' },
  ])('$name opens its own form', async ({ label }) => {
    const user = userEvent.setup()
    render(<TimelineScreen kase={campaignCase} specs={specsFixture} />)

    await user.click(screen.getByRole('button', { name: label }))
    expect(screen.getByRole('dialog', { name: label })).toBeInTheDocument()
  })

  it('puts a new activity in the list', async () => {
    const user = userEvent.setup()
    render(<TimelineScreen kase={campaignCase} specs={specsFixture} />)
    const said = 'Isolated the staging host'

    await user.click(screen.getByRole('button', { name: 'New activity' }))
    const dialog = within(screen.getByRole('dialog'))
    await user.type(dialog.getByLabelText('Description (title)'), said)
    await user.click(dialog.getByRole('button', { name: 'Create' }))

    expect(screen.getByText(said)).toBeVisible()
  })
})
