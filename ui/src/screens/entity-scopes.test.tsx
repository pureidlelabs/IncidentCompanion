/**
 * The six entity screens, each asserted to open on its own scope.
 *
 * **The attack is a copy-paste, not a bug in the geometry.** Six files hand one
 * shared shape a `scope`, and the whole of what distinguishes them is that one
 * word - so the defect that survives a green suite and a clean screenshot is
 * `malware.tsx` opening on network. Nothing above this asserts which scope a
 * slug arrives on: the geometry's own tests drive it by pressing the scope row.
 *
 * Each screen is read three ways, because one alone can be right while the
 * screen is wrong: the heading names the kind, the scope row marks that kind
 * current, and the table underneath is labelled with it.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

import { AccountsScreen } from './accounts'
import { AssetsScreen } from './assets'
import { CloudAppsScreen } from './cloud-apps'
import { EntitiesScreen } from './entities'
import { MalwareScreen } from './malware'
import { NetworkScreen } from './network'

/** The kind every chip in the scope row offers, in the order the row draws it. */
const CHIPS = ['All entities', 'Assets', 'Accounts', 'Network', 'Malware', 'Cloud Apps']

const SCOPED = [
  { name: 'assets', draw: () => <AssetsScreen kase={campaignCase} specs={specsFixture} />, kind: 'Assets' },
  { name: 'accounts', draw: () => <AccountsScreen kase={campaignCase} specs={specsFixture} />, kind: 'Accounts' },
  { name: 'network', draw: () => <NetworkScreen kase={campaignCase} specs={specsFixture} />, kind: 'Network' },
  { name: 'malware', draw: () => <MalwareScreen kase={campaignCase} specs={specsFixture} />, kind: 'Malware' },
  { name: 'cloud apps', draw: () => <CloudAppsScreen kase={campaignCase} specs={specsFixture} />, kind: 'Cloud Apps' },
] as const

/** The Filters popover, which is where a facet is read rather than on the bar. */
function popover(): HTMLElement {
  return screen.getByRole('dialog')
}

/** The scope row's chip that is marked as the page, by its kind's title. */
function currentScope(): string {
  const row = screen.getByRole('navigation', { name: 'Scope' })
  const marked = within(row)
    .getAllByRole('button')
    .filter((one) => one.getAttribute('aria-current') === 'page')
  expect(marked, 'exactly one chip is the scope').toHaveLength(1)
  // The chip carries its count in a span of its own, so the title is the first
  // line rather than the accessible name.
  return marked[0]?.textContent.replace(/\d+$/, '') ?? ''
}

describe('a slug opens on its own kind', () => {
  it.each(SCOPED)('$name', ({ draw, kind }) => {
    render(draw())
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(kind)
    expect(currentScope()).toBe(kind)
    expect(screen.getByRole('grid', { name: kind })).toBeInTheDocument()
  })

  it('the unscoped screen opens on every kind', () => {
    render(<EntitiesScreen kase={campaignCase} specs={specsFixture} />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Entities')
    expect(currentScope()).toBe('All entities')
    expect(screen.getByRole('grid', { name: 'Every entity in this case' })).toBeInTheDocument()
  })
})

/**
 * The chrome above the table is one shape at every scope.
 *
 * Not a pixel claim - jsdom lays nothing out. What it holds is that the six
 * draw the *same elements*, which is what a scope row drawn per screen would
 * lose first: the row that answers "which kind is my string in" only answers it
 * if every screen carries every chip.
 */
describe('the chrome is the same at every scope', () => {
  it.each([...SCOPED, { name: 'all', draw: () => <EntitiesScreen kase={campaignCase} specs={specsFixture} />, kind: 'Entities' }])(
    '$name draws every chip, the search box and the filter bar',
    ({ draw }) => {
      render(draw())
      const row = screen.getByRole('navigation', { name: 'Scope' })
      const titles = within(row)
        .getAllByRole('button')
        .map((one) => one.textContent.replace(/\d+$/, ''))
      expect(titles).toEqual(CHIPS)
      expect(screen.getByRole('textbox', { name: /^Entity / })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Filters' })).toBeInTheDocument()
    },
  )

  /**
   * **Kind is a facet at the unscoped view only**, and the scoped screens are
   * where that is easiest to lose: a scope row that narrowed to one kind and a
   * Kind chip nobody can see used to disagree in silence.
   */
  it('offers the Kind facet unscoped and not scoped', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<EntitiesScreen kase={campaignCase} specs={specsFixture} />)
    await user.click(screen.getByRole('button', { name: 'Filters' }))
    expect(within(popover()).getByText('Kind')).toBeInTheDocument()
    unmount()

    render(<MalwareScreen kase={campaignCase} specs={specsFixture} />)
    await user.click(screen.getByRole('button', { name: 'Filters' }))
    expect(within(popover()).queryByText('Kind')).toBeNull()
    // The pair below it is still offered, so an absent Kind is the scope rule
    // rather than a popover that failed to open.
    expect(within(popover()).getByText('Attention')).toBeInTheDocument()
  })
})
