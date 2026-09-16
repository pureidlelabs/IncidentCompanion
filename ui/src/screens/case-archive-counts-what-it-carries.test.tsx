/**
 * **The figure on the archive screen counts every table the archive carries.**
 *
 * No route serves an archive inventory, so the screen sums the case document it
 * already holds -- and it summed a hand-written list of tables that had fallen
 * one behind. `methods` was missing, so a case was offered for export under a
 * count short by however many methods it held, and the file it produced carried
 * rows the screen had not mentioned. -> #809
 *
 * **Counted against the collections the app already names**, not against a
 * number written here: a fixture's total is one more thing to correct when the
 * fixture grows, and it would agree with a screen that dropped a table on the
 * day somebody changed both.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { COLLECTION_NAMES, COLLECTION_TO_CASE_KEY } from '@/api/model'
import { campaignCase } from '@/fixtures/campaign'

import { CaseArchiveScreen } from './case-archive'

/** Every row the archive carries, from the roster the app publishes. */
function carried(): number {
  return COLLECTION_NAMES.reduce((total, name) => {
    const rows = campaignCase[COLLECTION_TO_CASE_KEY[name]]
    return total + (Array.isArray(rows) ? rows.length : 0)
  }, 0)
}

describe('the case archive screen', () => {
  it('counts every collection the archive carries', () => {
    render(<CaseArchiveScreen kase={campaignCase} />)

    expect(screen.getByText(`${String(carried())} entries`)).toBeInTheDocument()
  })

  /**
   * The case this is written against: the fixture holds methods, so a screen
   * counting every table but that one reads short rather than reading zero.
   */
  it('has a fixture whose methods would be missed', () => {
    expect(campaignCase.methods.length).toBeGreaterThan(0)
  })
})
