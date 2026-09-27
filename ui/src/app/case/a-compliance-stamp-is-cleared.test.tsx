/**
 * A GDPR stamp is cleared by emptying it, and the record takes the clear.
 *
 * The attack is the value the control posts for a pair nobody filled in.
 * `''` looks like an empty field and is refused by the column, which stores a
 * timestamp or `null` -- so an analyst who recorded the wrong awareness time
 * could not take it back. -> #829
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { campaignCase } from '@/fixtures/campaign'
import { campaignCompliance } from '@/fixtures/compliance'
import { regimesFixture } from '@/fixtures/regimes'
import { specsFixture } from '@/fixtures/specs'

import { ComplianceContainer } from './ComplianceContainer'

const record = { ...campaignCompliance, gdprAwareAt: '2026-08-01T10:00:00Z' }

const mutateAsync = vi.fn().mockResolvedValue({})

vi.mock('@/api/compliance', () => ({
  useComplianceRecord: () => ({ data: record, isPending: false, error: null, refetch: vi.fn() }),
  useComplianceMutation: () => ({ mutateAsync }),
  useCaseCompliance: () => ({ data: undefined }),
}))
vi.mock('@/api/regimes', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  useRegimes: () => ({ data: regimesFixture, isPending: false, refetch: vi.fn() }),
}))
vi.mock('@/api/specs', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  useSpecs: () => ({ data: specsFixture, isPending: false, refetch: vi.fn() }),
}))
vi.mock('@/app/useCaseId', () => ({ useCaseId: () => campaignCase.id }))

beforeEach(() => {
  mutateAsync.mockClear()
})

describe('a compliance stamp', () => {
  it('is cleared to null when both halves are emptied', async () => {
    render(
      <MemoryRouter>
        <ComplianceContainer />
      </MemoryRouter>,
    )
    // The card draws its fields only while it is open, and which card opens is
    // the screen's own reading of what is unanswered. `data-fold` is the
    // handle `FormSection` puts there for exactly this.
    const fold = document.querySelector<HTMLElement>('[data-fold="GDPR"]')
    if (fold?.getAttribute('aria-expanded') === 'false') await userEvent.click(fold)

    await userEvent.clear(screen.getByLabelText('Became aware date'))
    await userEvent.clear(screen.getByLabelText('Became aware time'))

    expect(mutateAsync).toHaveBeenCalledExactlyOnceWith({
      version: record.version,
      fields: { gdprAwareAt: null },
    })
  })
})
