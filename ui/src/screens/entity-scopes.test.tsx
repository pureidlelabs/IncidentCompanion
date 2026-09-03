/**
 * The entity screen, asserted to open on the scope it is given.
 *
 * **Which slug passes which scope is not asserted here.**
 * `api/entityTargets.test.ts` reads that from source, so a spelling nobody
 * thought to mount is still covered. What is left is the pair a prop decides:
 * the unscoped view and a scoped one differ in the heading, the marked chip,
 * the table's label and whether Kind is still a facet.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

import { EntitiesScreen } from './entities'

/** The kind every chip in the scope row offers, in the order the row draws it. */
const CHIPS = ['All entities', 'Assets', 'Accounts', 'Network', 'Malware', 'Cloud Apps']

/** The Filters popover, which is where a facet is read rather than on the bar. */
function popover(): HTMLElement {
  return screen.getByRole('dialog')
}

/** The scope row's selected tab, by its kind's title. */
function currentScope(): string {
  const row = screen.getByRole('tablist', { name: 'Scope' })
  const marked = within(row)
    .getAllByRole('tab')
    .filter((one) => one.getAttribute('aria-selected') === 'true')
  expect(marked, 'exactly one tab is the scope').toHaveLength(1)
  // The tab carries its count in a span of its own, so the title is the first
  // line rather than the accessible name.
  return marked[0]?.textContent.replace(/\d+$/, '') ?? ''
}

/** Every tab, the search box and the filter bar, which the scope row loses first. */
function expectChrome(): void {
  const row = screen.getByRole('tablist', { name: 'Scope' })
  const titles = within(row)
    .getAllByRole('tab')
    .map((one) => one.textContent.replace(/\d+$/, ''))
  expect(titles).toEqual(CHIPS)
  expect(screen.getByRole('textbox', { name: /^Entity / })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Filters' })).toBeInTheDocument()
}

describe('the screen opens on the scope it is given', () => {
  it('unscoped, on every kind', () => {
    render(<EntitiesScreen kase={campaignCase} specs={specsFixture} />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Entities')
    expect(currentScope()).toBe('All entities')
    expect(screen.getByRole('grid', { name: 'Every entity in this case' })).toBeInTheDocument()
    expectChrome()
  })

  /**
   * **Narrowing to one kind keeps the whole row.** The row answers "which kind
   * is my string in", and it only answers it while a scoped view still carries
   * every chip.
   */
  it('scoped, on that kind alone', () => {
    render(<EntitiesScreen kase={campaignCase} specs={specsFixture} scope="malware" />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Malware')
    expect(currentScope()).toBe('Malware')
    expect(screen.getByRole('grid', { name: 'Malware' })).toBeInTheDocument()
    expectChrome()
  })

  /**
   * **The heading and the chip are derived from the scope, so the rows are the
   * only witness to which collection an arm reads.** `ScopeBody` binds each
   * scope to a `rowsOf`, and a swapped arm keeps every label right while the
   * table underneath holds another kind's records - which `entityTargets.test.ts`
   * cannot see, because it reads the source for the arm's existence rather
   * than mounting it.
   *
   * Read from the fixture rather than written out, so regenerating the demo
   * moves the expectation with it.
   */
  it.each([
    { scope: 'assets', kind: 'Assets', mine: campaignCase.systems[0]?.hostname },
    { scope: 'accounts', kind: 'Accounts', mine: campaignCase.accounts[0]?.accountName },
    { scope: 'network', kind: 'Network', mine: campaignCase.networkIndicators[0]?.value },
    { scope: 'malware', kind: 'Malware', mine: campaignCase.malware[0]?.filename },
    { scope: 'cloud-apps', kind: 'Cloud Apps', mine: campaignCase.cloudApps[0]?.appName },
  ] as const)('$scope draws its own collection', ({ scope, kind, mine }) => {
    expect(mine, `the campaign fixture holds no ${scope} row to identify`).toBeTruthy()
    render(<EntitiesScreen kase={campaignCase} specs={specsFixture} scope={scope} />)

    const grid = screen.getByRole('grid', { name: kind })
    expect(
      within(grid).getAllByText(String(mine)).length,
      `${scope} drew no row of its own`,
    ).toBeGreaterThan(0)
  })

  /**
   * **Kind is a facet at the unscoped view only.** Scoped, the row above names
   * the kind, so a Kind chip in the popover would disagree with it silently.
   */
  it('offers the Kind facet unscoped and not scoped', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<EntitiesScreen kase={campaignCase} specs={specsFixture} />)
    await user.click(screen.getByRole('button', { name: 'Filters' }))
    expect(within(popover()).getByText('Kind')).toBeInTheDocument()
    unmount()

    render(<EntitiesScreen kase={campaignCase} specs={specsFixture} scope="malware" />)
    await user.click(screen.getByRole('button', { name: 'Filters' }))
    expect(within(popover()).queryByText('Kind')).toBeNull()
    // The pair below it is still offered, so an absent Kind is the scope rule
    // rather than a popover that failed to open.
    expect(within(popover()).getByText('Attention')).toBeInTheDocument()
  })
})
