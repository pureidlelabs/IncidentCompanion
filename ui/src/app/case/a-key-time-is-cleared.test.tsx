/**
 * Emptying a key time clears it, and half of one is not a write at all.
 *
 * The attack is the pair of states the control collapsed into `''`: a stamp
 * the analyst has emptied on purpose, which is a write of `null`, and a date
 * typed with the time still blank, which is nothing yet. -> #829
 *
 * The third case is the fix that passes for the wrong reason: a control that
 * reported `null` for anything incomplete would clear the stamp the analyst
 * was part-way through retyping.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { campaignCase } from '@/fixtures/campaign'
import { campaignCompliance } from '@/fixtures/compliance'
import { specsFixture } from '@/fixtures/specs'

import { OverviewContainer } from './OverviewContainer'

// `detectedAt` is the set stamp and `containedAt` the empty one, so one case
// answers both halves of the question.
const kase = { ...campaignCase, detectedAt: '2026-08-01T10:00:00Z' }

const mutateAsync = vi.fn().mockResolvedValue({ caseId: campaignCase.id })

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

async function keyTimes(): Promise<void> {
  render(
    <MemoryRouter>
      <OverviewContainer />
    </MemoryRouter>,
  )
  await userEvent.click(screen.getByRole('tab', { name: 'Key times' }))
}

beforeEach(() => {
  mutateAsync.mockClear()
})

describe('a key time', () => {
  it('is cleared to null when both halves are emptied', async () => {
    await keyTimes()

    await userEvent.clear(screen.getByLabelText('Detected at date'))
    await userEvent.clear(screen.getByLabelText('Detected at time'))
    // The form writes on blur, so the analyst has to leave the control.
    await userEvent.tab()

    // Once, and with the clear in it: emptying the date half crosses a blur of
    // its own, and a write per half would send the refused `''` first.
    expect(mutateAsync).toHaveBeenCalledExactlyOnceWith({
      version: kase.version,
      fields: { detectedAt: null },
    })
  })

  it('sends nothing for a date with no time', async () => {
    // An unset stamp is served as `null`, and this measures a partial only
    // while it is: an omitted key agrees with the draft for a second reason.
    expect(kase.containedAt, 'the fixture stopped serving an empty stamp').toBeNull()
    await keyTimes()

    await userEvent.type(screen.getByLabelText('Contained at date'), '2026-08-20')
    await userEvent.tab()
    await userEvent.tab()

    expect(mutateAsync).not.toHaveBeenCalled()
    // The refusal the analyst used to get, and the note they get instead.
    expect(screen.getByText('Add the time to save this.')).toBeInTheDocument()
  })

  it('sends the stamp once the time completes it', async () => {
    await keyTimes()

    await userEvent.type(screen.getByLabelText('Contained at date'), '2026-08-20')
    await userEvent.type(screen.getByLabelText('Contained at time'), '19:57')
    await userEvent.tab()

    expect(mutateAsync).toHaveBeenCalledWith({
      version: kase.version,
      fields: { containedAt: '2026-08-20T19:57:00Z' },
    })
  })
})
