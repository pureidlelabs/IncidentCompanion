/**
 * A row's detail, on every scope of the entity family.
 *
 * **The scope you reached a row through must not decide what the row can do.**
 * `entities.tsx` draws two tables -- `MixedTable` for *All entities* and
 * `KindTable` for each kind -- so a capability passed to one and not the other
 * lets the same account expand under one tab and not another. Nothing says so:
 * the control is simply absent, which reads as a row with nothing more to show
 * rather than as a table missing a capability.
 *
 * **Asserted here rather than in a story** because the story tier renders
 * these screens and asserts nothing about them, and the browser tier cannot
 * tell an absent control from one it did not look for. What this cannot
 * see is whether the control is *visible* -- jsdom has no CSS, and the cluster
 * these buttons live in is revealed on hover. That half is
 * `e2e/visual`'s.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

import { EntitiesScreen } from './entities'

/** Every scope the family offers, named as the screen names them. */
const SCOPES = [
  ['all', 'All entities'],
  ['assets', 'Assets'],
  ['accounts', 'Accounts'],
  ['network', 'Network'],
  ['malware', 'Malware'],
  ['cloud-apps', 'Cloud apps'],
] as const

/**
 * The first row that carries an actions cluster.
 *
 * By the cluster rather than by index: a table may draw a spacer row, and the
 * head is a row too.
 */
function firstActionRow(): HTMLElement {
  const rows = screen.getAllByRole('row')
  const found = rows.find((row) => within(row).queryByRole('button', { name: /in full$/ }))
  if (!found) throw new Error('no row draws an actions cluster')
  return found
}

describe('the row detail, whichever scope you came through', () => {
  it.each(SCOPES)('offers to show the detail on %s', (scope) => {
    render(<EntitiesScreen kase={campaignCase} specs={specsFixture} scope={scope} />)
    expect(
      within(firstActionRow()).queryByRole('button', { name: /show detail/i }),
      `the ${scope} scope draws no way to open a row`,
    ).not.toBeNull()
  })

  /**
   * Both tables, because they draw the panel from different shapes.
   *
   * `MixedTable` carries a projection with a `fields` bag; a kind's row *is*
   * the entry. Asserting only the scoped one let `renderExpanded={() => null}`
   * on the mixed table pass -- found by mutation, not by reading.
   */
  it.each([['all'], ['accounts']] as const)('opens a panel under the row on %s', async (scope) => {
    const user = userEvent.setup()
    render(<EntitiesScreen kase={campaignCase} specs={specsFixture} scope={scope} />)
    const row = firstActionRow()
    const before = screen.getAllByRole('row').length

    await user.click(within(row).getByRole('button', { name: /show detail/i }))

    // A row was added rather than a dialog opened: the detail is a panel under
    // the row, which is what keeps the rest of the table in view.
    const after = screen.getAllByRole('row')
    expect(after.length).toBeGreaterThan(before)
    expect(screen.queryByRole('dialog')).toBeNull()

    // And it carries something. An empty panel is the same control leading
    // nowhere, one step later.
    const panel = after[after.indexOf(row) + 1]!
    expect(panel.textContent.trim().length).toBeGreaterThan(0)
  })
})
