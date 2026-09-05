/**
 * The doors the entity screens draw, pressed.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

import { ActionsScreen } from './actions'
import { EntitiesScreen } from './entities'
import { EvidenceScreen } from './evidence'
import { ImpactScreen } from './impact'

/** The open dialog, or a failure naming what was drawn instead. */
function dialog(): HTMLElement {
  return screen.getByRole('dialog')
}

/**
 * The dialog, asserted by its own accessible name.
 */
function namedDialog(title: string): HTMLElement {
  return screen.getByRole('dialog', { name: title })
}

describe('the add door', () => {
  it.each([
    { name: 'actions', draw: () => <ActionsScreen kase={campaignCase} specs={specsFixture} />, label: 'Add task', title: 'Add task' },
    { name: 'evidence', draw: () => <EvidenceScreen kase={campaignCase} specs={specsFixture} />, label: 'Add record', title: 'Add record' },
    { name: 'impact', draw: () => <ImpactScreen kase={campaignCase} specs={specsFixture} />, label: 'Add record', title: 'Add record' },
    {
      name: 'entities, scoped',
      draw: () => <EntitiesScreen kase={campaignCase} specs={specsFixture} scope="assets" />,
      label: 'Add asset',
      title: 'Add asset',
    },
  ])('$name opens its creation dialog', async ({ draw, label, title }) => {
    const user = userEvent.setup()
    render(draw())
    expect(screen.queryByRole('dialog')).toBeNull()

    await user.click(screen.getByRole('button', { name: label }))
    expect(namedDialog(title)).toBeInTheDocument()
  })

  /**
   * Five kinds have no one form, so the unscoped door names the kind before it
   * opens anything.
   */
  it('names the kind by menu at the unscoped entity view', async () => {
    const user = userEvent.setup()
    render(<EntitiesScreen kase={campaignCase} specs={specsFixture} scope="all" />)

    // **The menu half of the split, not the button half.** The button adds the
    // first kind in one press; the kinds are behind the trigger beside it.
    await user.click(screen.getByRole('button', { name: 'Add another kind' }))
    expect(screen.getAllByRole('menuitem').length).toBeGreaterThan(1)
  })
})

describe('what the dialog saves', () => {
  it('puts the new task in the table', async () => {
    const user = userEvent.setup()
    render(<ActionsScreen kase={campaignCase} specs={specsFixture} />)
    const wording = 'Revoke the service principal'
    expect(screen.queryByText(wording)).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Add task' }))
    await user.type(within(dialog()).getByLabelText('Task'), wording)
    await user.click(within(dialog()).getByRole('button', { name: 'Create' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText(wording)).toBeVisible()
  })

  it('leaves the table alone when the dialog is cancelled', async () => {
    const user = userEvent.setup()
    render(<ActionsScreen kase={campaignCase} specs={specsFixture} />)
    const before = screen.getAllByRole('row').length

    await user.click(screen.getByRole('button', { name: 'Add task' }))
    await user.type(within(dialog()).getByLabelText('Task'), 'Never saved')
    await user.click(within(dialog()).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByText('Never saved')).toBeNull()
    expect(screen.getAllByRole('row')).toHaveLength(before)
  })
})

describe("the row's pencil", () => {
  it.each([
    { name: 'actions', draw: () => <ActionsScreen kase={campaignCase} specs={specsFixture} />, title: 'Edit task' },
    { name: 'evidence', draw: () => <EvidenceScreen kase={campaignCase} specs={specsFixture} />, title: 'Edit record' },
    { name: 'impact', draw: () => <ImpactScreen kase={campaignCase} specs={specsFixture} />, title: 'Edit record' },
    { name: 'entities', draw: () => <EntitiesScreen kase={campaignCase} specs={specsFixture} scope="assets" />, title: 'Edit asset' },
  ])('$name draws one, and it opens the row', async ({ draw, title }) => {
    const user = userEvent.setup()
    render(draw())

    // Waits: `evidence` reads its register through `useAsyncList`, so the
    // first frame has no rows and therefore no row controls.
    const pencils = await screen.findAllByRole('button', { name: /^Edit / })
    expect(pencils.length).toBeGreaterThan(0)
    await user.click(pencils[0]!)
    expect(namedDialog(title)).toBeInTheDocument()
  })
})
