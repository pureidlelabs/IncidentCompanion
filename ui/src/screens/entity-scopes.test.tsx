/**
 * The entity screen, asserted to open on the scope it is given.
 *
 * **The per-kind enumeration went with the per-kind files.** Five wrappers each
 * handing one shared shape a `scope` made the defect a copy-paste -
 * `malware.tsx` opening on network - so each was read on its own. One
 * component takes the scope as a prop, and which slug passes which scope is
 * `api/entityTargets.test.ts`'s claim, read from source rather than by
 * mounting every spelling someone remembered.
 *
 * What is left is the pair a prop cannot decide: the unscoped view and a
 * scoped one differ in the heading, the marked chip, the table's label and
 * whether Kind is still a facet.
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

/** Every chip, the search box and the filter bar, which the scope row loses first. */
function expectChrome(): void {
  const row = screen.getByRole('navigation', { name: 'Scope' })
  const titles = within(row)
    .getAllByRole('button')
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
   * **Kind is a facet at the unscoped view only**, and the scoped view is where
   * that is easiest to lose: a scope row that narrowed to one kind and a Kind
   * chip nobody can see used to disagree in silence.
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
