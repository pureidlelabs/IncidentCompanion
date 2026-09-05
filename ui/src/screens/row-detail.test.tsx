/**
 * The expanded row on Actions and Evidence, and what it may hold.
 *
 * What this cannot see is whether the control is *visible*: jsdom has no CSS,
 * and the cluster it sits in is revealed on hover. That half is `e2e/visual`'s.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

import { ActionsScreen } from './actions'
import { EntitiesScreen } from './entities'
import { EvidenceScreen } from './evidence'

/** The first row that carries an actions cluster: the head is a row too. */
async function firstActionRow(): Promise<HTMLElement> {
  // **Waits, because a screen loads.** `evidence` reads its register through
  // `useAsyncList`, so the first frame has no rows -- a synchronous query here
  // read the loading state and called it an empty table.
  const rows = await screen.findAllByRole('row')
  const found = rows.find((row) => within(row).queryByRole('button', { name: /in full$/ }))
  if (!found) throw new Error('no row draws an actions cluster')
  return found
}

/** Press *Show detail* on the first row and hand back the panel under it. */
async function openFirstDetail(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
  const row = await firstActionRow()
  const before = screen.getAllByRole('row').length
  await user.click(within(row).getByRole('button', { name: /show detail/i }))

  // A row was added rather than a dialog opened: the detail is a panel under
  // the row, which is what keeps the rest of the table in view.
  const after = screen.getAllByRole('row')
  expect(after.length).toBeGreaterThan(before)
  expect(screen.queryByRole('dialog')).toBeNull()
  return after[after.indexOf(row) + 1]!
}

const SCREENS = [
  ['Actions', () => <ActionsScreen kase={campaignCase} specs={specsFixture} />],
  ['Evidence', () => <EvidenceScreen kase={campaignCase} specs={specsFixture} />],
] as const

describe('a row opens on the two tables that could not', () => {
  it.each(SCREENS)('offers to show the detail on %s', async (name, draw) => {
    render(draw())
    expect(
      within(await firstActionRow()).queryByRole('button', { name: /show detail/i }),
      `${name} draws no way to open a row`,
    ).not.toBeNull()
  })

  it.each(SCREENS)('opens a panel that says something on %s', async (name, draw) => {
    const user = userEvent.setup()
    render(draw())
    const panel = await openFirstDetail(user)
    expect(panel.textContent.trim().length, `${name}'s panel is blank`).toBeGreaterThan(0)
  })

  /**
   * The one that a presence check cannot fail.
   */
  it('carries what the evidence columns have no room for', async () => {
    const user = userEvent.setup()
    render(<EvidenceScreen kase={campaignCase} specs={specsFixture} />)
    const panel = await openFirstDetail(user)
    expect(panel.textContent, 'the panel repeats the columns and nothing else').toContain(
      'patient-zero,kape',
    )
  })
})

/**
 * The bookkeeping, on every table that draws a panel from a stored row.
 */
describe('a panel never draws the storage bookkeeping', () => {
  const PANELS = [
    ['Actions', () => <ActionsScreen kase={campaignCase} specs={specsFixture} />],
    ['Evidence', () => <EvidenceScreen kase={campaignCase} specs={specsFixture} />],
    ['Entities, unscoped', () => <EntitiesScreen kase={campaignCase} specs={specsFixture} scope="all" />],
    ['Entities, one kind', () => <EntitiesScreen kase={campaignCase} specs={specsFixture} scope="accounts" />],
  ] as const

  it.each(PANELS)('keeps version and the timestamps out of %s', async (name, draw) => {
    const user = userEvent.setup()
    render(draw())
    const text = (await openFirstDetail(user)).textContent

    expect(
      {
        version: /version/i.test(text),
        created: /created ?at/i.test(text),
        updated: /updated ?at/i.test(text),
        caseId: /case ?id/i.test(text),
      },
      `${name} draws storage bookkeeping as an incident fact`,
    ).toEqual({ version: false, created: false, updated: false, caseId: false })
  })
})
