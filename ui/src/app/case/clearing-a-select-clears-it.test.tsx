/**
 * Clearing a nullable select writes the clear.
 *
 * The attack is a clear that reads as no change: the blank row is not a member
 * of any vocabulary, so whatever it puts in the draft has to be the one value
 * a PATCH reads as "set this to nothing". `undefined` and `''` both look right
 * on screen -- the trigger draws the placeholder either way -- and the first is
 * dropped by `JSON.stringify` while the second is refused by the enum.
 *
 * The second assertion is the fix that passes for the wrong reason: a change
 * handler sending `null` for every field would clear the select and wipe the
 * rest of the record with it.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CAMPAIGN_NOW, campaignCase } from '@/fixtures/campaign'
import { campaignCompliance } from '@/fixtures/compliance'
import { specsFixture } from '@/fixtures/specs'
import { pickFromSelect, selectTrigger } from '@/test/select'

import { OverviewContainer } from './OverviewContainer'

const kase = { ...campaignCase, severity: 'medium', incidentClass: 'hacking' }

const mutateAsync = vi.fn().mockResolvedValue({ caseId: campaignCase.id })

beforeEach(() => {
  mutateAsync.mockClear()
})

vi.mock('@/api/case', () => ({
  useCase: () => ({ data: kase, isPending: false, error: null, refetch: vi.fn() }),
}))
vi.mock('@/api/compliance', () => ({ useComplianceRecord: () => ({ data: campaignCompliance }) }))
vi.mock('@/api/useCaseMutation', () => ({ useCaseMutation: () => ({ mutateAsync }) }))
vi.mock('@/app/useCaseId', () => ({ useCaseId: () => campaignCase.id }))
vi.mock('@/api/specs', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  useSpecs: () => ({ data: specsFixture, isPending: false }),
}))

vi.spyOn(Date, 'now').mockReturnValue(CAMPAIGN_NOW)

async function properties(): Promise<void> {
  render(
    <MemoryRouter>
      <OverviewContainer />
    </MemoryRouter>,
  )
  await userEvent.click(screen.getByRole('tab', { name: 'Properties' }))
}

async function clear(label: string): Promise<void> {
  await properties()
  await pickFromSelect(label, '')
  // The form writes on blur, so the analyst has to leave the control.
  await userEvent.tab()
}

describe('clearing a select', () => {
  it.each([
    ['Severity', 'severity'],
    ['Incident class', 'incidentClass'],
  ])('sends %s as null', async (label, name) => {
    await clear(label)

    expect(mutateAsync).toHaveBeenCalledWith({ version: kase.version, fields: { [name]: null } })
  })

  it('names no field the analyst did not touch', async () => {
    await clear('Severity')

    const [write] = mutateAsync.mock.calls.at(-1) as [{ fields: Record<string, unknown> }]
    expect(Object.keys(write.fields)).toEqual(['severity'])
  })

  /**
   * **Status defaults to `respond`, so it has no empty.** Offering the row
   * anyway gives the analyst a `-` that writes `respond` -- a live case
   * silently reopened by a control that reads as clearing one. The column
   * serves no blank, so the row is not drawn and nothing can be posted.
   */
  it('is not offered for a column whose every value is an answer', async () => {
    await properties()
    await userEvent.click(selectTrigger('Status'))
    await screen.findByRole('listbox')

    expect(document.querySelector('[role="option"][data-value=""]')).toBeNull()
    expect(mutateAsync).not.toHaveBeenCalled()
  })
})
