/**
 * The chip a reference field draws when the section that opened the dialog
 * forgot to pass its options.
 *
 * `EntityDialog` cannot tell "no rows yet" from "no map at all" unless the
 * section hands over an entry for every collection its form can reference, so
 * a `references` object built by hand collapses the moment a form gains a
 * reference the hand-written map has no key for. Attacked here by opening the
 * edit dialog on a fixture row whose reference actually resolves and checking
 * the control shows the record's name rather than "(missing reference)" --
 * and, for the field whose fixture value is empty, that the dialog never had
 * to guess because a map was still supplied.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { MockInstance } from 'vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

import { EntitiesScreen } from './entities'
import { EvidenceScreen } from './evidence'
import { ImpactScreen } from './impact'

let errors: MockInstance<typeof console.error>

beforeEach(() => {
  errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  errors.mockRestore()
})

describe('the evidence dialog', () => {
  it('resolves the method a record was collected by, instead of reading (missing reference)', async () => {
    const user = userEvent.setup()
    render(<EvidenceScreen kase={campaignCase} specs={specsFixture} />)
    await screen.findAllByRole('row')

    const withMethod = campaignCase.evidence.find((row) => row.methodId)
    if (!withMethod) throw new Error('the campaign fixture holds no evidence with a method')
    const method = campaignCase.methods.find((row) => row.id === withMethod.methodId)
    if (!method) throw new Error('the campaign fixture is missing the method it points at')

    await user.click(screen.getByRole('button', { name: `Edit ${withMethod.name} in full` }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Choose Collected by method' }))
    const field = within(dialog).getByRole('combobox', { name: 'Collected by method' })
    expect(field).toHaveValue(method.name)
    expect(field).not.toHaveValue(expect.stringContaining('missing reference'))

    // The absent-map warning fires on the collection key, not the chosen
    // value - so the guard the fix relies on is asserted directly.
    expect(errors).not.toHaveBeenCalledWith(expect.stringContaining('methods'))
  })
})

describe('the impact dialog', () => {
  it('resolves the evidence naming a record, instead of reading (missing reference)', async () => {
    const user = userEvent.setup()
    render(<ImpactScreen kase={campaignCase} specs={specsFixture} />)

    const withEvidence = campaignCase.impact.find((row) => row.evidenceIds.length > 0)
    if (!withEvidence) throw new Error('the campaign fixture holds no impact record with evidence')
    const evidence = campaignCase.evidence.find((row) => row.id === withEvidence.evidenceIds[0])
    if (!evidence) throw new Error('the campaign fixture is missing the evidence it points at')

    await user.click(screen.getByRole('button', { name: `Edit ${withEvidence.label} in full` }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /^Evidence/ }))
    const chips = within(dialog).getByRole('grid', { name: 'Chosen Evidence' })
    expect(within(chips).getByText(evidence.name)).toBeInTheDocument()
    expect(within(chips).queryByText(/missing reference/)).not.toBeInTheDocument()

    // `methodIds` has no fixture value to resolve, so the only observable
    // proof the section passed a map at all is that the guard stays silent.
    expect(errors).not.toHaveBeenCalledWith(expect.stringContaining('evidence'))
    expect(errors).not.toHaveBeenCalledWith(expect.stringContaining('methods'))
  })
})

describe('the assets dialog', () => {
  it('resolves the method an asset was found by, instead of reading (missing reference)', async () => {
    const user = userEvent.setup()
    render(<EntitiesScreen kase={campaignCase} specs={specsFixture} scope="assets" />)

    const withMethod = campaignCase.systems.find((row) => row.methodId)
    if (!withMethod) throw new Error('the campaign fixture holds no system with a method')
    const method = campaignCase.methods.find((row) => row.id === withMethod.methodId)
    if (!method) throw new Error('the campaign fixture is missing the method it points at')

    await user.click(screen.getByRole('button', { name: `Edit ${withMethod.hostname} in full` }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /^Found by/ }))
    const field = within(dialog).getByRole('combobox', { name: 'Found by' })
    expect(field).toHaveValue(method.name)
    expect(field).not.toHaveValue(expect.stringContaining('missing reference'))

    expect(errors).not.toHaveBeenCalledWith(expect.stringContaining('methods'))
  })
})
