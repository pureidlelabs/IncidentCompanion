/**
 * The search badge names a column the table actually draws.
 */
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ReactElement } from 'react'

import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

import { ActionsScreen } from './actions'
import { EntitiesScreen } from './entities'
import { EvidenceScreen } from './evidence'
import { ImpactScreen } from './impact'
import { IndicatorsScreen } from './indicators'

/** The headings the table is drawing, as the analyst reads them. */
async function headings(): Promise<string[]> {
  // **Waits, because a screen loads.** `evidence` reads its register through
  // `useAsyncList`, so the first frame draws no grid at all.
  return (await screen.findAllByRole('columnheader'))
    .map((cell) => cell.textContent.trim())
    .filter(Boolean)
}

/** The badge in front of the search box, which is what `searchColumn` sets. */
function badge(): string {
  const box = screen.getByRole('textbox', { name: /contains$/ })
  const name = box.getAttribute('aria-label') ?? ''
  return name.replace(/ contains$/, '')
}

const NAMED: readonly { name: string; draw: () => ReactElement }[] = [
  { name: 'actions', draw: () => <ActionsScreen kase={campaignCase} specs={specsFixture} /> },
  { name: 'evidence', draw: () => <EvidenceScreen kase={campaignCase} specs={specsFixture} /> },
  { name: 'impact', draw: () => <ImpactScreen kase={campaignCase} specs={specsFixture} /> },
  { name: 'indicators', draw: () => <IndicatorsScreen kase={campaignCase} specs={specsFixture} /> },
]

describe.each(NAMED)('$name', ({ draw }) => {
  it('names a column the table draws', async () => {
    render(draw())
    // `startsWith`, because a heading carries its sort control's text too.
    expect((await headings()).some((one) => one.startsWith(badge()))).toBe(true)
  })
})

it('leaves the entity badge naming the row, because no one column is true', () => {
  render(<EntitiesScreen kase={campaignCase} specs={specsFixture} />)

  expect(badge()).toBe('Entity')

  const grid = screen.getAllByRole('grid')[0]
  if (grid === undefined) throw new Error('the entity table did not render')
  expect(
    within(grid)
      .getAllByRole('columnheader')
      .map((cell) => cell.textContent.trim()),
  ).not.toContain('Entity')
})
