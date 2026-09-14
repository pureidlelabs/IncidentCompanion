/**
 * **A size an operator may set fits the column that records it.**
 *
 * `evidence.attachmentMegabytes` is a setting with a ceiling, and the bytes it
 * admits land in `evidence.size_bytes`. The two are a pair and nothing held
 * them together: raising the ceiling past what the column takes turns an
 * upload into a database write error, which reaches the analyst as a failed
 * attach rather than as a refusal naming a limit. -> #565
 *
 * **The relationship, not either number.** Widening the column is as good an
 * answer as leaving the ceiling where it is, and a case pinning `int4` would
 * refuse the widening.
 */
import { getTableColumns } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { EVIDENCE_CEILING_MEGABYTES } from './keys.js'
import { evidence } from '../db/schema/entities.js'

/**
 * What each column type holds, as a count of bytes.
 *
 * `PgBigInt53` is `bigint` read as a JavaScript number, so what bounds it is
 * the float's exact-integer range rather than the column's.
 */
const HOLDS: Record<string, number> = {
  PgInteger: 2 ** 31 - 1,
  PgBigInt53: Number.MAX_SAFE_INTEGER,
}

describe('a size an operator may set', () => {
  it('fits the column that records it', () => {
    const column = getTableColumns(evidence).sizeBytes
    const holds = HOLDS[column.columnType]

    expect(holds, `no bound is recorded for ${column.columnType}`).toBeDefined()
    expect(
      EVIDENCE_CEILING_MEGABYTES * 1024 * 1024,
      'an operator can set an attachment limit larger than the column that records the size, ' +
        'so an upload at that limit fails as a database error rather than a stated refusal',
    ).toBeLessThanOrEqual(holds!)
  })
})
