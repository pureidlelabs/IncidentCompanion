/**
 * A refused case write reaches the analyst as the merge review, not as a toast
 * that scrolls away. -> #1110
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import type * as CaseApi from '@/api/case'
import type * as SpecsApi from '@/api/specs'
import { ApiError } from '@/api/client'
import { casePath } from '@/components/blocks/case-paths'
import { campaignCase } from '@/fixtures/campaign'
import { campaignCompliance } from '@/fixtures/compliance'
import { specsFixture } from '@/fixtures/specs'

const HOLDER = 'Nadia Okonjo'

const refused = vi
  .fn()
  .mockRejectedValue(new ApiError(409, 'Someone else wrote this first.', { heldBy: HOLDER }))

vi.mock('@/api/case', async (importOriginal) => ({
  ...(await importOriginal<typeof CaseApi>()),
  useCase: () => ({ data: campaignCase, isPending: false, error: null, refetch: vi.fn() }),
}))
vi.mock('@/api/compliance', () => ({ useComplianceRecord: () => ({ data: campaignCompliance }) }))
vi.mock('@/api/useCaseMutation', () => ({ useCaseMutation: () => ({ mutateAsync: refused }) }))
vi.mock('@/app/useCaseId', () => ({ useCaseId: () => campaignCase.id }))
vi.mock('@/api/specs', async (importOriginal) => ({
  ...(await importOriginal<typeof SpecsApi>()),
  useSpecs: () => ({ data: specsFixture, isPending: false }),
}))

const { OverviewContainer } = await import('./OverviewContainer')

describe('a case field another analyst wrote first', () => {
  it('draws the merge review naming the field and who wrote it', async () => {
    const user = userEvent.setup()
    const router = createMemoryRouter(
      [{ path: '/cases/:caseId/:section', element: <OverviewContainer /> }],
      { initialEntries: [casePath(campaignCase.id, 'overview')] },
    )
    render(<RouterProvider router={router} />)

    await user.click(screen.getByRole('tab', { name: 'Properties' }))
    const customer = screen.getByRole('textbox', { name: 'Customer' })
    await user.clear(customer)
    await user.type(customer, 'Northwind Freight')
    // The write leaves on blur.
    await user.tab()

    expect(refused).toHaveBeenCalled()
    const band = await screen.findByText('Customer was not saved')
    expect(band).toBeInTheDocument()
    expect(screen.getByText(new RegExp(HOLDER))).toBeInTheDocument()
  })
})
