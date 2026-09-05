/**
 * The way back from an indicator to the row it was derived from.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { sectionPathFor } from '@/api/entityTargets'
import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

import { IndicatorsScreen } from './indicators'

/** Each source, and where `entityTargets` says its section lives. */
const SOURCES = [
  ['Network', 'network'],
  ['Malware', 'malware'],
  ['Cloud Apps', 'cloud_app'],
] as const

describe('an indicator leads back to what it came from', () => {
  it.each(SOURCES)('links %s at the section that holds it', (label, target) => {
    render(<IndicatorsScreen kase={campaignCase} specs={specsFixture} />)

    const link = screen.getByRole('link', { name: label })
    expect(link.getAttribute('href')).toBe(sectionPathFor(campaignCase.id, target))
  })

  /** Three that all point at one section is what a copied block looks like. */
  it('sends the three of them to three different places', () => {
    render(<IndicatorsScreen kase={campaignCase} specs={specsFixture} />)

    const targets = SOURCES.map(
      ([label]) => screen.getByRole('link', { name: label }).getAttribute('href') ?? '',
    )
    expect(new Set(targets).size, 'two of the source links go to the same section').toBe(3)
    for (const href of targets) {
      expect(href, 'a source link that names no case').toContain(campaignCase.id)
    }
  })
})
