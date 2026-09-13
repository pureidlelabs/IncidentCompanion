/**
 * **The column holds whatever an operator is allowed to accept.**
 *
 * The attachment ceiling is a setting, bounded by `EVIDENCE_CEILING_MEGABYTES`,
 * and the column recording the size is a different statement of the same
 * limit. Where the column is the smaller of the two, an install that raised the
 * setting takes the upload, hashes it, writes the bytes, and fails at the
 * insert -- so the artefact is on disk and the case does not know about it.
 *
 * Asserted in bytes against the type's own range rather than by attaching
 * something enormous: the failure is a property of the two numbers, and a test
 * that moved eight gigabytes to prove it would be the slowest in the tier.
 *
 * What no case here covers is the write itself. `store.ts` refuses past the
 * live setting long before the column is reached; this is about the case where
 * the setting is legitimately larger.
 */
import { getTableColumns } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { evidence } from '../db/schema/entities.js'
import { FIGURE_CEILING } from '../db/schema/columns.js'
import { EVIDENCE_CEILING_MEGABYTES } from '../policy/keys.js'

/** What an operator may set the attachment ceiling to, in bytes. */
const MOST_AN_OPERATOR_MAY_ALLOW = EVIDENCE_CEILING_MEGABYTES * 1024 * 1024

/** The narrower of the two type ceilings, and the one being ruled out. */
const INT4_CEILING = 2_147_483_647

describe('the column that records an attachment size', () => {
  it('is not the narrower of the two limits', () => {
    expect(
      MOST_AN_OPERATOR_MAY_ALLOW,
      'the operator ceiling now fits int4, so this case no longer says anything',
    ).toBeGreaterThan(INT4_CEILING)

    const column = getTableColumns(evidence).sizeBytes
    expect(column.getSQLType(), 'an attachment the install accepts would not insert').toBe('bigint')
  })

  it('is read as a number the install can still carry', () => {
    expect(
      MOST_AN_OPERATOR_MAY_ALLOW,
      'the operator ceiling is past what a JavaScript number carries exactly',
    ).toBeLessThanOrEqual(FIGURE_CEILING)
  })
})
