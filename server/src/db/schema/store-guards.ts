/**
 * Idempotent statements the Drizzle schema cannot express -- functions,
 * triggers -- applied by `server/scripts/apply-schema.mts` after the tables,
 * in the same transaction.
 */
export const storeGuards: readonly string[] = []
