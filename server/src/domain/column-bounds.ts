/**
 * What a whole number may be before the column it is heading for cannot hold
 * it, in one declarative place.
 *
 * Every counted thing in this schema is a Postgres `integer`, which is four
 * bytes and signed. A request carrying more than that reaches the driver and
 * comes back as a query error naming columns, rather than as a refusal naming
 * the field -- the door having checked that the number is a whole one and not
 * that it is a number this database can store.
 *
 * **Stated here rather than beside the column**, because the guards are
 * schemas and `domain/` may import nothing: `db/` cannot reach this file and
 * this file cannot reach `db/`. `column-bounds.test.ts` is what holds the two
 * together, by asking the schema what type each column actually is.
 */
import { z } from 'zod'

/** The largest value a signed four-byte integer column holds. */
export const INT4_MAX = 2_147_483_647

/**
 * A row version as a caller presents it.
 *
 * **Zero is allowed and is not a mistake.** A caller checking whether its read
 * is stale presents the version it holds minus one, which is 0 for a row still
 * at its first -- an honest number that matches no row, and the answer it is
 * owed is the conflict every other stale version gets rather than a complaint
 * about its shape. -> `collections/two-doors-agree.test.ts`
 */
export const rowVersion = (): z.ZodNumber => z.int().min(0).max(INT4_MAX)

/** A count of something, where nothing is a legitimate answer. */
export const countingNumber = (): z.ZodNumber => z.int().min(0).max(INT4_MAX)
