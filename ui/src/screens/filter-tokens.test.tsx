/**
 * Every filtered screen, attacked on the one thing a token is for: taking off
 * **this** filter and no other.
 *
 * **Per screen, not once.** The block computes the removal, but each screen
 * wires its own dimensions, its own counts and its own matching, and the way
 * this breaks is a screen whose remove handler resets the state it holds -
 * which is `Clear` under another name and looks correct on the bar, because
 * the token does disappear.
 *
 * So the assertion is never "the token went". It is that the table is left
 * showing exactly what the surviving filter alone would show, measured on a
 * second render of the same screen with only that filter on. A remove that
 * clears everything leaves the unfiltered table, and the two numbers part.
 *
 * What this tier cannot see is the bar itself - whether the tokens wrap, clip
 * or collide is the capture's business.
 */
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import type { ReactElement } from 'react'

import { PICKER_ACCOUNTS, PICKER_AUDIT, PICKER_AUDIT_NOW, PICKER_CASES } from '@/components/blocks/picker-rows'
import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

import { ActionsScreen } from './actions'
import { EntitiesScreen } from './entities'
import { EvidenceScreen } from './evidence'
import { ImpactScreen } from './impact'
import { IndicatorsScreen } from './indicators'
import { PickerAccountsScreen } from './picker-accounts'
import { PickerActivityScreen } from './picker-activity'
import { PickerCasesScreen } from './picker-cases'

afterEach(cleanup)

/** Rows the table is drawing, headers excluded. */
function rows(): number {
  return document.querySelectorAll('tbody tr').length
}

/** Opens the filter popover, whichever screen it belongs to. */
async function openFilters(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('button', { name: 'Filters' }))
}

/**
 * The chips on offer, in the order the popover draws them.
 *
 * Found by `data-value`, which carries the chip's own value and so identifies
 * *which* chip. A slot would only say that it is one.
 */
function chipNames(): string[] {
  return [...document.querySelectorAll('[role="dialog"] [data-value]')]
    .filter(
      (node) =>
        !node.hasAttribute('disabled') &&
        !node.hasAttribute('data-disabled') &&
        node.getAttribute('aria-disabled') !== 'true',
    )
    .map((node) => node.getAttribute('data-value') ?? '')
    .filter(Boolean)
}

async function pressChip(
  user: ReturnType<typeof userEvent.setup>,
  value: string,
): Promise<void> {
  const chip = document.querySelector(`[role="dialog"] [data-value="${value}"]`)
  if (chip === null) throw new Error(`no chip named ${value}`)
  await user.click(chip)
}

/** The tokens on the bar, by the filter each one names. */
function tokenLabels(): string[] {
  return [...document.querySelectorAll('[data-slot="applied-filter"]')].map((node) =>
    node.textContent.replace(/\d+$/, '').trim(),
  )
}

async function removeToken(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
): Promise<void> {
  await user.click(screen.getByRole('button', { name: `Remove the ${label} filter` }))
}

/**
 * The eight filtered surfaces.
 *
 * The picker is three of them: its panes each hold their own filters, and the
 * screen is one file only by accident of where they live.
 */
const SURFACES: readonly { name: string; draw: () => ReactElement }[] = [
  { name: 'actions', draw: () => <ActionsScreen kase={campaignCase} specs={specsFixture} /> },
  { name: 'entities', draw: () => <EntitiesScreen kase={campaignCase} specs={specsFixture} /> },
  { name: 'evidence', draw: () => <EvidenceScreen kase={campaignCase} specs={specsFixture} /> },
  { name: 'impact', draw: () => <ImpactScreen kase={campaignCase} specs={specsFixture} /> },
  { name: 'indicators', draw: () => <IndicatorsScreen kase={campaignCase} specs={specsFixture} /> },
  { name: 'picker cases', draw: () => <PickerCasesScreen cases={PICKER_CASES} analyst="r.okonkwo" userMenu={null} onAbout={() => undefined} /> },
  { name: 'picker accounts', draw: () => <PickerAccountsScreen accounts={PICKER_ACCOUNTS} analyst="r.okonkwo" userMenu={null} onAbout={() => undefined} roles={[]} defaultRole="analyst" onCreate={() => undefined} /> },
  { name: 'picker activity', draw: () => <PickerActivityScreen audit={PICKER_AUDIT} now={PICKER_AUDIT_NOW} analyst="r.okonkwo" userMenu={null} onAbout={() => undefined} /> },
]

