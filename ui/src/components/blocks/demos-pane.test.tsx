import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AriaRouter } from '@/components/ui/aria-router'
import { DemosPane } from './demos-pane'

import type { DemoRow } from './picker-rows'

const DEMOS: readonly DemoRow[] = [
  {
    id: 'case-guided',
    reference: 'INC-2026-0001',
    customer: 'Northwind Freight',
    title: 'Guided incident',
    scenario: 'Phishing',
    scale: 'Small',
    glyph: 'play',
    summary: 'One phishing email to a lateral hop.',
  },
  {
    id: 'case-campaign',
    reference: 'INC-2026-0002',
    customer: 'Northwind Freight',
    title: 'Major campaign',
    scenario: 'Ransomware',
    scale: 'Large',
    glyph: 'skull',
    summary: 'Domain-wide ransomware at a real week of volume.',
  },
] as unknown as readonly DemoRow[]

/**
 * A demo card is a door into the seeded case, and the whole pane is doors.
 */
describe('every demo card is a door into its case', () => {
  it('renders one link per demo, not an inert button', () => {
    render(
      <AriaRouter navigate={() => undefined}>
        <DemosPane demos={DEMOS} href={(d) => `/cases/${d.id}/overview`} />
      </AriaRouter>,
    )
    expect(screen.getAllByRole('link')).toHaveLength(2)
  })

  it('points each card at the case the roster gave it', () => {
    render(
      <AriaRouter navigate={() => undefined}>
        <DemosPane demos={DEMOS} href={(d) => `/cases/${d.id}/overview`} />
      </AriaRouter>,
    )
    const href = screen.getByRole('link', { name: /Guided incident/ }).getAttribute('href')
    expect(href).toContain('/cases/case-guided/')
  })

  it('addresses a case by id and never by its human reference', () => {
    render(
      <AriaRouter navigate={() => undefined}>
        <DemosPane demos={DEMOS} href={(d) => `/cases/${d.id}/overview`} />
      </AriaRouter>,
    )
    for (const link of screen.getAllByRole('link')) {
      expect(link.getAttribute('href')).not.toContain('INC-2026')
    }
  })
})
