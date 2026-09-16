/**
 * The overview's day number and its statutory clocks are read at the moment
 * the app is running, not at one written into the screen.
 *
 * The attack is the reading that never moves: a screen holding its own default
 * `now` and a container passing none renders the same day for ever.
 *
 * The last claim is `tsc`'s rather than vitest's - a `@ts-expect-error` that
 * stops erroring is itself an error, so a default put back turns the typecheck
 * red.
 */
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { campaignCase } from '@/fixtures/campaign'
import { campaignCompliance } from '@/fixtures/compliance'
import { specsFixture } from '@/fixtures/specs'
import { OverviewScreen } from '@/screens/overview'

import { OverviewContainer } from './OverviewContainer'

const NOW = Date.parse('2026-09-16T09:00:00.000Z')
const MS_PER_DAY = 86_400_000
const OPEN_DAYS = 7

const kase = {
  ...campaignCase,
  detectedAt: new Date(NOW - OPEN_DAYS * MS_PER_DAY).toISOString(),
}
const record = {
  ...campaignCompliance,
  gdprAwareAt: new Date(NOW - 24 * 3_600_000).toISOString(),
}

vi.mock('@/api/case', () => ({
  useCase: () => ({ data: kase, isPending: false, error: null, refetch: vi.fn() }),
}))
vi.mock('@/api/compliance', () => ({ useComplianceRecord: () => ({ data: record }) }))
vi.mock('@/api/useCaseMutation', () => ({
  useCaseMutation: () => ({ mutateAsync: vi.fn() }),
}))
vi.mock('@/app/useCaseId', () => ({ useCaseId: () => campaignCase.id }))
vi.mock('@/api/specs', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  useSpecs: () => ({ data: specsFixture, isPending: false }),
}))

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the overview reads the clock', () => {
  it('numbers the day from the moment the app is running', () => {
    render(
      <MemoryRouter>
        <OverviewContainer />
      </MemoryRouter>,
    )

    expect(screen.getByText(new RegExp(`day ${String(OPEN_DAYS + 1)}\\b`))).toBeInTheDocument()
  })

  it('counts the Article 33 window from the same moment', () => {
    render(
      <MemoryRouter>
        <OverviewContainer />
      </MemoryRouter>,
    )

    expect(screen.getByText('+48:00')).toBeInTheDocument()
  })

  it('refuses a screen drawn with no moment', () => {
    render(
      // @ts-expect-error `now` is the caller's to supply -- a default here is
      // the constant every install would read.
      <OverviewScreen kase={kase} specs={specsFixture} record={record} />,
    )

    expect(screen.getByRole('heading', { name: 'Case overview' })).toBeInTheDocument()
  })
})