describe.each(SURFACES)('$name', ({ draw }) => {
  /**
   * Two chips on, one token off, and the table left where the survivor alone
   * puts it.
   *
   * The two chips are the first and the last the popover offers, so they land
   * in different dimensions wherever a screen has more than one - which is the
   * harder case, since a removal that resets a whole dimension passes a
   * same-dimension check.
   */
  it('drops one filter and keeps the other', async () => {
    const user = userEvent.setup()

    render(draw())
    await openFilters(user)
    const offered = chipNames()
    expect(offered.length, 'this screen offers no filter chips').toBeGreaterThan(1)
    const [first] = offered
    const last = offered[offered.length - 1]
    if (first === undefined || last === undefined) throw new Error('no chips')

    // What the survivor alone leaves, measured before the pair is ever on.
    await pressChip(user, last)
    await user.keyboard('{Escape}')
    const aloneRows = rows()
    const aloneTokens = tokenLabels()
    cleanup()

    render(draw())
    await openFilters(user)
    await pressChip(user, first)
    await pressChip(user, last)
    await user.keyboard('{Escape}')

    const both = tokenLabels()
    expect(both.length, 'two filters are on, so two tokens are owed').toBe(2)

    // The one the survivor is not, read off the pair rather than off a
    // position: the order tokens are drawn in is the block's business.
    const doomed = both.find((one) => !aloneTokens.includes(one))
    if (doomed === undefined) throw new Error('the two chips produced the same token')

    await removeToken(user, doomed)

    expect(tokenLabels()).toEqual(aloneTokens)
    expect(rows(), 'the surviving filter stopped narrowing the table').toBe(aloneRows)
  })

  /** `Clear` is still the way out when none of the survivors is wanted. */
  it('still clears every filter at once', async () => {
    const user = userEvent.setup()

    render(draw())
    // Waits: `evidence` reads its register through `useAsyncList`, so counting
    // rows on the first frame counts the loading state as an empty table.
    await screen.findAllByRole('row')
    const before = rows()
    await openFilters(user)
    const offered = chipNames()
    const [first] = offered
    if (first === undefined) throw new Error('no chips')
    await pressChip(user, first)
    await user.keyboard('{Escape}')

    await user.click(screen.getByRole('button', { name: 'Clear' }))

    expect(tokenLabels()).toEqual([])
    expect(rows()).toBe(before)
  })
})

/**
 * The search box is deliberately not a token.
 *
 * It draws its own clear inside the box and shows its own value, so a token
 * for it would be a second control emptying a control already on screen.
 */
it('gives the search box no token of its own', async () => {
  const user = userEvent.setup()
  render(<ActionsScreen kase={campaignCase} specs={specsFixture} />)

  await user.type(screen.getByRole('textbox', { name: 'Task contains' }), 'isolate')

  expect(tokenLabels()).toEqual([])
  expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument()
})

/**
 * A dimension behind a picker owes a token exactly as a chip does - more so,
 * since its values are two clicks from being read at all.
 */
it('tokenises a value chosen inside a picker', async () => {
  const user = userEvent.setup()
  render(<ImpactScreen kase={campaignCase} specs={specsFixture} />)

  await user.click(screen.getByRole('button', { name: 'Filters' }))
  await user.click(screen.getByRole('button', { name: /Category/ }))
  const pane = screen.getByRole('dialog')
  const row = within(pane).getAllByRole('checkbox')[0]
  if (row === undefined) throw new Error('the category picker offered nothing')
  // The name is on the row, not on the box inside it.
  const chosen = (row.closest('label') ?? row).textContent.replace(/\d+$/, '').trim()
  await user.click(row)
  await user.keyboard('{Escape}')
  await user.keyboard('{Escape}')

  expect(tokenLabels()).toContain(chosen)
})
