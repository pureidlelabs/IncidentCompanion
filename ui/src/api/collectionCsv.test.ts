import { describe, expect, it } from 'vitest'

import { collectionCsvHref, collectionCsvName } from './collectionCsv'
import { suggestionsFor } from './suggestions'
import { formSpec } from './specs'
import { specsFixture } from '@/fixtures/specs'
import type { SystemEntry } from './model'

describe('one table exported as CSV', () => {
  it('puts the .csv on the collection segment, where the route mounts it', () => {
    // The route mounts `{collection}.csv`, not `?format=csv` - the
    // Indicators feed is the one route with the query form, and copying it
    // here would 404 against a table called "systems".
    expect(collectionCsvHref('C1', 'network_indicators')).toBe(
      '/api/cases/C1/network_indicators.csv',
    )
    expect(collectionCsvName('C1', 'network_indicators')).toBe('C1-network_indicators.csv')
  })

  it('escapes a case id that would otherwise reshape the path', () => {
    expect(collectionCsvHref('a/b', 'systems')).toBe('/api/cases/a%2Fb/systems.csv')
  })
})

describe('the vocabulary a form takes from the case rather than the spec', () => {
  it('offers each analyst once, and each tag rather than each tag line', () => {
    const form = formSpec<SystemEntry>(specsFixture, 'SYSTEM_FIELDS')
    const rows = [
      { analyst: 'Kim', tags: 'phishing, exfil' },
      { analyst: 'Kim', tags: 'phishing' },
      { analyst: 'Alex', tags: '' },
    ] as SystemEntry[]

    expect(suggestionsFor(form, rows)).toEqual({
      analyst: ['Alex', 'Kim'],
      tags: ['exfil', 'phishing'],
    })
  })
})
