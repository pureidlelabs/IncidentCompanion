/**
 * A refused compliance answer reaches the analyst as the merge review, the same
 * way a refused case field does. -> #1110
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/api/client'
import { campaignCase } from '@/fixtures/campaign'
import { campaignCompliance } from '@/fixtures/compliance'
import { regimesFixture } from '@/fixtures/regimes'
import { specsFixture } from '@/fixtures/specs'

const HOLDER = 'Nadia Okonjo'

const refused = vi
  .fn()
  .mockRejectedValue(new ApiError(409, 'Someone else wrote this first.', { heldBy: HOLDER }))

vi.mock('@/api/compliance', () => ({
  useComplianceRecord: () => ({
    data: { ...campaignCompliance, gdprAwareAt: '2026-08-01T10:00:00Z' },
    isPending: false,
    error: null,
    refetch: vi.fn(),
  }),
  useComplianceMutation: () => ({ mutateAsync: refused }),
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

const { ComplianceContainer } = await import('./ComplianceContainer')

describe('a compliance answer another analyst wrote first', () => {
  it('draws the merge review naming the field and who wrote it', async () => {
    render(
      <MemoryRouter>
        <ComplianceContainer />
      </MemoryRouter>,
    )
    const fold = document.querySelector<HTMLElement>('[data-fold="GDPR"]')
    if (fold?.getAttribute('aria-expanded') === 'false') await userEvent.click(fold)

    await userEvent.clear(screen.getByLabelText('Became aware date'))
    await userEvent.clear(screen.getByLabelText('Became aware time'))

    expect(refused).toHaveBeenCalled()
    expect(await screen.findByText(/was not saved/)).toBeInTheDocument()
    expect(screen.getByText(new RegExp(HOLDER))).toBeInTheDocument()
  })
})
