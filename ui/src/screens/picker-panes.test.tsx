import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { PICKER_PANES, type PickerPane } from '@/components/blocks/picker-panes'
import {
  PICKER_ACCOUNTS,
  PICKER_AUDIT,
  PICKER_AUDIT_NOW,
  PICKER_CASES,
  PICKER_LANGUAGES,
  PICKER_TEMPLATES,
} from '@/components/blocks/picker-rows'

import { PickerAccountsScreen } from './picker-accounts'
import { PickerActivityScreen } from './picker-activity'
import { PickerAdministrationScreen } from './picker-administration'
import { PickerCasesScreen } from './picker-cases'
import { PickerDemosScreen } from './picker-demos'
import { PickerHealthScreen } from './picker-health'
import { PickerLanguagesScreen } from './picker-languages'
import { PickerNewScreen } from './picker-new'
import { PickerReportsScreen } from './picker-reports'
import { PickerSnippetsScreen } from './picker-snippets'
import { PickerTemplatesScreen } from './picker-templates'

/**
 * What every picker screen now requires of its caller.
 */
const RAIL = {
  analyst: 'r.okonkwo',
  userMenu: null,
  onAbout: () => undefined,
  // The rows each pane draws. A screen that takes none ignores them, and the
  // map stays one shape.
  cases: PICKER_CASES,
  entries: PICKER_TEMPLATES,
  accounts: PICKER_ACCOUNTS,
  audit: PICKER_AUDIT,
  // The activity log filters on a range, so the clock it reads is a fixture
  // like the rows are. See `PICKER_AUDIT_NOW`.
  now: PICKER_AUDIT_NOW,
  languages: PICKER_LANGUAGES,
  // Two panes carry an action of their own; a screen that takes neither
  // ignores them, and the map stays one shape.
  roles: [] as readonly string[],
  defaultRole: 'analyst',
  onCreate: () => undefined,
  href: () => '/cases/x/overview',
  // Health is the one pane whose data cannot be a sample, so the map carries
  // an empty read rather than the constants the pane used to default to.
  health: {
    uptime: undefined,
    serving: [],
    gauges: [],
    connections: undefined,
    figures: [],
    tables: [],
  },
}

/** The screen each pane is reached as. A pane with none is the defect. */
const SCREENS: Readonly<Record<PickerPane, React.ComponentType<typeof RAIL>>> = {
  new: PickerNewScreen,
  cases: PickerCasesScreen,
  demos: PickerDemosScreen,
  templates: PickerTemplatesScreen,
  reports: PickerReportsScreen,
  snippets: PickerSnippetsScreen,
  accounts: PickerAccountsScreen,
  activity: PickerActivityScreen,
  administration: PickerAdministrationScreen,
  languages: PickerLanguagesScreen,
  health: PickerHealthScreen,
}

/** The heading each pane owes, and one thing only that pane puts on screen. */
const OWED: readonly { pane: PickerPane; heading: string; only: string }[] = [
  { pane: 'new', heading: 'Start a case', only: 'Blank case' },
  { pane: 'cases', heading: 'Your cases', only: 'Ticket' },
  { pane: 'demos', heading: 'Demo cases', only: 'Worked ransomware campaign' },
  { pane: 'templates', heading: 'Case templates', only: 'New template' },
  { pane: 'reports', heading: 'Reports', only: 'Layouts' },
  { pane: 'snippets', heading: 'Snippets', only: 'New snippet' },
  { pane: 'accounts', heading: 'Accounts', only: 'No second factor' },
  { pane: 'activity', heading: 'Activity', only: 'Initiated by' },
  { pane: 'administration', heading: 'Administration', only: 'Activity log' },
  { pane: 'languages', heading: 'Report languages', only: 'Upload a pack' },
  { pane: 'health', heading: 'Health', only: 'Tables holding rows, largest first' },
]

/** The pane every rail row can reach, so a new one cannot be left untested. */
it('owes a row in this table for every pane the rail offers', () => {
  expect(OWED.map((one) => one.pane).sort()).toEqual([...PICKER_PANES].sort())
})

/**
 * **The rail's selection reaches the body.**
 *
 * A heading alone is too weak a claim, because a body that swapped only its
 * title would pass it. Each pane is checked on **something only it draws** as
 * well: a column header, an empty state's own words, a control's label. What no
 * test here can see is whether the pane *looks* right - that is the story tier
 * and the capture.
 */
describe('the body draws the pane the rail is lit on', () => {
  it.each(OWED)('$pane draws $heading', ({ heading, pane, only }) => {
    const Screen = SCREENS[pane]
    render(<Screen {...RAIL} />)

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(heading)
    expect(screen.getAllByText(only).length).toBeGreaterThan(0)
  })

  /**
   * The case table is the body a single-screen picker draws under every rail
   * row, so its absence is the claim - a pane that merely *also* renders it
   * would pass the heading check above.
   */
  it.each(OWED.filter((one) => one.pane !== 'cases'))(
    '$pane does not draw the case table',
    ({ pane }) => {
      const Screen = SCREENS[pane]
    render(<Screen {...RAIL} />)
      expect(screen.queryByRole('grid', { name: 'Cases on this install' })).toBeNull()
    },
  )
})

/**
 * The rail reports where a row goes; the router decides what that means.
 */
it('reports the pane a rail row stands for', async () => {
  const user = userEvent.setup()
  const went: string[] = []
  render(<PickerCasesScreen {...RAIL} onPane={(pane) => went.push(pane)} />)

  await user.click(screen.getByTestId('picker-row-health'))
  await user.click(screen.getByTestId('picker-row-accounts'))

  expect(went).toEqual(['health', 'accounts'])
})


/** A pane with rows to narrow says which narrowing emptied it, not just that it is empty. */
it('names what emptied the accounts table', async () => {
  const user = userEvent.setup()
  render(<PickerAccountsScreen accounts={PICKER_ACCOUNTS} analyst="r.okonkwo" userMenu={null} onAbout={() => undefined} roles={[]} defaultRole="analyst" onCreate={() => undefined} />)

  await user.type(screen.getByRole('textbox', { name: 'Account contains' }), 'nobody by that name')

  const empty = screen.getByText('Nothing matches')
  expect(within(empty.closest('[data-slot="empty"]') ?? empty).getByRole('button')).toHaveTextContent(
    'Show every account',
  )
})

/**
 * **The case pane's ways in reach the rail, and each reaches its own row.**
 */
describe('an empty install reaches the rail from the case pane', () => {
  it.each([
    { offer: 'New case', pane: 'new' },
    { offer: 'Demo cases', pane: 'demos' },
  ])('$offer reports $pane', async ({ offer, pane }) => {
    const user = userEvent.setup()
    const went: string[] = []
    render(<PickerCasesScreen {...RAIL} cases={[]} onPane={(next) => went.push(next)} />)

    // The rail carries a `New case` row and the header a `New case` button, so
    // the offer is taken from inside the empty state rather than by name alone.
    const ways = document.querySelector<HTMLElement>('[data-slot="empty-offers"]')
    if (ways === null) throw new Error('the empty install drew no ways in')
    await user.click(within(ways).getByRole('button', { name: new RegExp(offer) }))

    // Each offer reports its own pane. Wiring both to one is a fresh install
    // where *Demo cases* opens *Start a case*, and every other test stays green.
    expect(went).toEqual([pane])
  })
})
